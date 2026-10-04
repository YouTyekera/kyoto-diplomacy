import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { selectPort, resolvePorts, childPlans, isPortFree, portError } from '../../scripts/online-startup.mjs';

describe('Phase 3B online startup', () => {
  it('空いている標準ポートを最初に選ぶ', async () => {
    const available = vi.fn(async () => true);
    expect(await resolvePorts({}, available)).toEqual({ webPort: 5173, onlinePort: 3001 });
    expect(available.mock.calls).toHaveLength(2);
  });
  it('使用中5173と3001をそれぞれ順にskipする', async () => {
    const available = vi.fn(async (port: number) => ![5173, 5174, 3001].includes(port));
    expect(await resolvePorts({}, available)).toEqual({ webPort: 5175, onlinePort: 3002 });
    expect(available.mock.calls.map(call => call[0])).toEqual([5173, 5174, 5175, 3001, 3002]);
  });
  it.each(['WEB_PORT', 'ONLINE_PORT'])('使用中の明示%sはfallbackせず対処を表示する', async name => {
    const port = name === 'WEB_PORT' ? 5180 : 3011;
    const available = vi.fn(async (candidate: number) => candidate !== port);
    await expect(resolvePorts({ [name]: String(port) }, available)).rejects.toThrow(portError(name, port));
    expect(available.mock.calls.map(call => call[0])).not.toContain(port + 1);
  });
  it('明示した実ポート・継承envをWeb引数と両方の子プロセスenvへ一致させる', async () => {
    const env = { WEB_PORT: '5180', ONLINE_PORT: '3011', WEB_HOST: '0.0.0.0', PATH: 'inherited' };
    const plans = childPlans(env, await resolvePorts(env, async () => true));
    for (const plan of plans) {
      expect(plan.env).toMatchObject(env);
      expect(plan.env.ONLINE_PORT).toBe('3011'); // Vite proxy and backend both read this variable.
      expect(plan.env.WEB_PORT).toBe('5180');
    }
    expect(plans[1].args).toEqual(['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '5180', '--strictPort']);
    expect(env).toEqual({ WEB_PORT: '5180', ONLINE_PORT: '3011', WEB_HOST: '0.0.0.0', PATH: 'inherited' });
  });
  it('自動選択したONLINE_PORTもproxy用envへ渡る', async () => {
    const ports = await resolvePorts({}, async port => ![5173, 3001].includes(port));
    for (const plan of childPlans({}, ports)) expect(plan.env).toMatchObject({ WEB_PORT: '5174', ONLINE_PORT: '3002' });
  });
  it('明示ポートを他方の自動選択で使わず、二重指定も拒否する', async () => {
    expect(await resolvePorts({ ONLINE_PORT: '5173' }, async () => true)).toEqual({ webPort: 5174, onlinePort: 5173 });
    expect(await resolvePorts({ WEB_PORT: '3001' }, async () => true)).toEqual({ webPort: 3001, onlinePort: 3002 });
    await expect(resolvePorts({ WEB_PORT: '5180', ONLINE_PORT: '5180' }, async () => true)).rejects.toThrow('5180');
  });
  it('空欄・0・範囲外・整数でない明示値を拒否する', async () => {
    for (const explicit of ['', '0', '65536', 'abc', '1.5', '-1'])
      await expect(selectPort({ name: 'WEB_PORT', explicit, base: 5173 })).rejects.toThrow('1～65535');
  });
  it('上限+20を超えて探索しない', async () => {
    const available = vi.fn(async () => false);
    await expect(selectPort({ name: 'WEB_PORT', base: 5173, available })).rejects.toThrow('5173～5193');
    expect(available).toHaveBeenCalledTimes(21);
  });
  it('実socketの占有を検出し、占有listenerを止めずに空き候補を選ぶ', async () => {
    const listener = createServer();
    await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
    const port = (listener.address() as { port: number }).port;
    try {
      expect(await isPortFree(port)).toBe(false);
      await expect(selectPort({ name: 'WEB_PORT', base: port, explicit: String(port) })).rejects.toThrow('使用中');
      const selected = await selectPort({ name: 'WEB_PORT', base: port });
      expect(selected).toBeGreaterThan(port);
      expect(await isPortFree(selected)).toBe(true);
      expect(listener.listening).toBe(true);
    } finally { await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve())); }
    expect(await isPortFree(port)).toBe(true);
  });
  function runWindowsLauncher(env: NodeJS.ProcessEnv) {
    return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const launcher = resolvePath(import.meta.dirname, '../../START_ONLINE.cmd');
      const systemDirectory = resolvePath(process.env.SystemRoot ?? 'C:/Windows', 'System32');
      const child = spawn(process.env.ComSpec ?? 'C:/Windows/System32/cmd.exe', ['/d', '/s', '/c', `"${launcher}"`],
        { cwd: systemDirectory, env, windowsHide: true, windowsVerbatimArguments: true });
      let output = '';
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('error', reject);
      child.once('close', code => resolve({ code, output }));
      child.stdin.end('\r\n');
    });
  }
  it.skipIf(process.platform !== 'win32')('System32からcmdを開いてもrepoへ移動し、日本語エラーとpauseで止まる', async () => {
    const result = await runWindowsLauncher({ ...process.env, WEB_PORT: 'invalid-for-test' });
    expect(result.code).toBe(1);
    expect(result.output).toContain('kyoto-diplomacy@');
    expect(result.output).toContain('WEB_PORT は1～65535');
    expect(result.output).toContain('オンライン起動を中止しました');
    expect(result.output).not.toContain('ENOENT');
  }, 15000);
  it.skipIf(process.platform !== 'win32')('Node/npmがないcmdでは日本語のインストール案内を出す', async () => {
    const result = await runWindowsLauncher({ ...process.env, PATH: resolvePath(process.env.SystemRoot ?? 'C:/Windows', 'System32') });
    expect(result.code).toBe(1);
    expect(result.output).toContain('Node.js または npm.cmd が見つかりません');
    expect(result.output).toContain('Node.js 24 LTS');
    expect(result.output).not.toContain('not recognized');
  }, 15000);
});
