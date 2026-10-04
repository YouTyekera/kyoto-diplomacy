import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Official public resource pages only; game runtime never accesses external maps.
const base = 'https://data.city.kyoto.lg.jp';
const destination = resolve('data/source/kyoto-2020-wgs84');
await mkdir(destination, { recursive: true });
async function get(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}
try {
  const resources = new Map<string, { id: string; title: string }>();
  for (let page = 1; page <= 5; page++) {
    const html = await get(`${base}/dataset/00670/?page=${page}`);
    const links = html.matchAll(/href=['"](?:\.\.\/\.\.\/)?(?:\/)?resource\/\?id=(\d+)['"][^>]*>([^<]+)<\/a>/g);
    for (const [, id, title] of links) {
      if (/区\s*第\d+国勢統計区/.test(title)) resources.set(id, { id, title });
    }
  }
  if (resources.size !== 227) throw new Error(`公式一覧の国勢統計区が227件ではありません (${resources.size})。一覧構造を確認してください。`);
  const manifest: { title: string; url: string; file: string }[] = [];
  for (const { id, title } of resources.values()) {
    const url = `${base}/resource/?id=${id}`;
    const html = await get(url);
    const uploadFile = html.match(/name="upload_file"[^>]*value="([^"]+)"/)?.[1];
    if (!uploadFile) throw new Error(`${title}: ダウンロードフォームがありません`);
    const file = uploadFile.replace(/^\d{14}_/, '');
    if (!/^\d{2}_\d{2}[^/\\]+\.kml$/i.test(file)) throw new Error(`想定外のファイル名: ${file}`);
    const filePath = resolve(destination, file);
    // Existing originals are never overwritten.
    try {
      await readFile(filePath);
    } catch {
      const kml = await get(url, {
        method: 'POST',
        body: new URLSearchParams({ upload_file: uploadFile, upload_url: '', download: 'このデータをダウンロード' }),
      });
      if (!kml.includes('<kml')) throw new Error(`${title}: KMLではない応答`);
      await writeFile(filePath, kml, { encoding: 'utf8', flag: 'wx' });
    }
    manifest.push({ title, url, file });
    console.log(`${manifest.length}/227 ${title}`);
  }
  await writeFile(resolve(destination, 'manifest.json'), JSON.stringify({
    datasetId: '00670', url: `${base}/dataset/00670/`, copyright: '京都市',
    license: 'CC BY 4.0', resources: manifest,
  }, null, 2));
  console.log('公式KMLの取得完了。続いて npm.cmd run map:import を実行してください。');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
