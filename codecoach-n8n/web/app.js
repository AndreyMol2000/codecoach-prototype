const form = document.querySelector('#chat-form'), question = document.querySelector('#question'), messages = document.querySelector('#messages'), level = document.querySelector('#level'), button = document.querySelector('#send'), error = document.querySelector('#error');
const transcript = [];
let sending = false;
function message(role, text, meta = '') {
  document.querySelector('.welcome')?.remove();
  const article = document.createElement('article'); article.className = `message ${role}`;
  const label = document.createElement('div'); label.className = 'message-label'; label.textContent = role === 'user' ? 'ТЫ' : '✳ CODECOACH';
  const body = document.createElement('div'); body.className = 'message-text'; body.textContent = text;
  article.append(label, body);
  if (meta) { const note = document.createElement('div'); note.className = 'message-meta'; note.textContent = meta; article.append(note); }
  messages.append(article); article.scrollIntoView({ behavior: 'smooth', block: 'end' }); return body;
}
question.addEventListener('input', () => { document.querySelector('#char-count').textContent = `${question.value.length} / 1600`; });
question.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !sending) { event.preventDefault(); form.requestSubmit(); } });
for (const example of document.querySelectorAll('[data-example]')) example.addEventListener('click', () => { question.value = example.dataset.example; question.dispatchEvent(new Event('input')); question.focus(); });
form.addEventListener('submit', async event => {
  event.preventDefault(); if (sending) return;
  const text = question.value.trim(), helpLevel = Number(level.value);
  if (text.length < 5) { error.textContent = 'Напишите вопрос минимум из 5 символов.'; return; }
  sending = true; error.textContent = ''; button.disabled = true; question.disabled = true; level.disabled = true;
  message('user', text, `Уровень помощи ${helpLevel}`); transcript.push({ role: 'user', question: text, helpLevel, at: new Date().toISOString() });
  const pending = message('pending', 'Запрос отправлен в n8n. Qwen формирует ответ…', 'На этом компьютере ответ может занять до двух минут.');
  const started = Date.now();
  const timer = setInterval(() => { button.textContent = `Модель отвечает · ${Math.round((Date.now() - started) / 1000)} с`; }, 1000);
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, helpLevel }), signal: AbortSignal.timeout(135000) });
    const data = await response.json(); pending.closest('article').remove();
    if (!response.ok || !data.ok || typeof data.answer !== 'string') throw Error(data.error || 'Не удалось получить ответ модели.');
    const tokens = data.usage?.completion_tokens ?? '?';
    message('assistant', data.answer, `${data.topic} · ${Math.round(data.elapsedMs / 1000)} с · ${tokens} токенов ответа · ${data.requestId}${data.truncated ? ' · достигнут лимит длины' : ''}`);
    transcript.push({ role: 'assistant', ...data }); question.value = ''; question.dispatchEvent(new Event('input'));
  } catch (failure) { pending.closest('article')?.remove(); error.textContent = failure.message || 'Сервис недоступен. Попробуйте снова.'; transcript.push({ role: 'error', text: error.textContent, at: new Date().toISOString() }); }
  finally { clearInterval(timer); sending = false; button.disabled = false; question.disabled = false; level.disabled = false; button.textContent = 'Отправить ↗'; question.focus(); }
});
document.querySelector('#export').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ product: 'CodeCoach n8n', exportedAt: new Date().toISOString(), messages: transcript }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'codecoach-transcript.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
async function status() { try { const data = await (await fetch('/api/status')).json(); const box = document.querySelector('#services'); box.textContent = `${data.n8n ? '●' : '○'} n8n ${data.n8n ? 'доступен' : 'не запущен'}   ${data.llm ? '●' : '○'} Qwen ${data.llm ? 'загружена' : 'не запущена'}`; box.classList.toggle('ready', data.n8n && data.llm); } catch { document.querySelector('#services').textContent = 'Не удалось проверить сервисы'; } }
status();
