# NX2-002 session-reattach prototype: disposable test node / gateway image.
# Build arg BASE selects the distro; compose.yaml pins both bases by digest.
# Nothing here is a production artifact. Root is used only inside the
# disposable container so sshd can switch users; every multiplexer and
# workload process runs as an unprivileged test user.
ARG BASE
FROM ${BASE}

ARG HERDR_VERSION=0.9.5
# sha256 values published in https://herdr.dev/latest.json for v0.9.5 and
# independently re-hashed from the GitHub release assets on 2026-11-10.
ARG HERDR_SHA256_X86_64=14d9e8bc8b4a9e0118d77c32266f76d461f09b40342eb23752960bd89f59929d
ARG HERDR_SHA256_AARCH64=17d7536f2da50859523680ef279dffcac8e4a235f4e46fe8da6c2ec44141897c

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssh-server openssh-client tmux python3 procps iproute2 ca-certificates curl coreutils \
 && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
    case "$(uname -m)" in \
      x86_64)  asset=herdr-linux-x86_64;  sum="$HERDR_SHA256_X86_64" ;; \
      aarch64) asset=herdr-linux-aarch64; sum="$HERDR_SHA256_AARCH64" ;; \
      *) echo "unsupported arch $(uname -m)"; exit 1 ;; \
    esac; \
    curl -fsSL -o /usr/local/bin/herdr \
      "https://github.com/herdrdev/herdr/releases/download/v${HERDR_VERSION}/${asset}"; \
    echo "${sum}  /usr/local/bin/herdr" | sha256sum -c -; \
    chmod 0755 /usr/local/bin/herdr

# Two unprivileged test principals: alice owns the sessions, bob is the
# "second user" who must be denied. gw is the unprivileged gateway identity.
# Fixed uids make ownership checks exact.
RUN set -eu; \
    groupadd -g 2001 alice && useradd -m -u 2001 -g 2001 -s /bin/bash alice; \
    groupadd -g 2002 bob   && useradd -m -u 2002 -g 2002 -s /bin/bash bob; \
    groupadd -g 1999 gw    && useradd -m -u 1999 -g 1999 -s /bin/bash gw; \
    install -d -o gw -g gw -m 0700 /home/gw/.ssh; \
    install -d -o gw -g gw -m 0755 /capture; \
    mkdir -p /run/sshd; \
    sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config; \
    { echo 'PermitRootLogin no'; \
      echo 'ClientAliveInterval 5'; \
      echo 'ClientAliveCountMax 2'; \
      echo 'LogLevel VERBOSE'; } >> /etc/ssh/sshd_config

COPY lib/ /opt/nx/
RUN chmod 0755 /opt/nx/*.sh /opt/nx/*.py

COPY node-entrypoint.sh /usr/local/sbin/node-entrypoint.sh
RUN chmod 0755 /usr/local/sbin/node-entrypoint.sh
ENTRYPOINT ["/usr/local/sbin/node-entrypoint.sh"]
