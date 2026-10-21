import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
export function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!path.startsWith(root.endsWith(sep) ? root : root + sep) || !mime[extname(path)]) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const data = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT должен быть целым числом от 1 до 65535');
  const server = createServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Порт ${port} занят. Задайте другой PORT, как описано в README.` : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`CodeCoach запущен: http://127.0.0.1:${port}\nОстановка: Ctrl+C`));
}
