import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Connect } from 'vite';

const onlineTarget=`http://127.0.0.1:${process.env.ONLINE_PORT??3001}`;
const generatedDir = fileURLToPath(new URL('./data/generated/', import.meta.url));
// Keep the existing generated-data URLs while letting Vite serve/copy public/audio normally.
const generatedFiles = () => readdirSync(generatedDir).filter(name => statSync(join(generatedDir, name)).isFile());
const serveGenerated: Connect.NextHandleFunction = (request, response, next) => {
  const name = request.url?.split('?')[0].slice(1) ?? '';
  if (!generatedFiles().includes(name)) { next(); return; }
  response.setHeader('Content-Type', name.endsWith('.json') || name.endsWith('.geojson') ? 'application/json; charset=utf-8' : 'application/octet-stream');
  response.end(readFileSync(join(generatedDir, name)));
};

export default defineConfig({
  root: 'apps/web',
  publicDir: 'public',
  plugins: [react(), { name: 'generated-map-data', configureServer(server) { server.middlewares.use(serveGenerated); }, generateBundle() {
    for (const fileName of generatedFiles()) this.emitFile({ type: 'asset', fileName, source: readFileSync(join(generatedDir, fileName)) });
  } }, { name: 'project-notice', apply: 'build', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'NOTICE.md', source: readFileSync(new URL('./NOTICE.md', import.meta.url), 'utf8') });
  } }],
  server: { port: 5173, strictPort: true, fs: { allow: ['../..'] }, proxy: { '/socket.io': { target: onlineTarget, ws: true }, '/health':{target:onlineTarget} } },
  preview: { proxy: { '/socket.io': { target: onlineTarget, ws: true }, '/health':{target:onlineTarget} } },
  build: { outDir: '../../dist', emptyOutDir: true, license: { fileName: 'licenses.md' } },
  test: { include: ['../../packages/**/*.test.ts', '../../apps/server/**/*.test.ts', 'src/**/*.test.ts'], environment: 'node' },
});
