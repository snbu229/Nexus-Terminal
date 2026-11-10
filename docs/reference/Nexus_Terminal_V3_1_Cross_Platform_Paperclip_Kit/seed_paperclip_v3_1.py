#!/usr/bin/env python3
"""Seed the Nexus V3.1 backlog into an EXISTING Paperclip company/project.

DRY RUN by default. No agents or company are created. For apply, requires a
board-level API token, company/project IDs and nine agent IDs.

Official API basis (check against your deployed version):
https://docs.paperclip.ing/reference/api/issues/
https://docs.paperclip.ing/guides/power/execution-policy/
"""
import argparse
import csv
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = Path(__file__).resolve().parent
TASKS = list(csv.DictReader((BASE / "BACKLOG.csv").open(encoding="utf-8")))
ROLE_ENV = {
    "ceo": "PAPERCLIP_CEO_AGENT_ID",
    "architect": "PAPERCLIP_ARCHITECT_AGENT_ID",
    "platform": "PAPERCLIP_PLATFORM_AGENT_ID",
    "agent": "PAPERCLIP_HARNESS_AGENT_ID",
    "frontend": "PAPERCLIP_FRONTEND_AGENT_ID",
    "qa": "PAPERCLIP_QA_AGENT_ID",
    "security": "PAPERCLIP_QA_AGENT_ID",  # same independent QA/Security reviewer
    "sre": "PAPERCLIP_SRE_AGENT_ID",
    "terminal": "PAPERCLIP_TERMINAL_AGENT_ID",
    "identity": "PAPERCLIP_IDENTITY_AGENT_ID",
}


def must_env(name):
    val = os.environ.get(name, "").strip()
    if not val:
        raise ValueError(f"Required environment variable not set: {name}")
    return val


def policy(row, agents, human_id):
    """C1 independent reviewer, C2 architect/CEO or human (sensitive)."""
    owner = row["owner"]
    reviewer = agents["qa"] if owner not in ("security", "qa") else agents["architect"]
    # avoid asking an author to approve their own work
    approver = agents["ceo"] if owner in ("architect", "qa", "security") else agents["architect"]
    if approver == reviewer or approver == agents[owner]:
        approver = agents["ceo"]
    stages = [{"type": "review", "participants": [{"type": "agent", "agentId": reviewer}]}]
    if row["risk"] == "sensitive":
        stages.append({"type": "approval", "participants": [{"type": "user", "userId": human_id}]})
    else:
        stages.append({"type": "approval", "participants": [{"type": "agent", "agentId": approver}]})
    return {"mode": "normal", "commentRequired": True, "stages": stages, "maxReviewRounds": 3}


def post(url, token, payload):
    request = Request(url, data=json.dumps(payload).encode("utf-8"),
                      headers={"Content-Type": "application/json",
                               "Authorization": f"Bearer {token}"}, method="POST")
    try:
        with urlopen(request, timeout=25) as res:
            return json.load(res)
    except HTTPError as ex:
        err = ex.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"HTTP {ex.code} from Paperclip: {err}") from ex
    except URLError as ex:
        raise RuntimeError(f"Cannot reach Paperclip: {ex.reason}") from ex


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Actually create issues; dry run otherwise")
    parser.add_argument("--confirm-create-issues", action="store_true", help="Explicit second opt-in when applying; may wake agents")
    parser.add_argument("--state-file", default=str(BASE / ".paperclip_seed_state.json"),
                        help="Tracks created IDs for safe re-runs; keep it secure")
    args = parser.parse_args()

    counts = {}
    for row in TASKS: counts[row["phase"]] = counts.get(row["phase"], 0) + 1
    print(f"Nexus task graph: {len(TASKS)} tasks in phases {counts}")
    if not args.apply:
        print("DRY RUN — no server changes. Example tasks:")
        for row in TASKS[:7]:
            print(f'  {row["id"]} [{row["owner"]}] {row["title"]} — after {row["depends_on"] or "none"}')
        print("To create these tasks, configure Paperclip environment IDs and run --apply.")
        return 0

    if not args.confirm_create_issues:
        raise ValueError("Apply requires --confirm-create-issues after board review")
    base = must_env("PAPERCLIP_URL").rstrip("/")
    if not (base.startswith("https://") or base.startswith("http://localhost:") or base == "http://localhost"):
        raise ValueError("Use HTTPS for non-local Paperclip API URLs")
    token = must_env("PAPERCLIP_API_TOKEN")
    company = must_env("PAPERCLIP_COMPANY_ID")
    project = must_env("PAPERCLIP_PROJECT_ID")
    human = must_env("PAPERCLIP_HUMAN_USER_ID")
    agents = {role: must_env(env) for role, env in ROLE_ENV.items()}
    state_file = Path(args.state_file)
    state = {"company": company, "project": project, "created": {}}
    if state_file.exists():
        prior = json.loads(state_file.read_text(encoding="utf-8"))
        if prior.get("company") != company or prior.get("project") != project:
            raise ValueError("Existing state file is for a different Paperclip company/project")
        state = prior
    created = state["created"]
    print("APPLY MODE: Creating assigned Paperclip issues; agents may wake immediately.")
    print("Tip: pause agents first if you want to inspect all created tasks before work starts.")
    for i, row in enumerate(TASKS, 1):
        key = row["id"]
        if key in created:
            print(f"[{i}/{len(TASKS)}] already recorded {key}")
            continue
        blockers = [s.strip() for s in row["depends_on"].split(",") if s.strip()]
        missing = [b for b in blockers if b not in created]
        if missing:
            raise ValueError(f"{key} has missing dependency IDs: {missing}")
        description = (f'**Blueprint task:** {key}\n\n'
                       f'**Phase:** {row["phase"]}\n\n'
                       f'**Acceptance:** {row["criteria"]}\n\n'
                       '**Definition of Done:** PR/commit or artifact; reproducible tests; '
                       'CI evidence; security and negative-case tests where relevant; '
                       'docs and rollback plan for operational changes. Cross-platform support requires OS and architecture evidence. '
                       'Never claim done without verifying acceptance.\n\n'
                       '**Operational rule:** No uncontrolled commands on production. '
                       'Sensitive changes require fresh human authorization; no agent may auto-approve actual production operations.')
        data = {
            "title": f'[{key}] {row["title"]}',
            "description": description,
            "status": "todo",
            "priority": "high" if row["risk"] == "sensitive" else "medium",
            "projectId": project,
            "assigneeAgentId": agents[row["owner"]],
            "blockedByIssueIds": [created[b] for b in blockers],
            "executionPolicy": policy(row, agents, human),
        }
        result = post(f"{base}/api/companies/{company}/issues", token, data)
        new_id = result.get("id")
        if not new_id:
            raise RuntimeError(f"Paperclip response for {key} had no issue ID; inspect server; NOT retrying automatically")
        created[key] = new_id
        state_file.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        state_file.chmod(0o600)
        print(f"[{i}/{len(TASKS)}] created {key} -> {result.get('identifier', new_id)}")
    print(f"Finished: {len(created)} issue IDs stored in {state_file}")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
