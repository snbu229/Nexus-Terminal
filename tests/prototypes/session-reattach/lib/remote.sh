#!/bin/bash
# Node-side helper for the NX2-002 reattach prototype. Runs as the SSH login
# user (alice = owner, bob = second user). The gateway calls it over SSH, the
# same way a Nexus gateway/connector would call the multiplexer.
#
#   remote.sh start   <tmux|herdr> <id>      start a session running producer.py
#   remote.sh stream  <tmux|herdr> <id>      machine-readable live output (gateway attach)
#   remote.sh backfill <tmux|herdr> <id> <n> last n lines of history after reattach
#   remote.sh log     <tmux|herdr> <id>      durable per-pane output log, if the mux has one
#   remote.sh status  <tmux|herdr> <id>      JSON: liveness, pids, uids, socket ownership
#   remote.sh burst   <id> <lines>           ask producer for a burst of output
#   remote.sh start-exposed <tmux|herdr> <id>  idle session whose socket sits in a
#                                            traversable dir with mode 0666 (E5 server layer)
#   remote.sh probe   <tmux|herdr> <socket> <expect>  one CLI call against <socket>;
#                                            run as owner (control) and as bob (foreign)
#   remote.sh stop    <tmux|herdr> <id>
#
# Herdr CLI calls follow the v0.9.5 docs (socket-api, persistence-remote).
# Anything that fails is reported in JSON, never silently skipped.
#
# Liveness never comes from a multiplexer CLI call: a CLI that auto-starts a
# server would report a session it created itself. `status` decides liveness
# from whether something listens on the session socket (ss) before any CLI
# call, and only queries the CLI when a server was already listening.
set -u

STATE="$HOME/.nx-proto"
mkdir -p "$STATE"
chmod 0700 "$STATE"

mux=${2:-}
id=${3:-}

# Socket of a session. start-exposed records an override in $STATE/<id>.sockpath.
sock_for() {
  if [ -f "$STATE/$2.sockpath" ]; then cat "$STATE/$2.sockpath"
  elif [ "$1" = tmux ]; then printf '/tmp/tmux-%s/default' "$(id -u)"
  else printf '%s/.config/herdr/sessions/%s/herdr.sock' "$HOME" "$2"; fi
}

herdr_env() {
  export HERDR_SESSION="$1"
  if [ -f "$STATE/$1.sockpath" ]; then export HERDR_SOCKET_PATH; HERDR_SOCKET_PATH=$(cat "$STATE/$1.sockpath"); fi
}

tm() { # tmux against the session's socket (default location unless overridden)
  local id=$1; shift
  if [ -f "$STATE/$id.sockpath" ]; then tmux -S "$(cat "$STATE/$id.sockpath")" "$@"; else tmux "$@"; fi
}

listener() { # ss line of the process listening on unix socket $1, empty if none. No mux CLI involved.
  ss -xlpH 2>/dev/null | grep -F " $1 " | head -n1
}

herdr_pane() {
  # First pane of the session. Prefer a JSON pane_id; fall back to wN:pN text.
  local out
  out=$(herdr pane list --json 2>/dev/null || herdr pane list 2>/dev/null) || return 1
  printf '%s' "$out" | python3 -c '
import re, sys
t = sys.stdin.read()
m = re.search(r"\"pane_id\"\s*:\s*\"([^\"]+)\"", t) or re.search(r"\b(w[^\s:\"]*:p[0-9]+)\b", t)
print(m.group(1) if m else "")
'
}

producer_cmd() { printf 'python3 /opt/nx/producer.py %s/%s.truth 0.1' "$STATE" "$1"; }

producer_pid() { pgrep -u "$(id -u)" -f "producer.py $STATE/$1.truth" | head -n1; }

stat_json() {
  # path -> {"path","exists","owner_uid","mode"}; mode is octal permission bits.
  local p=$1
  if [ -e "$p" ]; then
    stat -c '{"path":"%n","exists":true,"owner_uid":%u,"mode":"%a","type":"%F"}' "$p"
  else
    printf '{"path":"%s","exists":false}' "$p"
  fi
}

case "${1:-}" in
start)
  rm -f "$STATE/$id.truth" "$STATE/$id.pipe.log"
  case "$mux" in
  tmux)
    printf 'set -g history-limit 50000\n' > "$STATE/tmux.conf"
    tmux -f "$STATE/tmux.conf" new-session -d -s "$id" -x 120 -y 40 "$(producer_cmd "$id")" || exit 1
    # Durable raw output log: every byte the pane writes, appended by the tmux server.
    tmux pipe-pane -t "$id" -o "cat >> $STATE/$id.pipe.log"
    ;;
  herdr)
    herdr_env "$id"
    # Detached server start: setsid so the SSH session that launched it is not
    # its controlling terminal (docs: the server also ignores SIGHUP).
    setsid nohup herdr server > "$STATE/$id.herdr-server.out" 2>&1 < /dev/null &
    for _ in $(seq 1 50); do
      [ -S "$HOME/.config/herdr/sessions/$id/herdr.sock" ] && break
      sleep 0.2
    done
    herdr workspace create --cwd "$HOME" --label "$id" > "$STATE/$id.ws.out" 2>&1 || { cat "$STATE/$id.ws.out" >&2; exit 1; }
    pane=$(herdr_pane)
    [ -n "$pane" ] || { echo "herdr: no pane id after workspace create" >&2; exit 1; }
    printf '%s\n' "$pane" > "$STATE/$id.pane"
    herdr pane run "$pane" "exec $(producer_cmd "$id")" || exit 1
    ;;
  *) echo "unknown mux $mux" >&2; exit 2 ;;
  esac
  ;;

stream)
  case "$mux" in
  # Control mode, read-only: %output lines with octal-escaped pane bytes.
  tmux)  exec tmux -C attach-session -r -t "$id" ;;
  # Read-only observer: NDJSON terminal.frame records with base64 ANSI bytes.
  herdr) herdr_env "$id"; exec herdr terminal session observe "$(cat "$STATE/$id.pane")" --cols 120 --rows 40 ;;
  esac
  ;;

backfill)
  n=${4:-2000}
  case "$mux" in
  tmux)  tmux capture-pane -p -J -S "-$n" -t "$id" ;;
  herdr) herdr_env "$id"; herdr pane read "$(cat "$STATE/$id.pane")" --source recent-unwrapped --lines "$n" ;;
  esac
  ;;

log)
  case "$mux" in
  tmux)  cat "$STATE/$id.pipe.log" ;;
  # No documented per-pane raw output log in Herdr v0.9.5. pane_history is
  # experimental, off by default and replayed only after restart.
  herdr) echo "no-native-pane-log" >&2; exit 3 ;;
  esac
  ;;

burst)
  # Here argv is: burst <id> <lines>
  printf '%s\n' "${3:-1000}" > "$STATE/$2.burst.tmp" && mv "$STATE/$2.burst.tmp" "$STATE/$2.truth.burst"
  ;;

status)
  uid=$(id -u)
  ppid_=$(producer_pid "$id")
  sock=$(sock_for "$mux" "$id"); sdir=$(dirname "$sock")
  # Pre-state, before any multiplexer CLI call.
  lst=$(listener "$sock")
  alive=false; [ -n "$lst" ] && alive=true
  command -v ss >/dev/null || alive=null   # no lookup possible: UNKNOWN, never "exited"
  spid=$(printf '%s' "$lst" | grep -o 'pid=[0-9]*' | head -n1 | cut -d= -f2)
  case "$mux" in
  tmux)  logf="$STATE/$id.pipe.log" ;;
  herdr) logf="$HOME/.config/herdr/herdr-server.log" ;;
  esac
  # Secondary signal, only when a server was already listening (cannot auto-start one).
  cli=null
  if [ "$alive" = true ]; then
    cli=false
    case "$mux" in
    tmux)  tm "$id" has-session -t "$id" >/dev/null 2>&1 && cli=true ;;
    herdr) (herdr_env "$id"; herdr pane list >/dev/null 2>&1) && cli=true ;;
    esac
  fi
  ps_json() {
    [ -n "$1" ] || { printf 'null'; return; }
    ps -o pid=,uid=,ppid=,lstart= -p "$1" 2>/dev/null | awk '{pid=$1; uid=$2; ppid=$3; $1=$2=$3=""; sub(/^ +/,""); printf "{\"pid\":%s,\"uid\":%s,\"ppid\":%s,\"started\":\"%s\"}", pid, uid, ppid, $0}' | grep . || printf 'null'
  }
  last=$(grep '^SEQ ' "$STATE/$id.truth" 2>/dev/null | tail -n1 | cut -d' ' -f2)
  printf '{"mux":"%s","id":"%s","login_uid":%s,"alive":%s,"liveness_source":"ss-listener-before-cli","cli_query_ok":%s,"server":%s,"producer":%s,"truth_last_seq":%s,"socket_dir":%s,"socket":%s,"log":%s,"state_dir":%s,"home":%s,"config_dir":%s,"ms":%s}\n' \
    "$mux" "$id" "$uid" "$alive" "$cli" "$(ps_json "$spid")" "$(ps_json "$ppid_")" "${last:-null}" \
    "$(stat_json "$sdir")" "$(stat_json "$sock")" "$(stat_json "$logf")" "$(stat_json "$STATE")" \
    "$(stat_json "$HOME")" "$(stat_json "$HOME/.config")" "$(date +%s%3N)"
  ;;

start-exposed)
  # E5 server layer: the socket sits in a directory anyone can traverse and is
  # world-writable, so only the server's own peer check can refuse bob.
  # Deliberately weak permissions, disposable test container only.
  d="/tmp/nx-exposed-$mux"
  install -d -m 0755 "$d"
  case "$mux" in
  tmux) sock="$d/tmux.sock" ;;
  herdr) sock="$d/herdr.sock" ;;
  esac
  printf '%s\n' "$sock" > "$STATE/$id.sockpath"
  case "$mux" in
  tmux)
    tm "$id" new-session -d -s "$id" -x 80 -y 24 "sleep 100000" || exit 1
    ;;
  herdr)
    herdr_env "$id"
    setsid nohup herdr server > "$STATE/$id.herdr-server.out" 2>&1 < /dev/null &
    for _ in $(seq 1 50); do [ -S "$sock" ] && break; sleep 0.2; done
    [ -S "$sock" ] || { echo "herdr: HERDR_SOCKET_PATH not honoured, no socket at $sock" >&2; exit 1; }
    herdr workspace create --cwd "$HOME" --label "$id" > "$STATE/$id.ws.out" 2>&1 || { cat "$STATE/$id.ws.out" >&2; exit 1; }
    pane=$(herdr_pane); [ -n "$pane" ] || { echo "herdr: no pane id" >&2; exit 1; }
    printf '%s\n' "$pane" > "$STATE/$id.pane"
    ;;
  esac
  chmod 0666 "$sock"
  ;;

expect)
  # Token a successful probe must print: tmux session name, Herdr pane id.
  case "$mux" in
  tmux) printf 'NXPROBE %s\n' "$id" ;;
  herdr) cat "$STATE/$id.pane" ;;
  esac
  ;;

probe)
  # Identical command for owner (positive control) and foreign user; graded by lib/probe.py.
  target=$3; expect=${4:-}
  servers() { pgrep -u "$(id -u)" -f "$([ "$mux" = tmux ] && echo '^tmux' || echo '^herdr server')" | sort | tr '\n' ' '; }
  before=$(servers)
  pre=$(stat -c '%u %a %F' "$target" 2>&1)
  case "$mux" in
  tmux)  out=$(tmux -S "$target" list-sessions -F 'NXPROBE #{session_name}' 2>&1); rc=$? ;;
  herdr) out=$(HERDR_SOCKET_PATH="$target" herdr pane list 2>&1); rc=$? ;;
  esac
  after=$(servers)
  python3 -c '
import json, sys
mux, uid, target, rc, expect, out, pre, before, after = sys.argv[1:10]
b, a = set(before.split()), set(after.split())
print(json.dumps({"mux": mux, "prober_uid": int(uid), "target": target, "target_stat_as_prober": pre,
                  "rc": int(rc), "expect": expect, "output": out[:400],
                  "prober_servers_after": sorted(a - b)}))' \
    "$mux" "$(id -u)" "$target" "$rc" "$expect" "$out" "$pre" "$before" "$after"
  ;;

stop)
  case "$mux" in
  tmux)  tm "$id" kill-session -t "$id" ;;
  herdr) herdr_env "$id"; herdr session stop "$id" ;;
  esac
  ;;

*)
  sed -n '2,25p' "$0"; exit 2 ;;
esac
