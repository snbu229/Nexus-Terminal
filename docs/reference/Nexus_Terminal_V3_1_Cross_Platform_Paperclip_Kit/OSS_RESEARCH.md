# Open-source due diligence and adopt/build decisions

| Component | What to evaluate | Decision | Status/license caveat |
|---|---|---|---|
| [Termix](https://github.com/Termix-SSH/Termix) | SSH, SFTP, tabs, remote management, plugin architecture | Benchmark UX/API; reuse ideas or compliant code only | Apache-2.0 per project README; review current plugin licenses |
| [Herdr](https://github.com/herdrdev/herdr) | Terminal-native agent multiplexing, background sessions, remote reattach, status/socket API | Optional plugin/provider, not only persistence foundation | Review repo's *current* license (some forks differ); check AGPL obligations if distributing/networking |
| [Happier](https://github.com/happier-dev/happier) | Cross-device agent sessions, self-hostable encrypted relay, phone-based approvals | Most useful reference for mobile agent sessions; evaluate adapter | MIT per project; integration vs separate app must be decided |
| [HAPI](https://hapi.run/docs/guide/agents) | ACP remote control and permission UX for multi-harness sessions | Evaluate integration contract, not mandatory core | AGPL-3.0-only per FAQ; ensure compliant reuse |
| [Paperclip](https://github.com/paperclipai/paperclip) | Goal/issue/agent governance and execution policies | Use to **build** Nexus, optional Paperclip external connector later | MIT; agents wake in heartbeats and are not permanent terminal daemon |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Self-hostable CLI automation and agent skills | Optional harness adapter | Verify repo's current license and model/provider auth |
| [OpenCode](https://opencode.ai/) | Multi-provider coding harness and ACP | First open-source coding harness | Validate ACP version and auth adapters |
| [ACP](https://agentclientprotocol.com/) | Session lifecycle, tool call streams, permission requests | First-class agent protocol; feature-detect resume per provider | Standard; ACP version negotiated at runtime |
| [MCP](https://modelcontextprotocol.io/) | Agent-exposed tooling and resources | Build scoped MCP gateway (not unrestricted SSH-as-tool) | Validate OAuth, trust boundary and tool permissions |
| [xterm.js](https://xtermjs.org/) | Browser terminal rendering, resize, keyboard, accessibility | Adopt frontend terminal | MIT; renderer is not a remote session store |
| [OpenSSH](https://www.openssh.com/) | SSH/SFTP security and host key verification | Adopt protocol/server as host prerequisite | Native SSH runs independent of Nexus |
| [tmux](https://github.com/tmux/tmux) | Detached PTY persistence and same session reattachment | Default PTY backend for Linux hosts | Verify distro package compatibility |
| [Zellij](https://zellij.dev/) | User-facing sessions and panes | Optional alternate multiplexer | Session adapter supported only after tests |
| [Headscale](https://headscale.net/) / WireGuard | LAN-to-cloud connectivity without public SSH | Preferred overlay alternative where permitted | BSD-3-Clause Headscale, narrow single-tailnet scope; independently validate client support |
| [MeshCentral](https://meshcentral.com/) | Remote host fleet and agent-based connectivity | Evaluate only, not required for MVP | Audit integration/privilege implications |
| [Apache Guacamole](https://guacamole.apache.org/) | Browser RDP/VNC/SSH | Optional desktop-access integration | Apache-2.0; separate security boundary |
| [ToolHive](https://github.com/stacklok/toolhive) | Manage/secure MCP servers | Evaluate for MCP registry and isolated tools | Apache-2.0; introduce only if lower complexity than custom gateway |
| [Temporal](https://github.com/temporalio/temporal) | Durable workflows, signal-awaiting approvals, reliable retries | Adopt for release 2 or use early for approvals if team can operate it | MIT; increases operational services; no magic process-resurrection |
| [ntfy](https://docs.ntfy.sh/) | Self-host mobile push notifications / PWA | Initial push channel with minimal sensitive content | iOS instant delivery may depend on APNs/upstream; verify deployment |
| [Gotify](https://gotify.net/) | Self-hosted push notifications | Android-friendly optional notification adapter | Avoid making app actions directly executable from push payloads |
| [Prometheus](https://prometheus.io/) / [Grafana](https://grafana.com/oss/grafana/) | Metrics and dashboards | Adopt monitoring | Review licenses for chosen versions |
| [Proxmox VE](https://pve.proxmox.com/) | Local VM lifecycle via API | First VM provider | Separate hypervisor credentials |
| [AWS EC2](https://docs.aws.amazon.com/ec2/) | Cloud VM inventory/lifecycle | Cloud VM provider | AWS service itself is not open source; adapter is ours |

**Important:** Claude Code and Anthropic's Claude models are **proprietary services**, even if your application, connector, agent management and toolchain are open source. A fully offline deployment needs an additional local-model/harness adapter; do not claim proprietary models are open-source components.

## P0 mandatory research deliverables
- Compare Termix, Herdr, Happier, HAPI, Hermes, Paperclip, OpenCode/ACP, SSH multiplexers, mobile notifications with a test matrix.
- License ledger with exact dependency/version/commit, SPDX, notices, AGPL obligations and alternatives. No wholesale copying of any competitor UI/assets.
- Test first party `tmux` + ACP prototype against Herdr/Happier/HAPI on two Linux hosts and phone, with a simulated outage. Establish whether a custom portable UI is still necessary.
- Security review of terminal escape control, PTY ownership, approval bypass, MCP privilege escalation and supply-chain trust.
