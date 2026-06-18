# Sigma Control MCP

A standalone **MCP bridge** that lets external AI agents — a **Hermes** agent, **OpenClaw**, or a plain **Claude Code** instance — drive a running [SigmaLink](https://github.com/s1gmamale1/SigmaLink) the way a human operator does: read what's happening in every terminal, type into agents, open/close/switch workspaces, split/minimise panes, observe the whole app. It's the **Unity-MCP / Blender-MCP pattern**: the app exposes a control plane, and any external agent connects and operates it.

The bridge is a **thin, zero-dependency stdio↔socket relay**. It speaks MCP to the agent over stdio and forwards `initialize` / `tools/list` / `tools/call` to SigmaLink's Control socket. SigmaLink forces `origin:'external'` and gates dangerous/irreversible actions behind the operator's approval (supervised autonomy). Because it fetches `tools/list` **live**, it never needs updating when SigmaLink adds or changes tools.

```
External AI agent ──stdio──▶ sigma-control-mcp ──unix socket / pipe──▶ SigmaLink
 (Hermes / OpenClaw /          (this bridge)                            (Control MCP host;
  Claude Code)                                                          origin:'external')
```

## 1. Enable the control plane in SigmaLink

In the SigmaLink app: **Settings → External Control → Enable**. It shows a copyable connect command containing the **socket path** and a **bearer token**:

```
claude mcp add sigmalink \
  -e SIGMA_CONTROL_SOCKET='/path/to/control.sock' \
  -e SIGMA_CONTROL_TOKEN='<token>' \
  -- node '/…/electron-dist/mcp-sigma-control-server.cjs'
```

This bridge is the standalone, distributable replacement for that bundled `node …cjs` command.

## 2. Point any agent at this bridge

Run it straight from GitHub (no install, no build):

```bash
claude mcp add sigmalink \
  -e SIGMA_CONTROL_SOCKET='/path/to/control.sock' \
  -e SIGMA_CONTROL_TOKEN='<token>' \
  -- npx -y github:s1gmamale1/Sigma-Control
```

…or clone it once and reference the prebuilt file:

```bash
git clone https://github.com/s1gmamale1/Sigma-Control.git
claude mcp add sigmalink \
  -e SIGMA_CONTROL_SOCKET='/path/to/control.sock' \
  -e SIGMA_CONTROL_TOKEN='<token>' \
  -- node /path/to/Sigma-Control/dist/server.cjs
```

Restart the agent so it discovers the `sigmalink` MCP server, then it has the full SigmaLink toolset (`get_app_state`, `launch_pane`, `prompt_agent`, `split_pane`, `open_workspace`, …).

Any MCP client works — anything that can spawn an stdio MCP server. For a **Hermes** supervisor agent, see [`examples/hermes`](./examples/hermes).

## Environment variables

| Var | Required | Meaning |
|-----|----------|---------|
| `SIGMA_CONTROL_SOCKET` | yes | Unix socket path (macOS/Linux) or named pipe (Windows) — from the connect command. |
| `SIGMA_CONTROL_TOKEN`  | yes | Bearer token for the `control.hello` handshake — from the connect command. |
| `SIGMA_CONTROL_LABEL`  | no  | Human label shown in SigmaLink's audit/attribution (default `external`). Set per agent, e.g. `hermes`. |

## Security model

- **Local-only transport.** The bridge connects to a Unix socket / named pipe — local to the machine running SigmaLink. There is no network bind. (Remote access is a separate SigmaLink feature.)
- **Token handshake.** Every connection presents the bearer token before any tool call; a bad token is rejected and the socket closed.
- **`origin:'external'` is forced by the host** — a client cannot claim to be the in-app operator.
- **Supervised autonomy.** Read/observe and agent-directed actions run freely; irreversible/destructive actions (close pane/workspace, kill swarm, typing into a shell) **escalate to the operator** and fail closed on timeout. There is an operator **kill-switch** (freeze) that denies everything.
- The token grants control of the operator's machine via SigmaLink — **treat it like a credential**. Rotate it in Settings → External Control if it leaks.

## Development

```bash
npm run build       # esbuild → dist/server.cjs (committed; fetched via npx, no deps)
npm test            # vitest — pure mapper + MCP line-handler tests
npm run typecheck   # tsc --noEmit
```

The bridge has **no runtime dependencies** (Node ≥ 18 built-ins only). The committed `dist/server.cjs` is what runs, so `npx github:…` and `node dist/server.cjs` work with zero install.

## License

MIT — see [LICENSE](./LICENSE).
