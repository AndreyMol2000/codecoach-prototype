import { tasks, getTask } from './tasks.js';
import { runCode } from './runner.js';
import { reward, coachHint, recommendation, experimentSummary } from './learning.js';
import { loadState, saveState, newParticipant, getProgress, recordResult } from './store.js';
import hljs from './vendor/highlightjs/core.min.js';
import javascript from './vendor/highlightjs/javascript.min.js';

hljs.registerLanguage('javascript', javascript);

let state = loadState();
let running = false;
let storageWarning = false;
const app = document.querySelector('#app');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const current = () => state.participants.find(p => p.id === state.currentId);
const totalXP = () => Object.values(current().progress).reduce((sum, p) => sum + (p.xp || 0), 0);
const solvedCount = () => Object.values(current().progress).filter(p => p.solved).length;
const stamp = ms => ms ? new Date(ms).toLocaleString('ru-RU') : '—';
function duration(p) { return p?.solvedAt && p?.startedAt ? Math.max(1, Math.round((p.solvedAt - p.startedAt) / 1000)) + ' с' : '—'; }
function event(type, data = {}) { current().events.push({ type, at: Date.now(), ...data }); }
function persist() {
  if (!saveState(state) && !storageWarning) { storageWarning = true; notify('Хранилище недоступно. Сессия работает до закрытия вкладки. Выгрузите результаты в JSON.'); }
}
function notify(text) {
  const el = document.querySelector('#notice'); el.textContent = text; el.classList.add('visible');
  clearTimeout(notify.timer); notify.timer = setTimeout(() => el.classList.remove('visible'), 6500);
}
const arrow = '<span aria-hidden="true">↗</span>';
function shell(page) {
  app.innerHTML = `<header class="header"><a href="#home" class="brand" aria-label="CodeCoach на главную"><img src="./icon.svg" width="34" height="34" alt=""><span>Code<span class="muted">Coach</span></span></a>
    <nav aria-label="Основная навигация"><a href="#home" ${page === 'home' ? 'aria-current="page"' : ''}>Практика</a><a href="#report" ${page === 'report' ? 'aria-current="page"' : ''}>Результаты пилота</a></nav>
    <div class="header-right"><span class="local-indicator">Локальный прототип</span><span class="avatar" title="Анонимный участник">${state.participants.findIndex(p => p.id === state.currentId) + 1}</span></div></header><main id="main" tabindex="-1"></main>
    <footer><span>CodeCoach · учебный прототип</span><span>JavaScript · без регистрации · данные в этом браузере</span></footer>`;
  return document.querySelector('#main');
}

function home() {
  const main = shell('home');
  const rec = recommendation(current().progress), next = getTask(rec.id), xp = totalXP();
  main.innerHTML = `<section class="hero"><div><div class="eyebrow"><span class="live-dot"></span> ПРАКТИКА JAVASCRIPT</div><h1>Понимание приходит<br>с <span>твоим решением.</span></h1><p class="lead">Пиши код, проверяй идеи и разбирай ошибки.<br>Наставник подскажет следующий шаг.</p><a class="button primary" href="#task/${next.id}">${current().progress.maximum?.startedAt ? 'Продолжить практику' : 'Начать с первой задачи'} ${arrow}</a><p class="hero-note">${escape(rec.reason)}</p></div>
    <div class="hero-code" aria-label="Пример подсказки наставника"><div class="code-top"><span class="dots"><i></i><i></i><i></i></span><span>first-step.js</span><span>JS</span></div><pre><span class="code-comment">// Даже маленькая ошибка — начало открытия</span>\n<span class="code-purple">const</span> numbers = [<span class="code-green">-10, -3, -20</span>];\n<span class="code-purple">let</span> max = <span class="code-orange">0</span>;\n\n<span class="code-comment">// Подходит ли ноль для любого массива?</span></pre><div class="code-coach"><span class="coach-symbol">✳</span><div><b>Посмотрим внимательнее</b><p>Что общего у тестов, которые не прошли?</p></div></div><div class="orbit-label">Ошибка → вопрос → понимание</div></div></section>
    <div class="home-layout"><section class="task-section"><div class="section-heading"><div class="eyebrow">ТВОЙ УЧЕБНЫЙ МАРШРУТ</div><h2>Одна задача за раз</h2><p class="muted">Начни с максимума. Затем проверь себя без подсказок.</p></div>
    <div class="task-list">${tasks.map((task, i) => {
      const p = current().progress[task.id];
      return `<a class="task-row ${p?.solved ? 'completed' : ''}" href="#task/${task.id}"><span class="task-number">${p?.solved ? '✓' : '0' + (i + 1)}</span><div class="task-info"><h3>${task.title} ${task.transfer ? '<span class="tag lilac">Без подсказок</span>' : ''}</h3><p>${task.category} <span>·</span> ${task.minutes} мин</p></div><div class="task-meta"><span class="difficulty">${'▰'.repeat(task.difficulty)}<span class="dim">${'▰'.repeat(3 - task.difficulty)}</span></span><span>${p?.solved ? p.xp + ' XP' : 'до 100 XP'}</span></div><span class="row-arrow" aria-hidden="true">↗</span></a>`;
    }).join('')}</div></section>
    <aside class="progress-panel"><div class="eyebrow">ТВОЙ ПРОГРЕСС</div><div class="xp-number">${xp}<span> XP</span></div><div class="progress-track"><i style="width:${Math.min(100, xp % 200 / 2)}%"></i></div><div class="progress-label"><span>Уровень ${Math.floor(xp / 200) + 1}</span><span>${200 - xp % 200} XP до следующего</span></div><div class="progress-stats"><div><strong>${solvedCount()}<small> / ${tasks.length}</small></strong><span>задач решено</span></div><div><strong>${Object.values(current().progress).reduce((n, p) => n + p.attempts, 0)}</strong><span>проверок кода</span></div></div><div class="skill"><span>Массивы и границы</span><span>${current().progress.minimum?.solved ? 'Закреплено' : current().progress.maximum?.solved ? 'Проверить перенос' : 'Впереди'}</span></div><p class="panel-note">XP начисляется один раз за задачу. С подсказками: 80 / 60 / 40 XP, с решением: 20 XP.</p></aside></div>
    <section class="principles"><div><span>01</span><h3>Настоящая проверка</h3><p>Твой код выполняется на тестовых данных прямо в браузере.</p></div><div><span>02</span><h3>Помощь по шагам</h3><p>От вопроса к объяснению. Решение открывается только на четвёртом шаге.</p></div><div><span>03</span><h3>Практика без ключей</h3><p>В прототипе работает наставник на правилах. Подключение LLM — следующий этап.</p></div></section>`;
}

function workspace(task) {
  const p = getProgress(current(), task);
  if (!p.startedAt) { p.startedAt = Date.now(); event('task_opened', { taskId: task.id }); persist(); }
  const main = shell('workspace');
  main.innerHTML = `<div class="workspace-breadcrumb"><a href="#home">← Все задачи</a><span>ПРАКТИКА / ${escape(task.category.toUpperCase())}</span><span class="tag">JavaScript</span></div>
    <section class="workspace-title"><div><div class="eyebrow">${task.transfer ? 'ШАГ 02 · ПРОВЕРКА ПЕРЕНОСА НАВЫКА' : 'ПРАКТИЧЕСКАЯ ЗАДАЧА'}</div><h1>${task.title}</h1></div><div class="workspace-count"><span>${p.solved ? '✓ Решено · ' + p.xp + ' XP' : 'До 100 XP'}</span><span>Попыток: <b id="attempts">${p.attempts}</b></span></div></section>
    <div class="workspace-layout"><div class="coding-column"><section class="brief"><h2>Условие</h2><p>${task.description}</p><p class="contract">${task.contract}</p><code>${escape(task.example)}</code></section>
    <section class="editor-panel" aria-label="Редактор решения">
      <div class="editor-toolbar">
        <span><span class="file-icon">JS</span> solution.js</span>
        <div class="editor-actions">
          <button class="text-button" id="prettify-code" title="Форматировать код" ${running ? 'disabled' : ''}>Prettify</button>
          <button class="text-button" id="reset-code" ${running ? 'disabled' : ''}>Вернуть стартовый код</button>
        </div>
      </div>
      <div class="editor-wrap">
        <pre class="line-numbers" aria-hidden="true"><span id="line-numbers"></span></pre>
        <div class="editor-source">
          <pre class="editor-highlight" aria-hidden="true"><code id="code-highlight"></code></pre>
          <textarea id="code-editor" aria-label="Код решения JavaScript" spellcheck="false" autocapitalize="off" autocomplete="off" ${running ? 'disabled' : ''}></textarea>
        </div>
      </div>
      <div class="editor-bottom"><span>Ctrl / ⌘ + Enter — проверить</span><button class="button primary small" id="run" ${running ? 'disabled' : ''}>${running ? 'Проверяем…' : '▶ Проверить код'}</button></div>
    </section>
    <section class="tests-panel" aria-live="polite"><div class="tests-heading"><h2>Тесты <span id="test-count"></span></h2><span class="muted">Лимит выполнения: 1,8 с</span></div><div id="tests"></div></section><div id="success"></div></div>
    <aside class="coach-panel"><div class="coach-heading"><span class="coach-symbol">✳</span><div><h2>Твой наставник</h2><span>${task.transfer ? 'Самостоятельная практика' : 'Подсказки по результатам тестов'}</span></div><span class="live-dot"></span></div><div class="coach-body"><div class="coach-intro">${task.transfer ? 'Попробуй применить то, что узнал в первой задаче. Здесь доступны тесты, а подсказки отключены.' : 'Сначала запусти тесты. Вместе найдём направление, в котором стоит искать ошибку.'}</div><div class="hint-steps" aria-label="Уровни помощи">${[1, 2, 3, 4].map(n => `<span class="${p.hints >= n ? 'used' : ''}">${n}</span>`).join('<i></i>')}</div><div id="hints">${(p.hintHistory || []).map(hintCard).join('')}</div><div id="coach-action"></div></div><div class="coach-footer">Наставник на правилах · без внешней AI-модели<br>Код и результаты остаются в этом браузере.</div></aside></div>`;
  const editor = document.querySelector('#code-editor');
  const highlight = document.querySelector('#code-highlight');
  const lineNumbers = document.querySelector('#line-numbers');
  const prettify = document.querySelector('#prettify-code');
  editor.value = p.code;
  function syncScroll() {
    highlight.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    lineNumbers.style.transform = `translateY(${-editor.scrollTop}px)`;
  }
  function renderCode() {
    highlight.innerHTML = hljs.highlight(editor.value, { language: 'javascript' }).value;
    lineNumbers.textContent = editor.value.split('\n').map((_, i) => i + 1).join('\n');
    syncScroll();
  }
  renderCode();
  editor.addEventListener('input', () => { p.code = editor.value; p.result = null; renderCode(); persist(); renderResult(task, p); });
  editor.addEventListener('scroll', syncScroll);
  editor.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); checkCode(task); }
    if (e.key === 'Tab') { e.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); editor.dispatchEvent(new Event('input')); }
    if (e.key === 'Escape') { e.preventDefault(); document.querySelector('#run').focus(); }
  });
  prettify.addEventListener('click', async () => {
    const source = editor.value;
    prettify.disabled = true;
    try {
      const [{ format }, babel, estree] = await Promise.all([
        import('./vendor/prettier/standalone.mjs'),
        import('./vendor/prettier/plugins/babel.mjs'),
        import('./vendor/prettier/plugins/estree.mjs')
      ]);
      const formatted = await format(source, { parser: 'babel', plugins: [babel, estree], singleQuote: true });
      if (editor.isConnected && editor.value === source && formatted !== source) {
        editor.value = formatted;
        editor.dispatchEvent(new Event('input'));
      }
    } catch (error) {
      if (editor.isConnected && editor.value === source) {
        notify(error instanceof SyntaxError
          ? 'Исправьте синтаксическую ошибку и нажмите Prettify снова.'
          : 'Не удалось отформатировать код. Попробуйте ещё раз.');
      }
    } finally {
      prettify.disabled = false;
    }
  });
  document.querySelector('#run').addEventListener('click', () => checkCode(task));
  document.querySelector('#reset-code').addEventListener('click', () => { p.code = task.starter; p.result = null; persist(); workspace(task); notify('Стартовый код восстановлен. История попыток сохранена.'); });
  renderResult(task, p);
}
function hintCard(hint) { return `<article class="hint-card"><h3>${escape(hint.title)}</h3><p>${escape(hint.text)}</p>${hint.code ? `<pre>${escape(hint.code)}</pre>` : ''}</article>`; }
function renderResult(task, p) {
  const result = p.result, solvedNow = result?.total > 0 && result.passed === result.total;
  if (task.transfer) document.querySelector('.hint-steps')?.remove();
  else if (result) document.querySelector('.coach-intro').textContent = solvedNow ? 'Все проверки пройдены. Попробуй применить идею самостоятельно в следующей задаче.' : result.error ? 'Проверка заметила ошибку выполнения. Сообщение под редактором и подсказка помогут найти причину.' : `Пройдено ${result.passed} из ${result.total} тестов. Сравни входы и результаты неудачных примеров. Если застрял, открой подсказку.`;
  document.querySelector('#test-count').textContent = result?.total ? `${result.passed} / ${result.total}` : `0 / ${task.tests.length}`;
  document.querySelector('#tests').innerHTML = result?.error ? `<div class="error-box"><b>${result.kind === 'timeout' ? 'Проверка остановлена' : 'Ошибка в коде'}</b><p>${escape(result.error)}</p></div>` : result?.results?.length ? result.results.map(t => `<div class="test-row ${t.passed ? 'pass' : 'fail'}"><span class="test-icon" aria-hidden="true">${t.passed ? '✓' : '×'}</span><div><b>${t.label}</b><code>${escape(task.fn)}(${escape(t.input)})</code>${!t.passed ? `<p>Ожидается <strong>${escape(t.expected)}</strong> · Получено <strong>${escape(t.actual)}</strong></p>` : ''}</div><span class="test-status">${t.passed ? 'Пройден' : 'Не пройден'}</span></div>`).join('') : `<div class="empty-tests"><span aria-hidden="true">⌘</span><p>Готов к первой проверке?<small>Запусти код и посмотри, какие тесты проходят.</small></p></div>`;
  document.querySelector('#success').innerHTML = solvedNow ? `<section class="success-box"><span class="success-icon">✓</span><div><h2>Все тесты пройдены</h2><p>${p.hintsAtSolve === 4 ? 'Решение проверено. Теперь попробуйте перенести идею на другую задачу.' : 'Отличная работа. Закрепите идею в следующем упражнении.'} За первое решение: ${p.xp} XP.</p><a class="button primary small" href="${task.id === 'maximum' ? '#task/minimum' : task.id === 'minimum' ? '#report' : '#home'}">${task.id === 'maximum' ? 'Проверить себя без подсказок' : task.id === 'minimum' ? 'Посмотреть результат сессии' : 'К учебному маршруту'} →</a></div></section>` : '';
  const action = document.querySelector('#coach-action');
  action.innerHTML = task.transfer ? '<p class="panel-note">Для чистоты эксперимента решайте задачу самостоятельно. Тесты можно запускать сколько угодно.</p>' : solvedNow ? '<p class="coach-done">✓ Задача решена. Пора проверить навык!</p>' : p.hints >= 4 ? '<p class="panel-note">Все уровни помощи открыты. Примените решение в редакторе и запустите тесты.</p>' : `<button class="button ${p.hints === 3 ? 'outline' : 'secondary'} full" id="hint" ${!result || running ? 'disabled' : ''}>${p.hints === 3 ? 'Открыть готовое решение · шаг 4' : p.hints ? 'Следующая подсказка · шаг ' + (p.hints + 1) : 'Получить первую подсказку'}</button><p class="panel-note">${!result ? 'Сначала проверьте текущий код.' : p.hints === 3 ? 'После открытия решения награда составит 20 XP.' : 'Готовый код появится только на четвёртом шаге.'}</p>`;
  document.querySelector('#hint')?.addEventListener('click', () => {
    p.hints++; const hint = coachHint(task, p.result, p.hints); p.hintHistory.push(hint);
    event('hint_opened', { taskId: task.id, level: p.hints }); persist(); workspace(task);
  });
}
async function checkCode(task) {
  if (running) return;
  running = true;
  const participant = current();
  const p = getProgress(participant, task);
  p.code = document.querySelector('#code-editor').value;
  workspace(task);
  const result = await runCode(p.code, task);
  if (recordResult(p, result)) { p.xp = reward(p.hints); event('task_solved', { taskId: task.id, xp: p.xp, hints: p.hints, attempts: p.attempts }); }
  event('code_checked', { taskId: task.id, passed: result.passed || 0, total: result.total || 0, kind: result.kind || 'tests' });
  running = false; persist();
  if (location.hash === '#task/' + task.id) { workspace(task); document.querySelector('#run').focus({ preventScroll: true }); }
}

function download() {
  const data = { product: 'CodeCoach', schemaVersion: 1, exportedAt: new Date().toISOString(), coachMode: 'rules', hypothesis: 'Пошаговая помощь позволяет решить максимум за 10 минут без полного ответа и затем самостоятельно решить минимум.', summary: experimentSummary(state.participants), participants: state.participants };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `codecoach-experiment-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Результаты выгружены. В файле есть код решений и история действий участников.');
}
function report() {
  const s = experimentSummary(state.participants), participant = current();
  const main = shell('report');
  main.innerHTML = `<section class="report-intro"><div class="eyebrow">ПРОВЕРКА ПРОДУКТОВОЙ ГИПОТЕЗЫ</div><h1>От ошибки к пониманию</h1><p class="lead">Помогают ли пошаговые подсказки решить задачу<br>и применить идею самостоятельно?</p><div class="report-actions"><button class="button primary small" id="export">↓ Выгрузить JSON</button><button class="button secondary small" id="new-participant" ${running ? 'disabled' : ''}>+ Новый участник</button></div></section>
    <section class="report-stats" aria-label="Метрики эксперимента"><div><strong>${s.started}</strong><span>начали первую задачу</span></div><div><strong>${s.guided}</strong><span>решили за ≤ 10 мин без ответа</span></div><div><strong>${s.assistedTransfer}</strong><span>затем решили перенос</span></div><div><strong>${s.started ? Math.round(s.assistedTransfer / s.started * 100) : 0}%</strong><span>прошли весь сценарий</span></div></section>
    <section class="hypothesis-result"><span class="tag ${s.enough ? 'lilac' : ''}">${s.enough ? 'Есть минимальная выборка' : 'Пока недостаточно данных'}</span><h2>${!s.enough ? 'Соберите минимум 5 прохождений' : s.supported ? 'Порог пилота достигнут' : 'Порог пилота пока не достигнут'}</h2><p>Критерий, выбранный для пилота: не менее 60% участников решают первую задачу за 10 минут, не открывая готовое решение, и затем решают вторую без подсказок. Минимум — 5 участников.</p><p class="muted">Это предварительный сигнал. Без контрольной группы он не доказывает превосходство подсказок над другими форматами обучения. Паузы входят во время прохождения.</p></section>
    <section class="session-section"><div class="section-heading"><h2>Прохождения в этом браузере</h2><p class="muted">Анонимные сессии. Новый участник начинает с чистого редактора и нулевого прогресса.</p></div><div class="table-scroll"><table><thead><tr><th>Участник</th><th>Максимум</th><th>Время до решения</th><th>Попытки / подсказки</th><th>Перенос навыка</th></tr></thead><tbody>${state.participants.map((p, i) => {
      const t = p.progress.maximum, next = p.progress.minimum, validTransfer = t?.solved && next?.solved && next.startedAt >= t.solvedAt;
      return `<tr><td><b>Участник ${i + 1}</b>${p.id === state.currentId ? '<small>текущая сессия</small>' : ''}</td><td>${t?.solved ? '✓ Решено' : t?.startedAt ? 'В процессе' : 'Не начато'}</td><td>${duration(t)}</td><td>${t?.attempts ?? 0} / ${t?.hints ?? 0}</td><td>${validTransfer ? '✓ Решено после максимума' : next?.solved ? 'Решено вне сценария' : next?.startedAt ? 'В процессе' : 'Не начато'}</td></tr>`;
    }).join('')}</tbody></table></div></section>
    <div class="report-bottom"><section class="feedback-section"><div class="eyebrow">РЕФЛЕКСИЯ УЧАСТНИКА ${state.participants.findIndex(p => p.id === state.currentId) + 1}</div><h2>Что стало понятнее?</h2><form id="feedback-form"><label for="rating">Насколько полезны подсказки?</label><select id="rating" required><option value="">Выберите оценку</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${participant.feedback?.rating === n ? 'selected' : ''}>${n} — ${['совсем не помогли', 'скорее не помогли', 'частично помогли', 'помогли', 'очень помогли'][n - 1]}</option>`).join('')}</select><label for="reflection">Почему начальный ноль может дать неправильный результат?</label><textarea id="reflection" rows="3" maxlength="1200" placeholder="Объясните своими словами. Не указывайте личные данные." required>${escape(participant.feedback?.reflection || '')}</textarea><button class="button secondary small" type="submit">Сохранить ответ</button><span id="feedback-state" role="status">${participant.feedback ? 'Ответ сохранён' : ''}</span></form></section><aside class="pilot-note"><h2>Как провести пилот</h2><ol><li>Нажмите «Новый участник» перед каждым тестированием.</li><li>Дайте человеку решить максимум, затем минимум.</li><li>Не подсказывайте вне интерфейса. Запишите ответ участника.</li><li>Выгрузите JSON после пяти прохождений.</li></ol><p>Данные не отправляются на сервер. Экспорт содержит код решений и события сессий — делитесь им с согласия участников.</p><button class="text-button danger" id="clear-data" ${running ? 'disabled' : ''}>Удалить все локальные результаты</button><div id="clear-confirm"></div></aside></div>`;
  document.querySelector('#export').addEventListener('click', download);
  document.querySelector('#new-participant').addEventListener('click', () => { if (running) return; const p = newParticipant(); state.participants.push(p); state.currentId = p.id; persist(); location.hash = '#home'; notify('Новая сессия готова. Предыдущие результаты сохранены.'); });
  document.querySelector('#feedback-form').addEventListener('submit', e => { e.preventDefault(); participant.feedback = { rating: Number(document.querySelector('#rating').value), reflection: document.querySelector('#reflection').value.trim(), at: Date.now() }; event('feedback_saved'); persist(); document.querySelector('#feedback-state').textContent = 'Ответ сохранён'; });
  document.querySelector('#clear-data').addEventListener('click', () => {
    document.querySelector('#clear-confirm').innerHTML = '<p>Удалить все сессии? Сначала выгрузите JSON, если нужны результаты.</p><button class="button outline small" id="confirm-clear">Да, удалить результаты</button>';
    document.querySelector('#confirm-clear').addEventListener('click', () => { if (running) return; const p = newParticipant(); state = { version: 1, participants: [p], currentId: p.id }; persist(); report(); notify('Локальные результаты удалены. Создана пустая сессия.'); });
  });
}
function render() {
  const hash = location.hash || '#home';
  if (hash.startsWith('#task/')) { const task = getTask(hash.slice(6)); if (task) { workspace(task); window.scrollTo(0, 0); return; } }
  if (hash === '#report') report(); else home();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
document.addEventListener('click', event => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); document.querySelector('#main').focus(); }
});
persist();
render();
