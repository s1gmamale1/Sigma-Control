import { describe, it, expect, vi } from 'vitest';
import {
  mapCatalogueToMcpTools,
  wrapInvokeResult,
  handleControlMcpLine,
  type ControlServerDeps,
  type HostToolEntry,
} from '../src/server';

describe('mapCatalogueToMcpTools', () => {
  it('maps host catalogue entries to MCP tool descriptors with an object inputSchema', () => {
    const entries: HostToolEntry[] = [
      { name: 'get_app_state', description: 'snapshot', inputSchema: { properties: { workspaceId: { type: 'string' } } } },
      { name: 'focus_pane', description: 'focus', inputSchema: { required: ['sessionId'], properties: { sessionId: { type: 'string' } } } },
    ];
    const out = mapCatalogueToMcpTools(entries);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      name: 'get_app_state',
      description: 'snapshot',
      inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' } } },
    });
    expect(out[1].inputSchema.required).toEqual(['sessionId']);
  });

  it('tolerates a non-object inputSchema', () => {
    const out = mapCatalogueToMcpTools([{ name: 'x', description: 'y', inputSchema: null as unknown as Record<string, unknown> }]);
    expect(out[0].inputSchema).toEqual({ type: 'object' });
  });
});

describe('wrapInvokeResult', () => {
  it('wraps an ok result as a non-error text block', () => {
    const w = wrapInvokeResult({ ok: true, result: { screen: 'hi' } });
    expect(w.isError).toBe(false);
    expect(w.content[0].text).toContain('"screen": "hi"');
  });

  it('wraps a failure as an error block carrying the message', () => {
    const w = wrapInvokeResult({ ok: false, result: null, error: 'kill_swarm needs approval' });
    expect(w.isError).toBe(true);
    expect(w.content[0].text).toContain('kill_swarm needs approval');
  });
});

function collect(): { deps: ControlServerDeps & { client: { toolsList: ReturnType<typeof vi.fn>; toolsInvoke: ReturnType<typeof vi.fn> } }; lines: () => unknown[] } {
  const out: string[] = [];
  const client = {
    toolsList: vi.fn(async () => ({ tools: [{ name: 'read_pane', description: 'read', inputSchema: { required: ['sessionId'], properties: { sessionId: { type: 'string' } } } }] })),
    toolsInvoke: vi.fn(async () => ({ ok: true, result: { screen: 'ok' } })),
  };
  return {
    deps: { client, write: (l: string) => out.push(l) },
    lines: () => out.map((l) => JSON.parse(l.trim())),
  };
}

describe('handleControlMcpLine', () => {
  it('answers initialize with the MCP serverInfo + capabilities', async () => {
    const { deps, lines } = collect();
    await handleControlMcpLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }), deps);
    const r = lines()[0] as { id: number; result: { serverInfo: { name: string }; protocolVersion: string } };
    expect(r.id).toBe(1);
    expect(r.result.serverInfo.name).toBe('sigmalink-control');
    expect(r.result.protocolVersion).toBe('2024-11-05');
  });

  it('tools/list maps the host catalogue', async () => {
    const { deps, lines } = collect();
    await handleControlMcpLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), deps);
    const r = lines()[0] as { result: { tools: Array<{ name: string; inputSchema: { type: string } }> } };
    expect(r.result.tools[0].name).toBe('read_pane');
    expect(r.result.tools[0].inputSchema.type).toBe('object');
  });

  it('tools/call forwards to toolsInvoke and wraps the result', async () => {
    const { deps, lines } = collect();
    await handleControlMcpLine(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_pane', arguments: { sessionId: 's1' } } }), deps);
    expect(deps.client.toolsInvoke).toHaveBeenCalledWith('read_pane', { sessionId: 's1' });
    const r = lines()[0] as { result: { isError: boolean } };
    expect(r.result.isError).toBe(false);
  });

  it('notifications/initialized produces no response', async () => {
    const { deps, lines } = collect();
    await handleControlMcpLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), deps);
    expect(lines()).toHaveLength(0);
  });

  it('unknown method returns a JSON-RPC method-not-found error', async () => {
    const { deps, lines } = collect();
    await handleControlMcpLine(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'frobnicate' }), deps);
    const r = lines()[0] as { error: { code: number } };
    expect(r.error.code).toBe(-32601);
  });

  it('malformed JSON returns a parse error', async () => {
    const { deps, lines } = collect();
    await handleControlMcpLine('{not json', deps);
    const r = lines()[0] as { error: { code: number } };
    expect(r.error.code).toBe(-32700);
  });
});
