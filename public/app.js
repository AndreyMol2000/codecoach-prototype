import { tasks, getTask } from './tasks.js';
import { runCode } from './runner.js';
import { reward, coachHint, recommendation, experimentSummary } from './learning.js';
import { loadState, saveState, newParticipant, getProgress, recordResult, usedHelpLevel } from './store.js';
import hljs from './vendor/highlightjs/core.min.js';
import javascript from './vendor/highlightjs/javascript.min.js';

hljs.registerLanguage('javascript', javascript);

let state = loadState();
let storageWarning = false;
const taskChats = new WeakMap();
const collapsedBriefs = new WeakSet();
const openHelpPanels = new WeakSet();
const taskChatHelpLabels = ['Намёк', 'Объяснение', 'Алгоритм', 'Решение'];
const taskChatHelpLevels = ['Намёк и вопрос', 'Объяснение причины', 'Алгоритм словами', 'Разрешить готовый код и правки'];
const taskChatEditCommand = /^(?:(?:да|пожалуйста)[,\s]+)*(?:сам[аи]?\s+)?(?:внеси|исправь|поправь|измени|замени|добавь|удали|перепиши|реши)(?:те)?(?=[\s,.!?:]|$)/iu;
const app = document.querySelector('#app');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const highlightCode = source => hljs.highlight(source, { language: 'javascript' }).value;

function codeSample(source, caption, highlight = true) {
  return `<figure class="code-sample"><figcaption>${escape(caption)}</figcaption><pre><code class="syntax-highlight">${highlight ? highlightCode(source) : escape(source)}</code></pre></figure>`;
}

function renderChatAnswer(answer) {
  const source = answer.replace(/\r\n/g, '\n');
  const blocks = /^ {0,3}```[ \t]*([\w+-]*)[ \t]*\n([\s\S]*?)^ {0,3}```[ \t]*$/gm;
  const paragraph = text => text.trim() ? `<p>${escape(text.trim())}</p>` : '';
  let html = '';
  let offset = 0;
  for (const match of source.matchAll(blocks)) {
    const language = match[1].toLowerCase();
    html += paragraph(source.slice(offset, match.index));
    html += codeSample(match[2].replace(/\n$/, ''), 'Код', !language || language === 'js' || language === 'javascript');
    offset = match.index + match[0].length;
  }
  return html + paragraph(source.slice(offset));
}

function findCodeEditRange(source, before) {
  if (!before && source) return null;
  // The model may omit trailing spaces when it copies a line.
  const pattern = before.replace(/[ \t]+\n/g, '\n')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('\n', '[ \\t]*\\n');
  const matcher = new RegExp(pattern, 'g');
  const match = matcher.exec(source);
  if (!match) return null;
  matcher.lastIndex = match.index + 1;
  if (matcher.test(source)) return null;
  return { start: match.index, end: match.index + match[0].length };
}

const hasStaleResult = progress => Boolean(progress.result && progress.checkedCode !== progress.code);
const current = () => state.participants.find(p => p.id === state.currentId);
const totalXP = () => Object.values(current().progress).reduce((sum, p) => sum + (p.xp || 0), 0);
const taskReward = progress => progress.solved ? progress.xp : reward(usedHelpLevel(progress));
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
const bulbIconPath = 'M9 17 V16 C9 15 8.6 14.3 7.9 13.6 A6 6 0 1 1 16.1 13.6 C15.4 14.3 15 15 15 16 V17 Z M10 20 H14';
function taskNavigationNumber(number, progress) {
  if (!progress?.solved) {
    return `<span class="task-navigation-number" aria-hidden="true">${escape(number)}</span>`;
  }
  const assisted = (progress.hintsAtSolve ?? progress.hints) > 0;
  const status = assisted ? 'assisted' : 'independent';
  const label = assisted ? 'Решено с подсказками' : 'Решено самостоятельно';
  const iconPath = assisted ? bulbIconPath : 'm4.5 12 4.5 4.5 10.5-10.5';
  return `<span class="task-navigation-number" data-completion="${status}" role="img" aria-label="${label}">${escape(number)}<svg class="task-navigation-status-icon" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPath}"/></svg></span>`;
}
function taskNavigation(activeTaskId) {
  return `<aside class="task-navigation">
    <nav aria-label="Список задач">${tasks.map((task, index) => `
      <a href="#task/${task.id}" ${task.id === activeTaskId ? 'aria-current="page"' : ''}>
        ${taskNavigationNumber(String(index + 1).padStart(2, '0'), current().progress[task.id])}
        <span>${escape(task.title)}</span>
      </a>`).join('')}
    </nav>
  </aside>`;
}
function shell(page, activeTaskId) {
  app.classList.toggle('has-task-navigation', page === 'workspace');
  app.innerHTML = `<header class="header"><a href="#home" class="brand" aria-label="CodeCoach на главную"><img src="./icon.svg" width="34" height="34" alt=""><span>Code<span class="muted">Coach</span></span></a>
    <nav aria-label="Основная навигация"><a href="#home" ${page === 'home' ? 'aria-current="page"' : ''}>Практика</a><a href="#report" ${page === 'report' ? 'aria-current="page"' : ''}>Результаты пилота</a></nav>
    <div class="header-right"><span class="local-indicator">Локальный прототип</span><span class="avatar" title="Анонимный участник">${state.participants.findIndex(p => p.id === state.currentId) + 1}</span></div></header>
    ${page === 'workspace' ? taskNavigation(activeTaskId) : ''}<main id="main" tabindex="-1"></main>
    <footer><span>CodeCoach · учебный прототип</span><span>JavaScript · без регистрации · прогресс в этом браузере</span></footer>`;
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
    <section class="principles"><div><span>01</span><h3>Настоящая проверка</h3><p>Твой код выполняется на тестовых данных прямо в браузере.</p></div><div><span>02</span><h3>Помощь по шагам</h3><p>От вопроса к объяснению. Решение открывается только на четвёртом шаге.</p></div><div><span>03</span><h3>Практика без ключей</h3><p>Подсказки по тестам и чат с локальной Qwen3.</p></div></section>`;
}

function taskChatPanel(task) {
  return `<div id="workspace-chat-panel" role="tabpanel" aria-labelledby="workspace-chat-tab" hidden>
    <section class="task-chat" id="task-chat" aria-labelledby="task-chat-title">
      <div class="task-chat-heading">
        <span class="task-chat-avatar" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" focusable="false">
            <path d="M12 3 V21 M3 12 H21 M5.6 5.6 L18.4 18.4 M5.6 18.4 L18.4 5.6"/>
          </svg>
        </span>
        <div class="task-chat-heading-text">
          <h3 id="task-chat-title" tabindex="-1">Чат по задаче</h3>
          <p class="task-chat-topic" title="${escape(task.title)}">${escape(task.title)}</p>
        </div>
        <button class="text-button task-chat-resize" id="task-chat-resize" type="button" aria-label="Расширить чат" title="Расширить чат">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path></path></svg>
        </button>
      </div>
      <div class="task-chat-log" id="task-chat-log" role="log" aria-label="Сообщения чата">
        <div class="task-chat-empty">
          <p>С чего начнём?</p>
          <div class="task-chat-suggestions">
            <button type="button" data-chat-prompt="Объясни условие текущей задачи простыми словами.">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3 H15 L19 7 V21 H5 V3 Z M14 3 V8 H19 M9 12 H15 M9 16 H13"/></svg>
              Разобрать условие <span aria-hidden="true">→</span>
            </button>
            <button type="button" data-chat-prompt="Помоги понять, где искать ошибку в моём коде.">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7 L3 12 L8 17 M16 7 L21 12 L16 17 M14 4 L10 20"/></svg>
              Найти ошибку <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <p class="task-chat-status" role="status"></p>
      </div>
      <form class="task-chat-composer" id="task-chat-form">
        <textarea id="task-chat-question" aria-label="Вопрос по задаче" rows="1" maxlength="1600" required placeholder="Напиши вопрос…"></textarea>
        <div class="task-chat-controls">
          <details class="task-chat-help" id="task-chat-help">
            <summary id="task-chat-level-label"><span id="task-chat-level-text"></span><svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9 L12 15 L18 9"/></svg></summary>
            <div class="task-chat-help-options" role="group" aria-label="Глубина помощи">
              <label id="task-chat-level-description" for="task-chat-level"></label>
              <div class="task-chat-slider">
                <span class="task-chat-slider-marks" aria-hidden="true">${taskChatHelpLevels.map(() => '<i></i>').join('')}</span>
                <input type="range" id="task-chat-level" aria-label="Глубина помощи" min="1" max="${taskChatHelpLevels.length}" step="1" value="1">
              </div>
            </div>
          </details>
          <button class="button task-chat-submit" type="submit" aria-label="Отправить вопрос" title="Отправить вопрос">
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 3 L11 13 M21 3 L15 21 L11 13 L3 9 Z"/>
            </svg>
          </button>
        </div>
      </form>
    </section>
  </div>`;
}

function bindTaskChat(task, progress, editor) {
  let chat = taskChats.get(progress);
  if (!chat) {
    chat = { messages: [], draft: '', helpLevel: '1', activeTab: 'workspace-hints-tab', expanded: false, sending: false, error: '' };
    taskChats.set(progress, chat);
  }
  const log = document.querySelector('#task-chat-log');
  const question = document.querySelector('#task-chat-question');
  const submit = document.querySelector('.task-chat-submit');
  const status = document.querySelector('.task-chat-status');
  const helpLabel = document.querySelector('#task-chat-level-label');
  const level = document.querySelector('#task-chat-level');
  const levelDescription = document.querySelector('#task-chat-level-description');
  const levelText = document.querySelector('#task-chat-level-text');
  const panel = document.querySelector('#task-chat');
  const workspaceHelp = panel.closest('#workspace-help');
  const tabs = [...document.querySelectorAll('.workspace-side-tabs [role="tab"]')];
  const resize = document.querySelector('#task-chat-resize');
  const resizeIcon = resize.querySelector('path');
  function resizeQuestion() {
    question.style.height = 'auto';
    question.style.height = `${Math.max(28, Math.min(question.scrollHeight, 96))}px`;
  }
  function selectTab(tab) {
    chat.activeTab = tab.id;
    for (const option of tabs) {
      const selected = option === tab;
      option.setAttribute('aria-selected', String(selected));
      option.tabIndex = selected ? 0 : -1;
      document.getElementById(option.getAttribute('aria-controls')).hidden = !selected;
    }
    if (tab.id === 'workspace-chat-tab') {
      resizeQuestion();
      log.scrollTop = log.scrollHeight;
    }
  }
  function setExpanded(expanded) {
    chat.expanded = expanded;
    panel.classList.toggle('is-expanded', expanded);
    const label = expanded ? 'Уменьшить чат' : 'Расширить чат';
    resize.setAttribute('aria-label', label);
    resize.title = label;
    resizeIcon.setAttribute('d', expanded
      ? 'M21 3l-7 7M14 4v6h6M3 21l7-7M4 14h6v6'
      : 'M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7');
    resizeQuestion();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', e => {
      let next;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') next = tabs[1 - index];
      if (e.key === 'Home') next = tabs[0];
      if (e.key === 'End') next = tabs[1];
      if (!next) return;
      e.preventDefault();
      selectTab(next);
      next.focus();
    });
  });
  resize.addEventListener('click', () => setExpanded(!chat.expanded));
  panel.querySelectorAll('[data-chat-prompt]').forEach(button => {
    button.addEventListener('click', () => {
      question.value = button.dataset.chatPrompt;
      question.dispatchEvent(new Event('input'));
      question.focus();
    });
  });
  function applyEdit(message) {
    if (!editor.isConnected) return 'Откройте задачу, чтобы применить правку.';
    if (editor.disabled) return 'Дождитесь завершения проверки кода.';
    if (editor.value !== message.code) return 'Код в редакторе изменился. Запросите новую правку.';
    const { before, after } = message.edit;
    const range = findCodeEditRange(editor.value, before);
    if (!range) return 'Не удалось однозначно найти фрагмент. Запросите новую правку.';
    editor.setRangeText(after, range.start, range.end);
    editor.dispatchEvent(new Event('input'));
    message.editApplied = true;
    return '';
  }
  chat.applyEdit = applyEdit;
  function appendMessage(message) {
    const { text, answer, edit, editApplied, editError } = message;
    log.insertAdjacentHTML('beforeend', `<article class="task-chat-message">
      <p>${escape(text)}</p>
    </article>${answer ? `<article class="task-chat-message task-chat-reply"><strong>Qwen3</strong>${renderChatAnswer(answer)}
      ${editApplied ? '<p>Правка применена.</p>' : editError ? `<p>${escape(editError)}</p>` : ''}
      ${edit ? `<details ${editApplied ? '' : 'open'}><summary>${editApplied ? 'Что изменилось' : 'Предложенная правка'}</summary>
        ${codeSample(edit.before || 'Пустой редактор', 'Было', Boolean(edit.before))}
        ${codeSample(edit.after || 'Удалить фрагмент', 'Станет', Boolean(edit.after))}
        ${editApplied ? '' : '<button class="button secondary small" type="button">Применить правку</button>'}
      </details>` : ''}
    </article>` : ''}`);
    if (edit && !editApplied) log.lastElementChild.querySelector('button').addEventListener('click', () => {
      const error = applyEdit(message);
      if (error) return notify(error);
      renderChat();
    });
  }
  function renderChat() {
    if (!panel.isConnected) return;
    document.querySelector('#workspace-xp').textContent = taskReward(progress);
    if (chat.messages.length) {
      log.replaceChildren();
      chat.messages.forEach(appendMessage);
    }
    if (chat.sending) {
      status.innerHTML = '<span role="img" aria-label="Qwen3 готовит ответ">•••</span>';
    } else {
      status.textContent = chat.error;
    }
    log.append(status);
    if (chat.messages.length || chat.error) log.scrollTop = log.scrollHeight;
    if (question.value !== chat.draft) question.value = chat.draft;
    updateQuestion();
  }
  chat.render = renderChat;
  setExpanded(chat.expanded);
  selectTab(document.getElementById(chat.activeTab));
  workspaceHelp.addEventListener('toggle', () => {
    if (workspaceHelp.isConnected && workspaceHelp.open) selectTab(document.getElementById(chat.activeTab));
  });
  renderChat();
  level.value = chat.helpLevel;
  function updateHelpLevel() {
    chat.helpLevel = level.value;
    const levelIndex = level.valueAsNumber - 1;
    levelText.textContent = taskChatHelpLabels[levelIndex];
    helpLabel.setAttribute('aria-label', `Глубина помощи — ${taskChatHelpLevels[levelIndex]}`);
    levelDescription.textContent = taskChatHelpLevels[levelIndex];
    level.setAttribute('aria-valuetext', taskChatHelpLevels[levelIndex]);
    level.parentElement.style.setProperty('--level-progress', levelIndex / (taskChatHelpLevels.length - 1));
  }
  updateHelpLevel();
  level.addEventListener('input', updateHelpLevel);
  function updateQuestion() {
    chat.draft = question.value;
    submit.disabled = chat.sending || !question.value.trim();
    resizeQuestion();
  }
  question.addEventListener('input', updateQuestion);
  question.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    if (!e.repeat && !submit.disabled) question.form.requestSubmit(submit);
  });
  document.querySelector('#task-chat-form').addEventListener('submit', async e => {
    e.preventDefault();
    const text = question.value.trim();
    if (chat.sending) return;
    if (text.length < 5) {
      chat.error = 'Напишите вопрос минимум из 5 символов.';
      renderChat();
      return;
    }
    const result = progress.result;
    const tests = (hasStaleResult(progress) ? 'Код изменён после проверки. Предыдущий результат: ' : '')
      + (result?.error || (result ? `Пройдено ${result.passed} из ${result.total}` : 'Код ещё не проверен'));
    const autoApply = taskChatEditCommand.test(text);
    const message = { text, helpLevel: autoApply ? 4 : Number(chat.helpLevel), code: editor.value };
    const context = `\n\nЗадача: ${task.title}. ${task.description}\n${task.contract}\nПроверка: ${tests.slice(0, 200)}\nКод:\n${message.code}`;
    const previous = autoApply && chat.messages.findLast(entry => entry.answer && entry.code === message.code);
    const historyLimit = Math.min(400, Math.max(0, question.maxLength - text.length - context.length));
    const history = previous ? `\n\nПредыдущий ответ чата:\n${previous.answer}`.slice(0, historyLimit) : '';
    chat.messages.push(message);
    chat.draft = '';
    chat.error = '';
    chat.sending = true;
    renderChat();
    question.focus();
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: (text + history + context).slice(0, question.maxLength),
          helpLevel: message.helpLevel,
          allowCodeEdit: message.helpLevel === 4
        }),
        signal: AbortSignal.timeout(140000)
      });
      const data = await response.json();
      if (response.ok && data?.ok && typeof data.answer === 'string' && data.answer.trim()) {
        message.answer = data.answer;
        if (!progress.solved && message.helpLevel > (progress.chatHelpLevel ?? 0)) {
          progress.chatHelpLevel = message.helpLevel;
          persist();
        }
        const { edit } = data;
        if (message.helpLevel === 4 && !data.truncated && typeof edit?.before === 'string' && typeof edit.after === 'string' && edit.before !== edit.after) {
          message.edit = edit;
        }
        if (autoApply) {
          message.editError = message.edit ? chat.applyEdit(message) : 'Qwen3 не вернула правку для редактора. Повторите запрос.';
        }
      } else {
        chat.error = data?.error || 'Qwen3 не вернула ответ.';
      }
    } catch {
      chat.error = 'Не удалось получить ответ Qwen3. Повторите запрос.';
    } finally {
      if (chat.error && !chat.draft) chat.draft = text;
      chat.sending = false;
      chat.render();
    }
  });
}

function workspace(task) {
  const p = getProgress(current(), task);
  if (p.result && p.checkedCode === undefined) p.checkedCode = p.code;
  const helpOpen = openHelpPanels.has(p);
  if (!p.startedAt) { p.startedAt = Date.now(); event('task_opened', { taskId: task.id }); persist(); }
  const main = shell('workspace', task.id);
  main.innerHTML = `<div class="workspace-breadcrumb"><a href="#home">← Все задачи</a><span>ПРАКТИКА / ${escape(task.category.toUpperCase())}</span></div>
    <section class="workspace-title">
      <div class="workspace-heading"><div class="eyebrow">${task.transfer ? 'ШАГ 02 · ПРОВЕРКА ПЕРЕНОСА НАВЫКА' : 'ПРАКТИЧЕСКАЯ ЗАДАЧА'}</div><h1>${task.title}</h1></div>
      <dl class="workspace-meta">
        <div><dt>Язык</dt><dd>JavaScript</dd></div>
        <div class="workspace-reward" title="Награда с учётом открытых подсказок">
          <dt id="workspace-xp-label">${p.solved ? 'Начислено' : 'За решение'}</dt>
          <dd><span id="workspace-xp">${taskReward(p)}</span> <small>XP</small></dd>
        </div>
      </dl>
    </section>
    <div class="workspace-layout">
    <div class="workspace-help-column">
    <details class="workspace-side" id="workspace-help" ${helpOpen ? 'open' : ''}>
      <summary class="workspace-help-toggle" aria-label="${task.transfer ? 'Самостоятельная практика' : 'Подсказки и чат'}">
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="${bulbIconPath}"/>
        </svg>
        <span>${task.transfer ? 'Практика' : 'Подсказки'}</span>
        <svg class="workspace-help-close" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M6 6 L18 18 M18 6 L6 18"/>
        </svg>
      </summary>
      <div class="workspace-side-content">
    ${task.transfer ? '' : `<div class="workspace-side-tabs" role="tablist" aria-label="Помощь по задаче">
      <button type="button" id="workspace-hints-tab" role="tab" aria-selected="true" aria-controls="workspace-hints-panel">Подсказки</button>
      <button type="button" id="workspace-chat-tab" role="tab" aria-selected="false" aria-controls="workspace-chat-panel" tabindex="-1">Чат</button>
    </div>
    <div id="workspace-hints-panel" role="tabpanel" aria-labelledby="workspace-hints-tab">`}
    <aside class="coach-panel"><div class="coach-heading"><span class="coach-symbol">✳</span><div><h2>Твой наставник</h2><span>${task.transfer ? 'Самостоятельная практика' : 'Подсказки по результатам тестов'}</span></div><span class="live-dot"></span></div><div class="coach-body"><div class="coach-intro">${task.transfer ? 'Попробуй применить то, что узнал в первой задаче. Здесь доступны тесты, а подсказки отключены.' : 'Нажми «Проверить», когда будешь готов. По результатам попытки можно открыть подсказку.'}</div><div class="hint-steps" aria-label="Уровни помощи">${[1, 2, 3, 4].map(n => `<span class="${p.hints >= n ? 'used' : ''}">${n}</span>`).join('<i></i>')}</div><div id="hints">${(p.hintHistory || []).map(hintCard).join('')}</div><div id="coach-action"></div></div><div class="coach-footer">Наставник на правилах · без внешней AI-модели<br>Тесты выполняются в этом браузере.</div></aside>
    ${task.transfer ? '' : `</div>${taskChatPanel(task)}`}
      </div>
    </details>
    </div>
    <div class="coding-column">
    <section class="editor-panel" aria-label="Условие и редактор решения">
      <details class="brief" id="task-brief" ${collapsedBriefs.has(p) ? '' : 'open'}>
        <summary>
          <svg class="brief-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 3 H14 L19 8 V21 H6 Z M14 3 V8 H19 M9 12 H15 M9 16 H13"/>
          </svg>
          Условие
          <svg class="brief-chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9 L12 15 L18 9"/>
          </svg>
        </summary>
        <div class="brief-content">
          <p>${task.description}</p>
          <p class="contract">${task.contract}</p>
          ${codeSample(task.example, 'Пример')}
        </div>
      </details>
      <div class="editor-wrap">
        <div class="editor-actions">
          <button class="text-button" id="prettify-code" type="button" aria-label="Форматировать код" title="Форматировать код">
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
              <path d="M4 5 H20 M4 10 H15 M4 15 H20 M4 20 H15"/>
            </svg>
          </button>
          <button class="text-button" id="reset-code" type="button" aria-label="Вернуть стартовый код" title="Вернуть стартовый код">
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12 A9 9 0 1 1 12 21 M3 6 V12 H9"/>
            </svg>
          </button>
        </div>
        <pre class="line-numbers" aria-hidden="true"><span id="line-numbers"></span></pre>
        <div class="editor-source">
          <pre class="editor-highlight" aria-hidden="true"><code id="code-highlight" class="syntax-highlight"></code></pre>
          <textarea id="code-editor" aria-label="Код решения JavaScript" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
        </div>
      </div>
    </section>
    </div>
    <div class="workspace-results-column">
    <div class="workspace-results">
      <section class="tests-panel" aria-live="polite">
        <div class="tests-heading">
          <div>
            <h2>Тесты <span id="test-count"></span></h2>
            <p class="tests-attempts" title="Одна ручная проверка — одна попытка">Попыток <b id="attempts">${p.attempts}</b></p>
          </div>
          <button class="button primary check-code" id="check-code" type="button" title="Проверить код · Ctrl/⌘+Enter · Лимит выполнения 1,8 с" aria-keyshortcuts="Control+Enter Meta+Enter">
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2 L13 8 L4 14 Z"/></svg>
            <span id="check-code-label">Проверить</span>
          </button>
        </div>
        <p class="tests-stale-note" id="test-result-status" hidden>Код изменён — результаты предыдущей проверки.</p>
        <div id="tests"></div>
      </section>
      <div id="success"></div>
    </div>
    </div>
    </div>`;
  const editor = document.querySelector('#code-editor');
  const highlight = document.querySelector('#code-highlight');
  const lineNumbers = document.querySelector('#line-numbers');
  const prettify = document.querySelector('#prettify-code');
  const testsPanel = document.querySelector('.tests-panel');
  const checkButton = document.querySelector('#check-code');
  const checkLabel = document.querySelector('#check-code-label');
  let checking = false;

  async function checkCurrentCode() {
    if (checking || !editor.isConnected) return;
    const source = p.code;
    const helpLevel = usedHelpLevel(p);
    checking = true;
    checkButton.disabled = true;
    checkLabel.textContent = 'Проверка…';
    const hintButton = document.querySelector('#hint');
    if (hintButton) hintButton.disabled = true;
    testsPanel.setAttribute('aria-busy', 'true');
    const result = await runCode(source, task).catch(() => ({
      kind: 'runtime', error: 'Не удалось запустить проверку. Нажмите «Проверить» ещё раз.', results: []
    }));
    checking = false;
    if (!editor.isConnected) return;
    checkButton.disabled = false;
    checkLabel.textContent = 'Проверить';
    testsPanel.setAttribute('aria-busy', 'false');
    if (recordResult(p, result, Date.now(), helpLevel)) {
      p.xp = reward(p.hintsAtSolve);
      event('task_solved', { taskId: task.id, xp: p.xp, hints: p.hintsAtSolve, attempts: p.attempts });
      const number = document.querySelector('.task-navigation a[aria-current="page"] .task-navigation-number');
      if (number) number.outerHTML = taskNavigationNumber(number.textContent, p);
    }
    event('code_checked', { taskId: task.id, trigger: 'manual', passed: result.passed || 0, total: result.total || 0, kind: result.kind || 'tests' });
    p.checkedCode = source;
    document.querySelector('#attempts').textContent = p.attempts;
    document.querySelector('#workspace-xp').textContent = taskReward(p);
    document.querySelector('#workspace-xp-label').textContent = p.solved ? 'Начислено' : 'За решение';
    persist();
    renderResult(task, p);
  }
  checkButton.addEventListener('click', checkCurrentCode);
  const helpPanel = document.querySelector('#workspace-help');
  const helpToggle = helpPanel.querySelector('summary');
  helpPanel.addEventListener('toggle', () => {
    if (!helpPanel.isConnected) return;
    if (helpPanel.open) openHelpPanels.add(p);
    else openHelpPanels.delete(p);
  });
  const brief = document.querySelector('#task-brief');
  brief.addEventListener('toggle', () => {
    if (!brief.isConnected) return;
    if (brief.open) collapsedBriefs.delete(p);
    else collapsedBriefs.add(p);
  });
  editor.value = p.code;
  if (!task.transfer) bindTaskChat(task, p, editor);
  function syncScroll() {
    highlight.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    lineNumbers.style.transform = `translateY(${-editor.scrollTop}px)`;
  }
  function renderCode() {
    highlight.innerHTML = highlightCode(editor.value);
    lineNumbers.textContent = editor.value.split('\n').map((_, i) => i + 1).join('\n');
    syncScroll();
  }
  renderCode();
  editor.addEventListener('input', () => {
    if (p.code === editor.value) return;
    p.code = editor.value;
    renderCode();
    persist();
    document.querySelector('#test-result-status').hidden = !hasStaleResult(p);
  });
  editor.addEventListener('scroll', syncScroll);
  editor.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
      e.preventDefault();
      if (!e.repeat) checkCurrentCode();
      return;
    }
    if (e.key === 'Tab') { e.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); editor.dispatchEvent(new Event('input')); }
    if (e.key === 'Escape') { e.preventDefault(); helpToggle.focus(); }
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
  document.querySelector('#reset-code').addEventListener('click', () => {
    editor.value = task.starter;
    editor.dispatchEvent(new Event('input'));
    notify('Стартовый код восстановлен. История попыток сохранена.');
  });
  renderResult(task, p);
}
function hintCard(hint) { return `<article class="hint-card"><h3>${escape(hint.title)}</h3><p>${escape(hint.text)}</p>${hint.code ? `<pre>${escape(hint.code)}</pre>` : ''}</article>`; }
function renderResult(task, p) {
  const result = p.result, solvedNow = result?.total > 0 && result.passed === result.total;
  document.querySelector('#test-result-status').hidden = !hasStaleResult(p);
  if (task.transfer) document.querySelector('.hint-steps')?.remove();
  else if (result) document.querySelector('.coach-intro').textContent = solvedNow ? 'Все проверки пройдены. Попробуй применить идею самостоятельно в следующей задаче.' : result.error ? 'Проверка заметила ошибку выполнения. Сообщение под редактором и подсказка помогут найти причину.' : `Пройдено ${result.passed} из ${result.total} тестов. Сравни входы и результаты неудачных примеров. Если застрял, открой подсказку.`;
  else document.querySelector('.coach-intro').textContent = 'Нажми «Проверить», когда будешь готов. По результатам попытки можно открыть подсказку.';
  document.querySelector('#test-count').textContent = result?.total ? `${result.passed} / ${result.total}` : `— / ${task.tests.length}`;
  const tests = document.querySelector('#tests');
  if (result?.error) {
    tests.innerHTML = `<div class="error-box"><b>${result.kind === 'timeout' ? 'Проверка остановлена' : 'Ошибка в коде'}</b><p>${escape(result.error)}</p></div>`;
  } else {
    const cases = result?.results?.length ? result.results : task.tests.map(test => ({
      label: test.label,
      input: JSON.stringify(test.input)
    }));
    tests.innerHTML = cases.map(test => {
      const outcome = test.passed === undefined ? 'pending' : test.passed ? 'pass' : 'fail';
      const status = {
        pending: 'Ожидает проверки',
        pass: 'Пройден',
        fail: 'Не пройден'
      }[outcome];
      return `<div class="test-row ${outcome}">
        <span class="test-icon" role="img" aria-label="${status}" title="${status}"></span>
        <div class="test-content">
          <b class="test-name">${escape(test.label)}</b>
          <code class="test-input">${escape(task.fn)}(${escape(test.input)})</code>
          ${test.passed === false ? `<dl class="test-comparison">
            <div><dt>Ожидалось</dt><dd>${escape(test.expected)}</dd></div>
            <div class="test-actual"><dt>Получено</dt><dd>${escape(test.actual)}</dd></div>
          </dl>` : ''}
        </div>
      </div>`;
    }).join('');
  }
  document.querySelector('#success').innerHTML = solvedNow ? `<section class="success-box"><span class="success-icon">✓</span><div><h2>Все тесты пройдены</h2><p>${p.hintsAtSolve === 4 ? 'Решение проверено. Теперь попробуйте перенести идею на другую задачу.' : 'Отличная работа. Закрепите идею в следующем упражнении.'} За первое решение: ${p.xp} XP.</p><a class="button primary small" href="${task.id === 'maximum' ? '#task/minimum' : task.id === 'minimum' ? '#report' : '#home'}">${task.id === 'maximum' ? 'Проверить себя без подсказок' : task.id === 'minimum' ? 'Посмотреть результат сессии' : 'К учебному маршруту'} →</a></div></section>` : '';
  const action = document.querySelector('#coach-action');
  action.innerHTML = task.transfer ? '<p class="panel-note">Для чистоты эксперимента решайте задачу самостоятельно. Запускайте тесты кнопкой «Проверить».</p>' : solvedNow ? '<p class="coach-done">✓ Задача решена. Пора проверить навык!</p>' : p.hints >= 4 ? '<p class="panel-note">Все уровни помощи открыты. Примените решение в редакторе и нажмите «Проверить».</p>' : `<button class="button ${p.hints === 3 ? 'outline' : 'secondary'} full" id="hint" ${!result ? 'disabled' : ''}>${p.hints === 3 ? 'Открыть готовое решение · шаг 4' : p.hints ? 'Следующая подсказка · шаг ' + (p.hints + 1) : 'Получить первую подсказку'}</button><p class="panel-note">${!result ? 'Подсказка появится после проверки кода.' : p.hints === 3 ? 'После открытия решения награда составит 20 XP.' : 'Готовый код появится только на четвёртом шаге.'}</p>`;
  document.querySelector('#hint')?.addEventListener('click', () => {
    p.hints++; const hint = coachHint(task, p.result, p.hints); p.hintHistory.push(hint);
    event('hint_opened', { taskId: task.id, level: p.hints }); persist(); workspace(task);
  });
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
  main.innerHTML = `<section class="report-intro"><div class="eyebrow">ПРОВЕРКА ПРОДУКТОВОЙ ГИПОТЕЗЫ</div><h1>От ошибки к пониманию</h1><p class="lead">Помогают ли пошаговые подсказки решить задачу<br>и применить идею самостоятельно?</p><div class="report-actions"><button class="button primary small" id="export">↓ Выгрузить JSON</button><button class="button secondary small" id="new-participant">+ Новый участник</button></div></section>
    <section class="report-stats" aria-label="Метрики эксперимента"><div><strong>${s.started}</strong><span>начали первую задачу</span></div><div><strong>${s.guided}</strong><span>решили за ≤ 10 мин без ответа</span></div><div><strong>${s.assistedTransfer}</strong><span>затем решили перенос</span></div><div><strong>${s.started ? Math.round(s.assistedTransfer / s.started * 100) : 0}%</strong><span>прошли весь сценарий</span></div></section>
    <section class="hypothesis-result"><span class="tag ${s.enough ? 'lilac' : ''}">${s.enough ? 'Есть минимальная выборка' : 'Пока недостаточно данных'}</span><h2>${!s.enough ? 'Соберите минимум 5 прохождений' : s.supported ? 'Порог пилота достигнут' : 'Порог пилота пока не достигнут'}</h2><p>Критерий, выбранный для пилота: не менее 60% участников решают первую задачу за 10 минут, не открывая готовое решение, и затем решают вторую без подсказок. Минимум — 5 участников.</p><p class="muted">Это предварительный сигнал. Без контрольной группы он не доказывает превосходство подсказок над другими форматами обучения. Паузы входят во время прохождения.</p></section>
    <section class="session-section"><div class="section-heading"><h2>Прохождения в этом браузере</h2><p class="muted">Анонимные сессии. Новый участник начинает с чистого редактора и нулевого прогресса.</p></div><div class="table-scroll"><table><thead><tr><th>Участник</th><th>Максимум</th><th>Время до решения</th><th>Попытки / подсказки</th><th>Перенос навыка</th></tr></thead><tbody>${state.participants.map((p, i) => {
      const t = p.progress.maximum, next = p.progress.minimum, validTransfer = t?.solved && next?.solved && next.startedAt >= t.solvedAt;
      return `<tr><td><b>Участник ${i + 1}</b>${p.id === state.currentId ? '<small>текущая сессия</small>' : ''}</td><td>${t?.solved ? '✓ Решено' : t?.startedAt ? 'В процессе' : 'Не начато'}</td><td>${duration(t)}</td><td>${t?.attempts ?? 0} / ${t?.hints ?? 0}</td><td>${validTransfer ? '✓ Решено после максимума' : next?.solved ? 'Решено вне сценария' : next?.startedAt ? 'В процессе' : 'Не начато'}</td></tr>`;
    }).join('')}</tbody></table></div></section>
    <div class="report-bottom"><section class="feedback-section"><div class="eyebrow">РЕФЛЕКСИЯ УЧАСТНИКА ${state.participants.findIndex(p => p.id === state.currentId) + 1}</div><h2>Что стало понятнее?</h2><form id="feedback-form"><label for="rating">Насколько полезны подсказки?</label><select id="rating" required><option value="">Выберите оценку</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${participant.feedback?.rating === n ? 'selected' : ''}>${n} — ${['совсем не помогли', 'скорее не помогли', 'частично помогли', 'помогли', 'очень помогли'][n - 1]}</option>`).join('')}</select><label for="reflection">Почему начальный ноль может дать неправильный результат?</label><textarea id="reflection" rows="3" maxlength="1200" placeholder="Объясните своими словами. Не указывайте личные данные." required>${escape(participant.feedback?.reflection || '')}</textarea><button class="button secondary small" type="submit">Сохранить ответ</button><span id="feedback-state" role="status">${participant.feedback ? 'Ответ сохранён' : ''}</span></form></section><aside class="pilot-note"><h2>Как провести пилот</h2><ol><li>Нажмите «Новый участник» перед каждым тестированием.</li><li>Дайте человеку решить максимум, затем минимум.</li><li>Не подсказывайте вне интерфейса. Запишите ответ участника.</li><li>Выгрузите JSON после пяти прохождений.</li></ol><p>Данные не отправляются на сервер. Экспорт содержит код решений и события сессий — делитесь им с согласия участников.</p><button class="text-button danger" id="clear-data">Удалить все локальные результаты</button><div id="clear-confirm"></div></aside></div>`;
  document.querySelector('#export').addEventListener('click', download);
  document.querySelector('#new-participant').addEventListener('click', () => { const p = newParticipant(); state.participants.push(p); state.currentId = p.id; persist(); location.hash = '#home'; notify('Новая сессия готова. Предыдущие результаты сохранены.'); });
  document.querySelector('#feedback-form').addEventListener('submit', e => { e.preventDefault(); participant.feedback = { rating: Number(document.querySelector('#rating').value), reflection: document.querySelector('#reflection').value.trim(), at: Date.now() }; event('feedback_saved'); persist(); document.querySelector('#feedback-state').textContent = 'Ответ сохранён'; });
  document.querySelector('#clear-data').addEventListener('click', () => {
    document.querySelector('#clear-confirm').innerHTML = '<p>Удалить все сессии? Сначала выгрузите JSON, если нужны результаты.</p><button class="button outline small" id="confirm-clear">Да, удалить результаты</button>';
    document.querySelector('#confirm-clear').addEventListener('click', () => { const p = newParticipant(); state = { version: 1, participants: [p], currentId: p.id }; persist(); report(); notify('Локальные результаты удалены. Создана пустая сессия.'); });
  });
}
function render() {
  const hash = location.hash || '#home';
  if (hash.startsWith('#task/')) { const task = getTask(hash.slice(6)); if (task) { workspace(task); window.scrollTo(0, 0); return; } }
  if (hash === '#report') report(); else home();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
let helpPointerStart = null;
document.addEventListener('pointerdown', event => {
  const help = document.querySelector('#task-chat-help');
  helpPointerStart = help?.contains(event.target) ? help : null;
}, true);
document.addEventListener('pointercancel', () => { helpPointerStart = null; }, true);
document.addEventListener('click', event => {
  const help = document.querySelector('#task-chat-help');
  // Releasing a slider drag outside the popup is not an outside click.
  const startedInside = event.detail > 0 && helpPointerStart === help;
  helpPointerStart = null;
  if (help?.open && !help.contains(event.target) && !startedInside) help.open = false;
}, true);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const help = document.querySelector('#task-chat-help');
  if (!help?.open) return;
  event.preventDefault();
  event.stopPropagation();
  help.open = false;
  help.querySelector('summary').focus();
}, true);
document.addEventListener('click', event => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); document.querySelector('#main').focus(); }
});
persist();
render();
