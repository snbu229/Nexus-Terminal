#!/bin/sh
# Installs the throwaway public keys mounted from the run directory, generates
# per-container host keys, and runs sshd in the foreground. The gateway role
# skips sshd and idles so run.sh can exec into it.
set -eu

if [ "${NX_ROLE:-node}" = "gateway" ]; then
  exec sleep infinity
fi

ssh-keygen -A >/dev/null
for u in alice bob; do
  install -d -m 0700 -o "$u" -g "$u" "/home/$u/.ssh"
  install -m 0600 -o "$u" -g "$u" "/keys/$u.pub" "/home/$u/.ssh/authorized_keys"
done
# sshd logs to stderr so `docker compose logs` captures connect/disconnect lines.
exec /usr/sbin/sshd -D -e
