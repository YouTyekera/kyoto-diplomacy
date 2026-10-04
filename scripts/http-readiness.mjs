import { get } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

export function probeHttp(url, html = false) {
  return new Promise(resolve => {
    const request = get(url, { timeout: 750 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { if (body.length < 16384) body += chunk; });
      response.on('error', error => resolve({ ok: false, error: error.message }));
      response.on('end', () => {
        const status = response.statusCode;
        const ok = html ? status >= 200 && status < 300 &&
          /text\/html/i.test(response.headers['content-type'] ?? '') && /<(?:html|!doctype\s+html)/i.test(body) : status === 200;
        resolve({ ok, error: ok ? null : `HTTP ${status}${html ? '（HTML応答が必要）' : ''}` });
      });
    });
    request.on('timeout', () => request.destroy(new Error('HTTP応答待ちが750msを超えました')));
    request.on('error', error => resolve({ ok: false, error: `${error.code ?? ''} ${error.message}`.trim() }));
  });
}

export async function waitForHttp({ webUrl, serverUrl, timeoutMs = 15000, intervalMs = 200,
  probe = probeHttp, processes = () => [], onTimeout = () => {}, signal }) {
  const started = Date.now();
  let web = { ok: false, error: '未確認' }, server = { ok: false, error: '未確認' };
  while (!signal?.aborted && Date.now() - started < timeoutMs) {
    [web, server] = await Promise.all([probe(webUrl, true), probe(serverUrl, false)]);
    if (signal?.aborted) return false;
    if (web.ok && server.ok) return true;
    try { await delay(Math.min(intervalMs, Math.max(0, timeoutMs - (Date.now() - started))), undefined, { signal }); }
    catch { return false; }
  }
  if (signal?.aborted) return false;
  onTimeout();
  const state = processes().map(p => `${p.name}: ${p.exitCode === null ? '実行中' : '終了'} / pid=${p.pid ?? 'なし'} / exitCode=${p.exitCode ?? 'なし'} / signal=${p.signalCode ?? 'なし'}`).join('\n');
  throw new Error(`起動完了を確認できませんでした（HTTP確認 timeout=${timeoutMs}ms）。\n` +
    `Web: ${webUrl}\nServer health: ${serverUrl}\n${state}\n` +
    `最後のWeb確認: ${web.error ?? 'HTTP成功'}\n最後のServer確認: ${server.error ?? 'HTTP成功'}`);
}
