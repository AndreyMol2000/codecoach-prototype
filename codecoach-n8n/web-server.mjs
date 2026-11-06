import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const base = new URL('./web/', import.meta.url);
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
const workflowURL = process.env.CODECOACH_WEBHOOK || 'http://127.0.0.1:5678/webhook/codecoach-agent';
const modelURL = process.env.CODECOACH_MODEL_HEALTH || 'http://127.0.0.1:8081/health';
const limit = new Map();
let busy = false;
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };

export function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return json(res, 400, { ok: false, error: 'Invalid URL' }); }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const [n8n, llm] = await Promise.allSettled([fetch(new URL('/healthz', workflowURL), { signal: AbortSignal.timeout(2500) }), fetch(modelURL, { signal: AbortSignal.timeout(2500) })]);
      return json(res, 200, { n8n: n8n.status === 'fulfilled' && n8n.value.ok, llm: llm.status === 'fulfilled' && llm.value.ok, model: 'Qwen3 · 1.7B', channel: 'separate web chat' });
    }
    if (req.method === 'GET' && files[url.pathname]) {
      const [name, mime] = files[url.pathname];
      try { const data = await readFile(new URL(name, base)); res.writeHead(200, { 'Content-Type': mime }); return res.end(data); } catch { return json(res, 500, { ok: false, error: 'Не удалось открыть интерфейс' }); }
    }
    if (req.method !== 'POST' || url.pathname !== '/api/chat') return json(res, 404, { ok: false, error: 'Not found' });
    const now = Date.now(), key = req.socket.remoteAddress || 'local';
    for (const [ip, data] of limit) if (now - data.since > 600000) limit.delete(ip);
    const rate = limit.get(key) || { since: now, count: 0 };
    if (rate.count >= 30) return json(res, 429, { ok: false, error: 'Слишком много запросов. Повторите через 10 минут.' });
    if (busy) return json(res, 429, { ok: false, error: 'Модель обрабатывает другой запрос. Попробуйте через несколько секунд.' });
    let raw = '', acquired = false;
    try {
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 12000) return json(res, 413, { ok: false, error: 'Слишком большой запрос.' }); }
      const input = JSON.parse(raw);
      if (typeof input.question !== 'string' || input.question.length > 1600) return json(res, 400, { ok: false, error: 'Вопрос должен содержать не более 1600 символов.' });
      if (busy) return json(res, 429, { ok: false, error: 'Модель уже обрабатывает другой запрос.' });
      rate.count++; limit.set(key, rate); busy = true; acquired = true;
      const reply = await fetch(workflowURL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: input.question, helpLevel: input.helpLevel ?? 1 }), signal: AbortSignal.timeout(130000) });
      let data;
      try { data = await reply.json(); } catch { data = { ok: false, error: 'n8n вернул ответ в неожиданном формате. Проверьте workflow.' }; }
      if (!reply.ok && !data.error) data.error = 'Workflow n8n сейчас недоступен. Проверьте, что он опубликован.';
      return json(res, reply.status, data);
    } catch (error) { return json(res, error instanceof SyntaxError ? 400 : 503, { ok: false, error: error instanceof SyntaxError ? 'Не удалось прочитать запрос.' : 'Нет ответа от n8n. Проверьте запуск сервисов и активность workflow.' }); }
    finally { if (acquired) busy = false; }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3010);
  createServer().listen(port, '127.0.0.1', () => console.log(`CodeCoach web chat: http://127.0.0.1:${port}\nAll chat requests go to n8n: ${workflowURL}`));
}
