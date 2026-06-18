# Hermes — an autonomous supervisor agent for SigmaLink

**Hermes** is *any* MCP-capable agent (here: a Claude Code instance) pointed at the
[`sigma-control-mcp`](../../README.md) bridge and given a **supervisor system prompt** + a **mission**.
SigmaLink hosts no brain — Hermes runs wherever you run it and drives SigmaLink through the tool surface,
exactly like a human operator, so it can "develop across workspaces while you're away."

This is a *starter template*, not a turnkey product. You bring the agent runtime; this shows how to wire it.

## How it works

```
You ──mission──▶ Hermes (a Claude Code agent)
                   │  uses the sigmalink MCP (this bridge)
                   ▼
                 SigmaLink  ──▶ opens workspaces, launches coder panes, supervises them
                   │
                   └── irreversible actions ESCALATE back to you (Telegram / in-app approve)
```

Hermes's loop (it drives itself — you don't hand-code it):

1. `get_app_state` — orient: which workspaces are open, which panes exist, who's waiting for input.
2. `open_workspace` / `switch_workspace` — go to the repo it should work in.
3. `launch_pane` (provider `claude`/`codex`/…) with an `initialPrompt` — spawn a coder on a sub-task.
4. `wait_for_pane({ sessionIds, until: 'prompt' | 'idle' | 'exit' })` — block until a coder needs input or finishes (multiplex several at once).
5. `read_pane_since` — read what happened; decide the next step.
6. `prompt_agent` — unblock / redirect the coder (one call submits).
7. Irreversible ops (`close_pane`, `close_workspace`, `kill_swarm`, shell input) → **escalate to you**; Hermes proceeds with the rest.
8. Update its notes (`create_memory`) and report.

## 1. Get your connection details

In SigmaLink: **Settings → External Control → Enable**, and copy the `SIGMA_CONTROL_SOCKET` + `SIGMA_CONTROL_TOKEN`.

## 2. Launch Hermes

```bash
export SIGMA_CONTROL_SOCKET='/path/to/control.sock'
export SIGMA_CONTROL_TOKEN='<token>'
./connect.sh "Triage the failing tests in ~/projects/acme and open a PR with fixes."
```

`connect.sh` registers the `sigmalink` MCP (via this bridge) and starts a Claude Code agent with
[`supervisor-system-prompt.md`](./supervisor-system-prompt.md) and your mission.

## Safety

Hermes operates under SigmaLink's **supervised autonomy**: reads + agent-directed work run freely; anything
irreversible escalates to you and fails closed. The **kill-switch** (Settings → External Control → Freeze)
denies every external call instantly. Start with small, well-scoped missions and watch the first runs.
