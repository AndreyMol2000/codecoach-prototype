// This function must be self-contained: the browser serializes it into an isolated Worker.
export function execute(code, task) {
  const describe = value => {
    if (value === undefined) return 'undefined';
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    try { return JSON.stringify(value) ?? String(value); } catch { return '[не удалось отобразить]'; }
  };
  let fn;
  try {
    fn = new Function('"use strict";\n' + code + '\n;return typeof ' + task.fn + ' === "function" ? ' + task.fn + ' : null;')();
    if (!fn) return { error: `Объявите функцию ${task.fn}(numbers).`, kind: 'syntax', results: [] };
  } catch (error) { return { error: String(error.message).slice(0, 500), kind: 'syntax', results: [] }; }
  const results = task.tests.map(test => {
    try {
      const actual = fn([...test.input]);
      return { label: test.label, input: describe(test.input), expected: describe(test.expected), actual: describe(actual), passed: typeof actual === 'number' && Object.is(actual, test.expected), tag: test.tag || null };
    } catch (error) { return { label: test.label, input: describe(test.input), expected: describe(test.expected), actual: 'Ошибка: ' + String(error.message).slice(0, 200), passed: false, tag: test.tag || null, runtime: true }; }
  });
  return { results, passed: results.filter(test => test.passed).length, total: results.length };
}
