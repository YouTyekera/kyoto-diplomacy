import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolvePorts, childPlans, portError } from './online-startup.mjs';
import { waitForHttp } from './http-readiness.mjs';

const children = [];
let stopping = false;
const abort = new AbortController();
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  abort.abort();
  // Stop only the processes started here; existing servers are untouched.
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());

try {
  console.log('[京都Diplomacy Online] 空きポートを確認しています…');
  const ports = await resolvePorts(process.env);
  if (!stopping) {
    const processStates = [];
    for (const plan of childPlans(process.env, ports)) {
      // Direct Node entry points avoid extra npm.cmd shells on Windows.
      const child = spawn(process.execPath, plan.args, { env: plan.env, stdio: ['inherit', 'pipe', 'pipe'] });
      children.push(child);
      processStates.push({ name: plan.name, child });
      for (const stream of [child.stdout, child.stderr]) {
        const lines = createInterface({ input: stream });
        lines.on('line', line => {
          if (stopping) return;
          if (/EADDRINUSE|Port \d+ is already in use|EACCES.*listen/.test(line)) {
            console.error(portError(plan.name, plan.port));
            stop(1);
            return;
          }
          console.log(line);
        });
      }
      child.on('error', error => { console.error(`起動できません: ${error.message}`); stop(1); });
      child.on('exit', code => {
        if (stopping) return;
        if ([130, -1073741510, 3221225786].includes(code)) { stop(); return; }
        console.error(`${plan.name} が終了しました。上のメッセージを確認してください。`);
        stop(code || 1);
      });
    }
    const localHost = host => ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host;
    const webHost = process.env.WEB_HOST ?? '127.0.0.1';
    const webUrl = `http://${localHost(webHost)}:${ports.webPort}/`;
    const serverUrl = `http://${localHost(process.env.ONLINE_HOST ?? '127.0.0.1')}:${ports.onlinePort}`;
    const healthy = await waitForHttp({ webUrl, serverUrl: `${serverUrl}/health`, signal: abort.signal,
      processes: () => processStates.map(({ name, child }) => ({ name, pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode })),
      onTimeout: () => { for (const child of children) if (child.exitCode === null) child.kill(); } });
    if (healthy && !stopping) {
      if (process.env.WEB_PORT === undefined && ports.webPort !== 5173)
        console.log(`5173 は使用中のため、Webは ${ports.webPort} を使用します。`);
      if (process.env.ONLINE_PORT === undefined && ports.onlinePort !== 3001)
        console.log(`3001 は使用中のため、Serverは ${ports.onlinePort} を使用します。`);
      console.log(`\n[京都Diplomacy Online] HTTP確認成功・起動しました\nServer:          ${serverUrl}\nONLINE GAME URL: ${webUrl}\n` +
        (webHost === '0.0.0.0' ? `LAN参加: ホストPCのIPv4アドレスとWebポート ${ports.webPort} を使ってください。\n` : '') +
        'このURLをブラウザで開いてください。Ctrl+C で両方終了します。\n');
    }
  }
} catch (error) {
  console.error(`\nオンライン起動を中止しました。\n${error.message}`);
  stop(1);
}
