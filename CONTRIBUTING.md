# Contributing to Nexus Terminal

## Licence

Nexus Terminal original source is licensed under the [Apache License 2.0](LICENSE)
(SPDX `Apache-2.0`). By contributing, you agree that your contribution is
licensed under the same terms. See [NOTICE](NOTICE) for attribution.

## Developer Certificate of Origin (DCO)

Every commit must be signed off under the [Developer Certificate of Origin 1.1](DCO).
The sign-off certifies that you wrote the change, or otherwise have the right
to submit it under the project licence.

Add a `Signed-off-by` trailer that matches the commit author:

```text
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` adds it for you. A pull request with an unsigned commit is not
merged until the commit is amended or re-signed. There is no separate
Contributor Licence Agreement (CLA).

## Third-party code

- Do not copy code from AGPL projects (for example HAPI, Grafana, MinIO) or
  from proprietary products (for example Warp, Teleport). Follow the clean-room
  rules in
  [`CLEAN_ROOM_RESEARCH_PLAYBOOK.md`](docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/CLEAN_ROOM_RESEARCH_PLAYBOOK.md).
- Do not relicense third-party code. Third-party files keep their own licence
  headers and notices.
- Every new dependency needs a reviewed row in the licence ledger
  (`docs/research/license-ledger.md`) before it is adopted.
