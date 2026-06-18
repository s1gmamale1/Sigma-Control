#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/server.ts
var import_node_net = __toESM(require("node:net"));
var import_node_process = __toESM(require("node:process"));
var import_node_readline = __toESM(require("node:readline"));
var import_node_crypto = require("node:crypto");
var SIGMA_CONTROL_PROTOCOL = 1;
function mapCatalogueToMcpTools(entries) {
  return entries.map((e) => ({
    name: e.name,
    description: e.description,
    inputSchema: {
      type: "object",
      ...typeof e.inputSchema === "object" && e.inputSchema !== null ? e.inputSchema : {}
    }
  }));
}
function wrapInvokeResult(out) {
  const payload = out.ok ? out.result : { error: out.error ?? "unknown error", result: out.result };
  const text = typeof payload === "string" ? payload : JSON.stringify(payload ?? null, null, 2);
  return {
    content: [{ type: "text", text }],
    isError: !out.ok
  };
}
var ControlClient = class {
  socket = null;
  connecting = null;
  pending = /* @__PURE__ */ new Map();
  buf = "";
  socketPath;
  constructor(socketPath) {
    this.socketPath = socketPath;
  }
  /** Connect to the control socket and complete the control.hello handshake. */
  async connect(token, label) {
    await this.ensureSocket();
    const result = await this.rpc("control.hello", { token, label, protocol: SIGMA_CONTROL_PROTOCOL });
    const ok = result?.ok;
    if (!ok) throw new Error("control.hello rejected by host");
  }
  /** Send tools.list and return the raw result. */
  async toolsList() {
    return this.rpc("tools.list", {});
  }
  /** Send tools.invoke. Origin is forced server-side; do NOT send it. */
  async toolsInvoke(name, args) {
    return this.rpc("tools.invoke", { name, args });
  }
  async ensureSocket() {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const socket = import_node_net.default.createConnection(this.socketPath, () => {
        socket.off("error", reject);
        this.socket = socket;
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => this.onData(chunk));
        socket.on("close", () => this.onClose());
        socket.on("error", (err) => {
          writeStderr(`control bridge socket error: ${err.message}`);
        });
        resolve();
      });
      socket.once("error", (err) => {
        socket.destroy();
        reject(err);
      });
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }
  async rpc(method, params) {
    await this.ensureSocket();
    const socket = this.socket;
    if (!socket || socket.destroyed) throw new Error("control socket not connected");
    const id = (0, import_node_crypto.randomUUID)();
    const req = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      socket.write(JSON.stringify(req) + "\n", (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }
  onData(chunk) {
    this.buf += chunk;
    let nl = this.buf.indexOf("\n");
    while (nl !== -1) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      nl = this.buf.indexOf("\n");
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const resp = JSON.parse(trimmed);
        const pending = this.pending.get(resp.id);
        if (!pending) continue;
        this.pending.delete(resp.id);
        if (resp.error) {
          pending.reject(new Error(resp.error.message));
        } else {
          pending.resolve(resp.result);
        }
      } catch (err) {
        writeStderr(
          `control bridge response parse failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
  onClose() {
    this.socket = null;
    for (const [id, p] of this.pending) {
      p.reject(new Error("control socket closed"));
      this.pending.delete(id);
    }
  }
  destroy() {
    try {
      this.socket?.destroy();
    } catch {
    }
    this.socket = null;
  }
};
var MCP_PROTOCOL_VERSION = "2024-11-05";
async function handleControlMcpLine(line, deps) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch (err) {
    sendError(deps, null, -32700, `Parse error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    sendError(deps, req.id ?? null, -32600, "Invalid Request");
    return;
  }
  const id = req.id ?? null;
  try {
    switch (req.method) {
      case "initialize":
        sendResult(deps, id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "sigmalink-control", version: "0.1.0" }
        });
        return;
      case "initialized":
      case "notifications/initialized":
        return;
      case "ping":
        sendResult(deps, id, {});
        return;
      case "tools/list": {
        const rawResult = await deps.client.toolsList();
        const tools = rawResult?.tools ?? [];
        sendResult(deps, id, { tools: mapCatalogueToMcpTools(tools) });
        return;
      }
      case "tools/call": {
        const params = req.params;
        const name = params?.name;
        const args = params?.arguments ?? {};
        if (typeof name !== "string") {
          sendError(deps, id, -32602, "tools/call requires { name }");
          return;
        }
        const raw = await deps.client.toolsInvoke(name, args);
        const out = raw;
        const wrapped = wrapInvokeResult(
          out ?? { ok: false, result: null, error: "no response from host" }
        );
        sendResult(deps, id, wrapped);
        return;
      }
      default:
        sendError(deps, id, -32601, `Method not found: ${req.method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(deps, id, -32e3, message);
  }
}
function sendResult(deps, id, result) {
  const payload = { jsonrpc: "2.0", id, result };
  (deps.write ?? writeStdout)(JSON.stringify(payload) + "\n");
}
function sendError(deps, id, code, message) {
  const payload = { jsonrpc: "2.0", id, error: { code, message } };
  (deps.write ?? writeStdout)(JSON.stringify(payload) + "\n");
}
function writeStdout(s) {
  import_node_process.default.stdout.write(s);
}
function writeStderr(msg) {
  import_node_process.default.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
}
async function main() {
  const socketPath = import_node_process.default.env.SIGMA_CONTROL_SOCKET;
  if (!socketPath) {
    writeStderr("sigma-control: SIGMA_CONTROL_SOCKET env var is required");
    import_node_process.default.exit(1);
  }
  const token = import_node_process.default.env.SIGMA_CONTROL_TOKEN;
  if (!token) {
    writeStderr("sigma-control: SIGMA_CONTROL_TOKEN env var is required");
    import_node_process.default.exit(1);
  }
  const label = import_node_process.default.env.SIGMA_CONTROL_LABEL ?? "external";
  const client = new ControlClient(socketPath);
  try {
    await client.connect(token, label);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeStderr(`sigma-control: handshake failed: ${msg}`);
    writeStdout(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: `sigma-control: handshake failed: ${msg}` }
      }) + "\n"
    );
    import_node_process.default.exit(1);
  }
  const deps = { client };
  let pending = 0;
  let stdinClosed = false;
  const checkExit = () => {
    if (stdinClosed && pending === 0) {
      client.destroy();
      import_node_process.default.exit(0);
    }
  };
  const rl = import_node_readline.default.createInterface({ input: import_node_process.default.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    pending += 1;
    handleControlMcpLine(line, deps).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      writeStderr("sigma-control line handler crashed: " + message);
    }).finally(() => {
      pending -= 1;
      checkExit();
    });
  });
  rl.on("close", () => {
    stdinClosed = true;
    checkExit();
  });
}

// src/index.ts
main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write("sigma-control failed to start: " + message + "\n");
  process.exit(1);
});
