import { createServer } from 'node:net';

// Probes close their own listener before the application binds. The launcher also handles bind races.
export function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
      else reject(error);
    });
    probe.listen({ port, host, exclusive: true }, () => probe.close(error => error ? reject(error) : resolve(true)));
  });
}

export function portError(name, port) {
  const alternative = port < 65535 ? port + 1 : port - 1;
  return `${name} のポート ${port} は使用中、または利用できません。\n` +
    '以前の開発サーバーを起動したPowerShellで Ctrl+C を押して停止してください。\n' +
    `または別ポートを指定してください: $env:${name}='${alternative}'; npm.cmd run dev:online\n` +
    `自動選択へ戻す場合: Remove-Item Env:${name} -ErrorAction SilentlyContinue`;
}

export async function selectPort({ name, explicit, base, host = '127.0.0.1', reserved = [], available = isPortFree }) {
  if (explicit !== undefined) {
    if (!/^\d+$/.test(explicit) || Number(explicit) < 1 || Number(explicit) > 65535) {
      throw new Error(`${name} は1～65535の整数で指定してください（現在: ${JSON.stringify(explicit)}）。`);
    }
    const port = Number(explicit);
    if (reserved.includes(port) || !await available(port, host)) throw new Error(portError(name, port));
    return port;
  }
  for (let port = base; port <= base + 20; port++) {
    if (!reserved.includes(port) && await available(port, host)) return port;
  }
  throw new Error(`${name}: ${base}～${base + 20} に空きポートが見つかりません。\n${portError(name, base)}`);
}

export async function resolvePorts(env, available = isPortFree) {
  // Explicit ports take priority over automatic choices, including cross-service collisions.
  const fixedServer = /^\d+$/.test(env.ONLINE_PORT ?? '') ? Number(env.ONLINE_PORT) : null;
  const webPort = await selectPort({ name: 'WEB_PORT', explicit: env.WEB_PORT, base: 5173,
    host: env.WEB_HOST ?? '127.0.0.1', reserved: fixedServer === null ? [] : [fixedServer], available });
  const onlinePort = await selectPort({ name: 'ONLINE_PORT', explicit: env.ONLINE_PORT, base: 3001,
    host: env.ONLINE_HOST ?? '127.0.0.1', reserved: [webPort], available });
  return { webPort, onlinePort };
}

export function childPlans(env, { webPort, onlinePort }) {
  const childEnv = { ...env, WEB_PORT: String(webPort), ONLINE_PORT: String(onlinePort) };
  return [
    { name: 'ONLINE_PORT', port: onlinePort, env: childEnv, args: ['--import', 'tsx', 'apps/server/main.ts'] },
    { name: 'WEB_PORT', port: webPort, env: childEnv,
      args: ['node_modules/vite/bin/vite.js', '--host', env.WEB_HOST ?? '127.0.0.1', '--port', String(webPort), '--strictPort'] },
  ];
}
