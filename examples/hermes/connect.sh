#!/usr/bin/env bash
# Stand up a Hermes supervisor agent that drives SigmaLink via the sigma-control MCP.
#
#   export SIGMA_CONTROL_SOCKET='/path/to/control.sock'
#   export SIGMA_CONTROL_TOKEN='<token>'
#   ./connect.sh "your mission, e.g. fix the failing tests in ~/projects/acme"
#
# Requires the `claude` CLI. Adjust for OpenClaw / another MCP runtime as needed.
set -euo pipefail

: "${SIGMA_CONTROL_SOCKET:?set SIGMA_CONTROL_SOCKET (Settings → External Control)}"
: "${SIGMA_CONTROL_TOKEN:?set SIGMA_CONTROL_TOKEN (Settings → External Control)}"

MISSION="${1:?usage: ./connect.sh \"<mission>\"}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SYSTEM_PROMPT="$(cat "$HERE/supervisor-system-prompt.md")"

# Register the SigmaLink control plane as an MCP server (run straight from GitHub).
claude mcp add sigmalink \
  -e SIGMA_CONTROL_SOCKET="$SIGMA_CONTROL_SOCKET" \
  -e SIGMA_CONTROL_TOKEN="$SIGMA_CONTROL_TOKEN" \
  -e SIGMA_CONTROL_LABEL="hermes" \
  -- npx -y github:s1gmamale1/Sigma-Control

# Start the supervisor. (Flags are illustrative — match your `claude` CLI version.)
exec claude \
  --append-system-prompt "$SYSTEM_PROMPT" \
  "Mission: $MISSION

Begin by calling get_app_state to orient yourself, then plan and execute. Escalate irreversible actions."
