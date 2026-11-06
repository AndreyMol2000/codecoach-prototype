import { writeFile } from 'node:fs/promises';
import { normalizeInput, addLearningContext, checkNumericExample, buildModelRequest, parseModelResponse, formatAnswer } from '../src/agent-logic.mjs';

const code = (id, name, fn, x, y, notes) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y], parameters: { jsCode: `const run = ${fn.toString()};\nreturn [{ json: run($json) }];` }, notes, notesInFlow: true });
const condition = (id, name, field, x, y) => ({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [x, y], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: `${id}-condition`, leftValue: `={{ $json.${field} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } });
const respond = (id, name, status, body, x, y) => ({ id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.4, position: [x, y], parameters: { respondWith: 'json', responseBody: body, options: { responseCode: status, responseHeaders: { entries: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }] } } } });
const nodes = [
  { id: 'webhook', name: '01 · Web chat request', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 160], webhookId: '57d33629-a448-435a-84fa-52ba6d025690', parameters: { httpMethod: 'POST', path: 'codecoach-agent', responseMode: 'responseNode', options: {} }, notes: 'Настоящий POST из отдельного веб-чата. Production URL: /webhook/codecoach-agent', notesInFlow: true },
  code('normalize', '02 · Normalize input', normalizeInput, 240, 160, 'Очищаем ввод, проверяем длину и уровень помощи, создаём requestId.'),
  condition('valid', '03 · Valid question?', 'valid', 480, 160),
  code('context', '04 · Learning context', addLearningContext, 720, 80, 'Выбираем учебную справку по теме вопроса. Это контекст для LLM, не ответ пользователю.'),
  code('verify', '05 · Check numeric example', checkNumericExample, 960, 0, 'JSON.parse числового массива + Math.max/Math.min. Вычисленные факты передаются в LLM, пользовательский код не исполняется.'),
  code('prompt', '06 · Build model request', buildModelRequest, 1200, 0, 'System + конкретный вопрос + выбранная глубина помощи + проверенные факты.'),
  { id: 'model', name: '07 · Qwen real LLM call', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1200, 350], parameters: { method: 'POST', url: 'http://127.0.0.1:8081/v1/chat/completions', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.llmRequest) }}', options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } } }, onError: 'continueRegularOutput', notes: 'Реальный HTTP-вызов бесплатной локальной Qwen. В ответе choices и usage. Заготовок нет.', notesInFlow: true },
  { id: 'parse', name: '08 · Parse model response', type: 'n8n-nodes-base.code', typeVersion: 2, position: [960, 350], parameters: { jsCode: `const run = ${parseModelResponse.toString()};\nconst input = $('06 · Build model request').first().json;\nreturn [{ json: run($json, input) }];` }, notes: 'Извлекаем сгенерированный текст, модель, токены и время. При ошибке не подставляем фиктивный AI-ответ.', notesInFlow: true },
  condition('generated', '09 · Answer generated?', 'ok', 720, 350),
  code('format', '10 · Format answer', formatAnswer, 480, 350, 'Готовим JSON для реального канала, сохраняем requestId, usage и время.'),
  respond('success', '11 · Reply to web chat', 200, '={{ JSON.stringify($json) }}', 240, 350),
  respond('invalid', '12 · Invalid input', 400, '={{ JSON.stringify({ ok: false, error: $json.error, requestId: $json.requestId }) }}', 480, 200),
  respond('unavailable', '13 · Model unavailable', 503, '={{ JSON.stringify({ ok: false, error: $json.error, requestId: $json.requestId }) }}', 720, 650)
];
const connections = {};
// Two rows keep the complete workflow legible in a normal browser and screencast.
const layout = { webhook: [0, 0], normalize: [240, 0], valid: [480, 0], context: [720, 0], verify: [960, 0], prompt: [1200, 0], model: [1200, 350], parse: [960, 350], generated: [720, 350], format: [480, 350], success: [240, 350], invalid: [480, 180], unavailable: [720, 650] };
for (const node of nodes) node.position = layout[node.id];
function connect(from, to, output = 0) { const name = nodes.find(n => n.id === from).name; const target = nodes.find(n => n.id === to).name; const main = (connections[name] ||= { main: [] }).main; while (main.length <= output) main.push([]); main[output].push({ node: target, type: 'main', index: 0 }); }
for (const [from, to] of [['webhook', 'normalize'], ['normalize', 'valid'], ['valid', 'context'], ['context', 'verify'], ['verify', 'prompt'], ['prompt', 'model'], ['model', 'parse'], ['parse', 'generated'], ['generated', 'format'], ['format', 'success']]) connect(from, to);
connect('valid', 'invalid', 1); connect('generated', 'unavailable', 1);
const workflow = { id: 'CodeCoachN8nAgent', name: 'CodeCoach · Qwen + web chat', active: false, nodes, connections, settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all', saveManualExecutions: true, executionTimeout: 180 }, pinData: {}, tags: [] };
await writeFile(new URL('../codecoach-workflow.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
console.log(`Workflow ready: ${nodes.length} functional nodes, including a real LLM request.`);
