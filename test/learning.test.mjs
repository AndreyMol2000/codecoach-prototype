import test from 'node:test';
import assert from 'node:assert/strict';
import { tasks, getTask } from '../public/tasks.js';
import { execute } from '../public/runner-core.js';
import { reward, coachHint, recommendation, experimentSummary } from '../public/learning.js';
import { loadState, saveState, newParticipant, getProgress, recordResult, usedHelpLevel } from '../public/store.js';

test('Стартовая ошибка максимума действительно проявляется на отрицательных данных', () => {
  const t = getTask('maximum'), r = execute(t.starter, t);
  assert.equal(r.total, 6); assert.equal(r.passed, 3);
  assert.equal(r.results.find(t => t.label === 'Все числа отрицательные').actual, '0');
  assert.equal(r.results.find(t => t.label === 'Все числа отрицательные').expected, '-3');
});
for (const task of tasks) {
  test(`Эталонное решение проходит все тесты: ${task.id}`, () => {
    const r = execute(task.solution, task); assert.equal(r.passed, task.tests.length);
  });
}
test('Проверка зависит от кода, а не от совпадения с эталонной строкой', () => {
  assert.equal(execute('const findMax = values => Math.max(...values);', getTask('maximum')).passed, 6);
  assert.equal(execute('function findMax() { return 7; }', getTask('maximum')).passed, 1);
});
test('Ошибки синтаксиса и имени функции не становятся успешным решением', () => {
  assert.equal(execute('function findMax( {', getTask('maximum')).kind, 'syntax');
  assert.match(execute('function wrong() {}', getTask('maximum')).error, /findMax/);
});
test('Исключения и неверный тип результата отражаются в тестах', () => {
  const r = execute('function findMax(){ throw new Error("test failure"); }', getTask('maximum'));
  assert.equal(r.passed, 0); assert.equal(r.results[0].runtime, true);
  assert.match(r.results[0].actual, /test failure/);
  assert.equal(execute('function findMax(){ return "7"; }', getTask('maximum')).passed, 0);
  assert.equal(execute('async function findMax(){ return 7; }', getTask('maximum')).passed, 0);
});
test('Первые три подсказки не содержат готового кода, четвёртая раскрывает решение', () => {
  const t = getTask('maximum'), r = execute(t.starter, t);
  for (let n = 1; n <= 3; n++) assert.equal(coachHint(t, r, n).code, undefined);
  assert.match(coachHint(t, r, 1).text, /-10,-3,-20/);
  assert.equal(coachHint(t, r, 4).code, t.solution);
});
test('Подсказки учитывают синтаксис, зависший цикл и исключение', () => {
  const t = getTask('maximum');
  assert.match(coachHint(t, { kind: 'syntax' }, 1).title, /синтаксис/);
  assert.match(coachHint(t, { kind: 'timeout' }, 1).title, /цикл/);
  assert.match(coachHint(t, { results: [{ passed: false, runtime: true, input: '[]', expected: '0', actual: 'Error' }] }, 1).title, /выполнение/);
});
test('Награда уменьшается с помощью и не начисляется повторно', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(reward), [100, 80, 60, 40, 20]);
  const p = getProgress(newParticipant(), getTask('maximum'));
  p.hints = 2;
  assert.equal(recordResult(p, { passed: 6, total: 6 }, 1000), true);
  assert.equal(recordResult(p, { passed: 6, total: 6 }, 2000), false);
  assert.equal(p.solvedAt, 1000); assert.equal(p.hintsAtSolve, 2); assert.equal(p.attempts, 2);
});
test('Готовый ответ Qwen учитывается как четвёртый уровень помощи', () => {
  const task = getTask('maximum');
  const participant = newParticipant();
  const progress = getProgress(participant, task);
  progress.startedAt = 1000;
  progress.chatHelpLevel = 4;

  const submittedHelpLevel = usedHelpLevel(progress);
  assert.equal(recordResult(progress, execute(task.solution, task), 2000, submittedHelpLevel), true);
  assert.equal(progress.hints, 0);
  assert.equal(progress.hintsAtSolve, 4);
  assert.equal(reward(progress.hintsAtSolve), 20);
  assert.equal(experimentSummary([participant]).guided, 0);
});
test('Маршрут направляет от исправления к задаче переноса', () => {
  assert.equal(recommendation({}).id, 'maximum');
  assert.equal(recommendation({ maximum: { solved: true } }).id, 'minimum');
  assert.equal(recommendation({ maximum: { solved: true }, minimum: { solved: true } }).id, 'even');
  assert.equal(getTask('minimum').hints.length, 0);
});
test('Метрика гипотезы требует полного сценария, выборки и соблюдения порядка', () => {
  const make = () => ({ progress: { maximum: { startedAt: 1000, solvedAt: 301000, solved: true, hints: 2, hintsAtSolve: 2 }, minimum: { startedAt: 302000, solvedAt: 303000, solved: true } } });
  assert.equal(experimentSummary([]).supported, false);
  assert.equal(experimentSummary([make()]).enough, false);
  assert.equal(experimentSummary(Array.from({ length: 5 }, make)).supported, true);
  const fullAnswer = make(); fullAnswer.progress.maximum.hintsAtSolve = 4;
  assert.equal(experimentSummary([fullAnswer]).assistedTransfer, 0);
  const tooLong = make(); tooLong.progress.maximum.solvedAt = 700000;
  assert.equal(experimentSummary([tooLong]).guided, 0);
  const wrongOrder = make(); wrongOrder.progress.minimum.startedAt = 2000;
  assert.equal(experimentSummary([wrongOrder]).transfer, 0);
});
test('Позднее открытие решения не переписывает исторический успех', () => {
  const p = { progress: { maximum: { startedAt: 1000, solvedAt: 2000, solved: true, hints: 4, hintsAtSolve: 1 } } };
  assert.equal(experimentSummary([p]).guided, 1);
});
test('Локальное хранилище восстанавливает прогресс, повреждённые данные не ломают запуск', () => {
  const mem = { value: '', getItem() { return this.value; }, setItem(key, value) { this.value = value; } };
  const initial = loadState(mem); getProgress(initial.participants[0], getTask('maximum')).code = 'my draft';
  assert.equal(saveState(initial, mem), true);
  assert.equal(loadState(mem).participants[0].progress.maximum.code, 'my draft');
  mem.value = '{invalid'; assert.equal(loadState(mem).version, 1);
  mem.value = JSON.stringify({ version: 1, currentId: 'x', participants: [null] }); assert.equal(loadState(mem).participants.length, 1);
  assert.equal(saveState(initial, { setItem() { throw Error('quota'); } }), false);
});
