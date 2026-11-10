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
#   remote.sh probe-foreign <tmux|herdr> <owner> <id>   try to reach another user's session
#   remote.sh stop    <tmux|herdr> <id>
#
# Herdr CLI calls follow the v0.9.5 docs (socket-api, persistence-remote).
# Anything that fails is reported in JSON, never silently skipped.
set -u

STATE="$HOME/.nx-proto"
mkdir -p "$STATE"
chmod 0700 "$STATE"

mux=${2:-}
id=${3:-}

herdr_env() { export HERDR_SESSION="$1"; }

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
  case "$mux" in
  tmux)
    alive=false; tmux has-session -t "$id" 2>/dev/null && alive=true
    spid=$(tmux display-message -p -t "$id" '#{pid}' 2>/dev/null || true)
    sdir="/tmp/tmux-$uid"; sock="$sdir/default"; logf="$STATE/$id.pipe.log"
    ;;
  herdr)
    herdr_env "$id"
    alive=false; herdr pane list >/dev/null 2>&1 && alive=true
    sdir="$HOME/.config/herdr/sessions/$id"; sock="$sdir/herdr.sock"; logf="$HOME/.config/herdr/herdr-server.log"
    spid=$(pgrep -u "$uid" -f '^herdr server' | head -n1)
    ;;
  esac
  ps_json() {
    [ -n "$1" ] || { printf 'null'; return; }
    ps -o pid=,uid=,ppid=,lstart= -p "$1" 2>/dev/null | awk '{pid=$1; uid=$2; ppid=$3; $1=$2=$3=""; sub(/^ +/,""); printf "{\"pid\":%s,\"uid\":%s,\"ppid\":%s,\"started\":\"%s\"}", pid, uid, ppid, $0}' | grep . || printf 'null'
  }
  last=$(grep '^SEQ ' "$STATE/$id.truth" 2>/dev/null | tail -n1 | cut -d' ' -f2)
  printf '{"mux":"%s","id":"%s","login_uid":%s,"alive":%s,"server":%s,"producer":%s,"truth_last_seq":%s,"socket_dir":%s,"socket":%s,"log":%s,"state_dir":%s,"ms":%s}\n' \
    "$mux" "$id" "$uid" "$alive" "$(ps_json "$spid")" "$(ps_json "$ppid_")" "${last:-null}" \
    "$(stat_json "$sdir")" "$(stat_json "$sock")" "$(stat_json "$logf")" "$(stat_json "$STATE")" "$(date +%s%3N)"
  ;;

probe-foreign)
  owner=$3; id=$4
  ouid=$(id -u "$owner")
  case "$mux" in
  tmux)  target="/tmp/tmux-$ouid/default"; out=$(tmux -S "$target" list-sessions 2>&1); rc=$? ;;
  herdr) target="/home/$owner/.config/herdr/sessions/$id/herdr.sock"; out=$(HERDR_SOCKET_PATH="$target" herdr pane list 2>&1); rc=$? ;;
  esac
  denied=true; [ $rc -eq 0 ] && denied=false
  python3 -c 'import json,sys; print(json.dumps({"mux":sys.argv[1],"prober_uid":int(sys.argv[2]),"target":sys.argv[3],"rc":int(sys.argv[4]),"denied":sys.argv[5]=="true","output":sys.argv[6][:400]}))' \
    "$mux" "$(id -u)" "$target" "$rc" "$denied" "$out"
  ;;

stop)
  case "$mux" in
  tmux)  tmux kill-session -t "$id" ;;
  herdr) herdr_env "$id"; herdr session stop "$id" ;;
  esac
  ;;

*)
  sed -n '2,16p' "$0"; exit 2 ;;
esac
