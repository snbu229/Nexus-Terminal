#!/usr/bin/env bash
# NX2-002 · tmux versus Herdr live-session reattach prototype.
#
# Brings up 2 disposable Linux nodes (Debian 13, Ubuntu 24.04) and a gateway
# container, starts one tmux and one Herdr session per node as uid 2001, then
# drives these events against all four sessions at once:
#
#   E1 browser close     gateway closes its SSH attach channel cleanly
#   E2 gateway restart   gateway container is SIGKILLed and restarted
#   E3 network outage    both nodes are disconnected from the network
#   E4 output burst      BURST_LINES lines at once while attached
#   E5 second user       uid 2002 tries to reach uid 2001's session socket
#   E6 host reboot       node containers restart: honest "process lost" check
#
# Results land in results/<UTC timestamp>/ (summary.md, summary.json, raw/).
# Requires on the host: Docker Engine with compose v2, ssh-keygen, python3.
# Nothing is published to host ports; `docker compose down -v` runs at the end
# unless KEEP=1.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
DETACH_SECS=${DETACH_SECS:-10}
OUTAGE_SECS=${OUTAGE_SECS:-40}
BURST_LINES=${BURST_LINES:-5000}
BACKFILL_LINES=${BACKFILL_LINES:-20000}
NODES=(node1 node2)
MUXES=(tmux herdr)

if [ "${1:-}" = "--self-test" ]; then
  cd "$HERE/lib" && exec python3 -m unittest -v test_check_continuity test_summarize
fi

TS=$(date -u +%Y%m%dT%H%M%SZ)
export NX_RUN_DIR="$HERE/results/$TS"
RAW="$NX_RUN_DIR/raw"
mkdir -p "$NX_RUN_DIR/keys/pub" "$NX_RUN_DIR/keys/priv" "$RAW"
DC=(docker compose -f "$HERE/compose.yaml" -p nx-reattach)
NET=nx-reattach_nxnet

now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
event() { # event <name> [json-detail]
  local ms; ms=$(now_ms)
  printf '{"ms":%s,"event":"%s","detail":%s}\n' "$ms" "$1" "${2:-null}" >> "$NX_RUN_DIR/events.jsonl"
  printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$1" >&2
}

gw()      { "${DC[@]}" exec -T -u gw gateway "$@"; }
SSH_OPTS="-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/home/gw/.ssh/known_hosts -o ConnectTimeout=5"
on()      { local user=$1 node=$2; shift 2; gw ssh $SSH_OPTS -i "/home/gw/.ssh/$user" "$user@$node" /opt/nx/remote.sh "$@"; }
sid()     { printf 'nx-%s' "$1"; }

cleanup() {
  if [ "${KEEP:-0}" != 1 ]; then
    "${DC[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$NX_RUN_DIR/keys"   # throwaway SSH keys never outlive the run
  fi
}
trap cleanup EXIT

wait_ssh() {
  local node=$1
  for _ in $(seq 1 60); do
    gw ssh $SSH_OPTS -i /home/gw/.ssh/alice "alice@$node" true 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

snapshot() { # snapshot <label>: status of every session as the owner
  local label=$1 node mux
  for node in "${NODES[@]}"; do for mux in "${MUXES[@]}"; do
    on alice "$node" status "$mux" "$(sid "$mux")" > "$RAW/status-$label-$node-$mux.json" 2>>"$RAW/errors.log" \
      || echo '{"error":"status failed"}' > "$RAW/status-$label-$node-$mux.json"
  done; done
}

attach_all() {
  local node mux f lines
  for node in "${NODES[@]}"; do for mux in "${MUXES[@]}"; do
    f="/capture/$node-$mux.stream"
    lines=$(gw sh -c "touch $f; wc -l < $f")
    event "attach" "{\"node\":\"$node\",\"mux\":\"$mux\",\"from_line\":$lines}"
    "${DC[@]}" exec -d -u gw gateway python3 /opt/nx/gateway.py "$node" "$mux" "$(sid "$mux")" "$f"
  done; done
}

detach_all() { # browser close: SIGTERM -> gateway.py forwards to ssh -> channel closes cleanly
  gw pkill -TERM -f 'gateway.py' || true
  sleep 1
}

backfill_all() {
  local label=$1 node mux
  for node in "${NODES[@]}"; do for mux in "${MUXES[@]}"; do
    on alice "$node" backfill "$mux" "$(sid "$mux")" "$BACKFILL_LINES" > "$RAW/backfill-$label-$node-$mux.txt" 2>>"$RAW/errors.log" || true
  done; done
}

collect_logs() {
  local label=$1 node mux
  for node in "${NODES[@]}"; do for mux in "${MUXES[@]}"; do
    gw ssh $SSH_OPTS -i /home/gw/.ssh/alice "alice@$node" cat ".nx-proto/$(sid "$mux").truth" > "$RAW/truth-$label-$node-$mux.txt" 2>>"$RAW/errors.log" || true
    on alice "$node" log "$mux" "$(sid "$mux")" > "$RAW/log-$label-$node-$mux.txt" 2>>"$RAW/errors.log" || true
  done
    gw ssh $SSH_OPTS -i /home/gw/.ssh/alice "alice@$node" 'cat ~/.config/herdr/herdr*.log ~/.config/herdr/sessions/*/herdr*.log 2>/dev/null' > "$RAW/herdr-logs-$label-$node.txt" || true
  done
}

# --- setup -------------------------------------------------------------------
for u in alice bob; do
  ssh-keygen -q -t ed25519 -N '' -C "nx-proto-$u-$TS" -f "$NX_RUN_DIR/keys/priv/$u"
  cp "$NX_RUN_DIR/keys/priv/$u.pub" "$NX_RUN_DIR/keys/pub/$u.pub"
done
event "build"
"${DC[@]}" build >"$RAW/build.log" 2>&1
"${DC[@]}" up -d >>"$RAW/build.log" 2>&1
for u in alice bob; do
  "${DC[@]}" cp "$NX_RUN_DIR/keys/priv/$u" "gateway:/home/gw/.ssh/$u"
done
"${DC[@]}" exec -T -u 0 gateway sh -c 'chown gw:gw /home/gw/.ssh/* && chmod 0600 /home/gw/.ssh/*'
for node in "${NODES[@]}"; do wait_ssh "$node" || { echo "sshd on $node not reachable" >&2; exit 1; }; done

{
  echo "{"
  echo "\"run\":\"$TS\",\"host_uname\":\"$(uname -srm)\",\"docker\":\"$(docker version --format '{{.Server.Version}}' 2>/dev/null)\","
  for node in "${NODES[@]}"; do
    echo "\"$node\":{\"os\":\"$(gw ssh $SSH_OPTS -i /home/gw/.ssh/alice "alice@$node" '. /etc/os-release; echo $PRETTY_NAME')\",\"kernel\":\"$(gw ssh $SSH_OPTS -i /home/gw/.ssh/alice "alice@$node" 'uname -rm')\",\"tmux\":\"$(gw ssh $SSH_OPTS -i /home/gw/.ssh/alice "alice@$node" 'tmux -V')\",\"herdr\":\"$(gw ssh $SSH_OPTS -i /home/gw/.ssh/alice "alice@$node" 'herdr --version 2>&1 | head -n1')\",\"openssh\":\"$(gw ssh $SSH_OPTS -i /home/gw/.ssh/alice "alice@$node" 'ssh -V 2>&1')\"},"
  done
  echo "\"params\":{\"DETACH_SECS\":$DETACH_SECS,\"OUTAGE_SECS\":$OUTAGE_SECS,\"BURST_LINES\":$BURST_LINES,\"BACKFILL_LINES\":$BACKFILL_LINES}"
  echo "}"
} > "$NX_RUN_DIR/environment.json"

for node in "${NODES[@]}"; do for mux in "${MUXES[@]}"; do
  if on alice "$node" start "$mux" "$(sid "$mux")" >>"$RAW/start-$node-$mux.log" 2>&1; then
    event "start_ok" "{\"node\":\"$node\",\"mux\":\"$mux\"}"
  else
    event "start_failed" "{\"node\":\"$node\",\"mux\":\"$mux\"}"
  fi
done; done
sleep 3
snapshot baseline
attach_all
sleep 5

# --- E1 browser close --------------------------------------------------------
event "E1_browser_close_begin"
detach_all
sleep "$DETACH_SECS"
snapshot E1
event "E1_reattach"
attach_all
sleep 5
backfill_all E1
event "E1_end"

# --- E2 gateway restart ------------------------------------------------------
event "E2_gateway_restart_begin"
"${DC[@]}" kill -s SIGKILL gateway >/dev/null
"${DC[@]}" start gateway >/dev/null
for node in "${NODES[@]}"; do wait_ssh "$node"; done
snapshot E2
event "E2_reattach"
attach_all
sleep 5
backfill_all E2
event "E2_end"

# --- E3 network outage -------------------------------------------------------
event "E3_outage_begin" "{\"secs\":$OUTAGE_SECS}"
for node in "${NODES[@]}"; do docker network disconnect "$NET" "$("${DC[@]}" ps -q "$node")"; done
sleep "$OUTAGE_SECS"
for node in "${NODES[@]}"; do docker network connect --alias "$node" "$NET" "$("${DC[@]}" ps -q "$node")"; done
event "E3_network_restored"
for node in "${NODES[@]}"; do wait_ssh "$node"; done
snapshot E3
event "E3_reattach"
attach_all
sleep 5
backfill_all E3
event "E3_end"

# --- E4 output burst ---------------------------------------------------------
event "E4_burst_begin" "{\"lines\":$BURST_LINES}"
for node in "${NODES[@]}"; do for mux in "${MUXES[@]}"; do
  on alice "$node" burst "$(sid "$mux")" "$BURST_LINES" || true
done; done
sleep 10
backfill_all E4
event "E4_end"

# --- E5 second user ----------------------------------------------------------
for node in "${NODES[@]}"; do for mux in "${MUXES[@]}"; do
  on bob "$node" probe-foreign "$mux" alice "$(sid "$mux")" > "$RAW/foreign-$node-$mux.json" 2>>"$RAW/errors.log" \
    || echo '{"error":"probe failed to run"}' > "$RAW/foreign-$node-$mux.json"
done; done
event "E5_done"

collect_logs pre_reboot
detach_all
"${DC[@]}" cp gateway:/capture/. "$RAW/capture/" >/dev/null

# --- E6 host reboot ----------------------------------------------------------
event "E6_reboot_begin"
"${DC[@]}" restart -t 5 "${NODES[@]}" >/dev/null
for node in "${NODES[@]}"; do wait_ssh "$node"; done
snapshot E6
# Herdr: start the server again and see what snapshot restore brings back.
for node in "${NODES[@]}"; do
  gw ssh $SSH_OPTS -i /home/gw/.ssh/alice "alice@$node" \
    'HERDR_SESSION=nx-herdr setsid nohup herdr server >/dev/null 2>&1 </dev/null & sleep 5' || true
done
snapshot E6_herdr_restarted
collect_logs post_reboot
event "E6_end"

"${DC[@]}" logs --no-color node1 node2 > "$RAW/sshd.log" 2>&1 || true
python3 "$HERE/summarize.py" "$NX_RUN_DIR"
echo "results: $NX_RUN_DIR/summary.md"
