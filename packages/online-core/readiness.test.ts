import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { probeHttp, waitForHttp } from '../../scripts/http-readiness.mjs';

describe('Phase 4A HTTP起動確認', () => {
  it('ログのフラグがなくても両方HTTP成功なら成功', async () => {
    expect(await waitForHttp({ webUrl: 'web', serverUrl: 'health', probe: async () => ({ ok: true, error: null }) })).toBe(true);
  });
  it('readyログが先に出ても実HTTPが遅れて成功するまで待つ', async () => {
    let rounds = 0;
    const probe = vi.fn(async () => ({ ok: ++rounds > 4, error: rounds > 4 ? null : 'まだ起動中' }));
    expect(await waitForHttp({ webUrl: 'web', serverUrl: 'health', intervalMs: 5, timeoutMs: 300, probe })).toBe(true);
    expect(probe.mock.calls.length).toBeGreaterThan(4);
  });
  it.each(['web', 'health'])('%sだけ失敗しても両方の診断とtimeoutを表示する', async failing => {
    const cleanup = vi.fn();
    await expect(waitForHttp({ webUrl: 'web:5174', serverUrl: 'health:3001', timeoutMs: 20, intervalMs: 5,
      probe: async url => ({ ok: !url.startsWith(failing), error: url.startsWith(failing) ? 'ECONNREFUSED' : null }),
      processes: () => [{ name: 'WEB_PORT', exitCode: null, pid: 123 }, { name: 'ONLINE_PORT', exitCode: 1, pid: 456 }], onTimeout: cleanup }))
      .rejects.toThrow(/timeout=20ms.*\nWeb: web:5174.*\nServer health: health:3001.*\nWEB_PORT: 実行中.*\nONLINE_PORT: 終了/s);
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it('timeoutで今回起動した子プロセスが終了する', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true });
    const closed = once(child, 'close');
    try {
      await expect(waitForHttp({ webUrl: 'web', serverUrl: 'health', timeoutMs: 20, intervalMs: 5,
        probe: async () => ({ ok: false, error: 'no HTTP' }), onTimeout: () => { child.kill(); } })).rejects.toThrow('最後のWeb確認: no HTTP');
      await closed;
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); }
  });
  it('停止指示後は起動成功/timeoutを報告しない', async () => {
    const abort = new AbortController(); abort.abort();
    expect(await waitForHttp({ webUrl: 'web', serverUrl: 'health', signal: abort.signal })).toBe(false);
  });
  it('実HTTPでHTMLとhealthを確認し、HTMLでないWeb応答は拒否する', async () => {
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', request.url === '/' ? 'text/html' : 'application/json');
      response.end(request.url === '/' ? '<!doctype html><html>ready</html>' : '{"ok":true}');
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      expect(await waitForHttp({ webUrl: `${url}/`, serverUrl: `${url}/health` })).toBe(true);
      expect((await probeHttp(`${url}/health`, true)).ok).toBe(false);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
