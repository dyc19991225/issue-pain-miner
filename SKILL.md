---
name: issue-pain-miner
description: Mine top-upvoted unresolved GitHub Issues of any open-source repository, cluster real user frustrations across 6 product-wedge dimensions, compute an Opportunity Score (0-100), and generate a Giant-Killer MVP product blueprint & coding prompt. Activate when researching product ideas, analyzing GitHub competitors, finding user pain points, or planning a better/lighter alternative to an existing repo.
---

# issue-pain-miner — GitHub Competitor Pain & Wedge Discovery Skill

Turn real user complaints inside any popular GitHub repository's open Issues into a validated, data-backed **Giant-Killer Product Spec**.

## Quick Commands

1. **Mine a target repository directly in CLI (Markdown output in ~3s)**:
   ```bash
   node "e:/ai/issue-pain-miner/bin/pain-miner.mjs" analyze <owner/repo>
   ```
2. **Mine + invoke local Claude/Codex Strategist for a full Giant-Killer PRD**:
   ```bash
   node "e:/ai/issue-pain-miner/bin/pain-miner.mjs" analyze <owner/repo> --ai claude
   ```
3. **Launch the Interactive Visual Intelligence Studio (`http://127.0.0.1:4795/`)**:
   ```bash
   node "e:/ai/issue-pain-miner/bin/pain-miner.mjs" up --port 4795
   ```

## Workflow When Asked to Find Product Ideas or Analyze a Competitor

1. Run `pain-miner.mjs analyze <owner/repo>` using the authenticated `gh` CLI.
2. Inspect the **Opportunity Score (0–100)**, **Top-10 Unresolved 👍 Votes**, **Average Stale Days**, and the **6 Pain Wedge Clusters** (`missing_feature`, `setup_os`, `bloat_perf`, `cloud_paywall`, `bug_crash`, `ux_dx`).
3. Cite exact `#Issue` numbers, reaction counts, and verbatim user complaint quotes when proposing a sharper, zero-bloat MVP wedge.
