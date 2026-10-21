import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

test('HTTP: локальный интерфейс и модули доступны; исходники сервера и пути вне public недоступны', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/app.js', '/tasks.js', '/runner.js', '/style.css', '/icon.svg']) {
    const res = await fetch(base + path); assert.equal(res.status, 200, path); assert.equal(res.headers.get('x-content-type-options'), 'nosniff'); await res.arrayBuffer();
  }
  for (const path of ['/server.mjs', '/package.json', '/%2e%2e%5cpackage.json', '/%E0%A4%A', '/missing.js']) {
    const res = await fetch(base + path); assert.equal(res.status, 404, path); await res.arrayBuffer();
  }
  const post = await fetch(base, { method: 'POST' }); assert.equal(post.status, 405); await post.arrayBuffer();
  const head = await fetch(base, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
