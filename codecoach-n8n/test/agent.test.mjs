import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, addLearningContext, checkNumericExample, buildModelRequest, parseModelResponse, formatAnswer } from '../src/agent-logic.mjs';
test('Валидация ограничивает пустой, длинный запрос и неверную глубину помощи', () => {
  assert.equal(normalizeInput({ body: { question: ' ' } }).valid, false);
  assert.equal(normalizeInput({ question: 'x'.repeat(1601) }).valid, false);
  assert.equal(normalizeInput({ question: 'JavaScript', helpLevel: 5 }).valid, false);
  const data = normalizeInput({ body: { question: '  Почему max = 0?  ', helpLevel: 2 } }, 1000);
  assert.equal(data.valid, true); assert.equal(data.question, 'Почему max = 0?'); assert.equal(data.requestedAt, 1000);
});
test('В модель передаётся конкретный вопрос и выбранный уровень помощи', () => {
  const data = buildModelRequest(addLearningContext(normalizeInput({ question: 'Почему max = 0 неверен для отрицательных чисел?', helpLevel: 1 })));
  assert.equal(data.llmRequest.messages[1].content, data.question);
  assert.match(data.llmRequest.messages[0].content, /Не пиши код/);
  assert.match(data.topic, /начальное/);
  const full = buildModelRequest(addLearningContext(normalizeInput({ question: 'Как исправить return?', helpLevel: 4 })));
  assert.match(full.llmRequest.messages[0].content, /разрешил готовое решение/);
});
test('Ошибка провайдера не заменяется фиктивным ответом модели', () => {
  const input = normalizeInput({ question: 'Что такое return?' }, 1000);
  assert.equal(parseModelResponse({ error: 'connection refused' }, input).ok, false);
  assert.equal(parseModelResponse({ body: { choices: [] } }, input).answer, '');
  assert.equal(parseModelResponse({ statusCode: 500, body: { choices: [{ message: { content: 'bad' } }] } }, input).ok, false);
});
test('Проверка примера вычисляет максимум, не исполняя JavaScript из вопроса', () => {
  const input = checkNumericExample(addLearningContext(normalizeInput({ question: 'Почему max=0 не работает для [-9, -4, -12]?' })));
  assert.equal(input.checkedExamples[0].maximum, -4);
  assert.equal(input.checkedExamples[0].minimum, -12);
  assert.match(input.context, /максимум = -4/);
  assert.equal(checkNumericExample({ question: '[process.exit()]', context: '' }).checkedExamples.length, 0);
  assert.equal(checkNumericExample({ question: '[1e999]', context: '' }).checkedExamples.length, 0);
});
test('Ответ сохраняет настоящий текст, токены и идентификатор запроса', () => {
  const input = { ...normalizeInput({ question: 'Что такое return?' }, 1000), topic: 'Возврат' };
  const parsed = parseModelResponse({ statusCode: 200, body: { model: 'qwen', choices: [{ message: { content: '  Реальный ответ провайдера  ' }, finish_reason: 'stop' }], usage: { completion_tokens: 12 } } }, input, 6000);
  const response = formatAnswer(parsed);
  assert.equal(response.answer, 'Реальный ответ провайдера'); assert.equal(response.elapsedMs, 5000); assert.equal(response.usage.completion_tokens, 12); assert.equal(response.requestId, input.requestId);
});
