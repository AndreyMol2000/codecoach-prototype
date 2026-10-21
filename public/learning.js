export const reward = hints => [100, 80, 60, 40, 20][Math.min(4, Math.max(0, hints))];

export function coachHint(task, result, level) {
  if (level >= 4) return { title: 'Решение с объяснением', text: task.explanation, code: task.solution };
  if (result?.kind === 'syntax') return { title: `Подсказка ${level} из 4 · синтаксис`, text: level === 1 ? `Проверка не смогла вызвать ${task.fn}. Сначала разберите сообщение об ошибке: проверьте скобки и имя функции.` : level === 2 ? `Нужна функция с именем ${task.fn} и параметром numbers. Проверьте парность круглых и фигурных скобок, а также кавычек.` : `Начните с оболочки function ${task.fn}(numbers) { ... }. Поместите логику внутрь и верните результат через return.` };
  if (result?.kind === 'timeout') return { title: `Подсказка ${level} из 4 · цикл`, text: level === 1 ? 'Программа не завершилась. Найдите цикл, в котором условие остаётся истинным.' : level === 2 ? 'Меняется ли переменная из условия цикла на каждой итерации? Можно ли достичь условия выхода?' : 'Для обхода массива используйте for (const number of numbers). Этот цикл выполнит одну итерацию на каждый элемент.' };
  const failed = result?.results?.find(test => !test.passed);
  const context = failed ? ` Например, на входе ${failed.input} ожидается ${failed.expected}, а получается ${failed.actual}.` : '';
  if (failed?.runtime) return { title: `Подсказка ${level} из 4 · выполнение`, text: level === 1 ? 'Функция запускается, но внутри возникает исключение.' + context : level === 2 ? 'Прочитайте сообщение исключения. Проверьте, объявлены ли переменные и правильно ли записаны их имена.' : 'Сверьте имена параметра numbers и переменных внутри функции. Затем проверьте, что return возвращает число.' };
  return { title: `Подсказка ${level} из 4`, text: task.hints[level - 1] + (level === 1 ? context : '') };
}

export function recommendation(progress) {
  const main = progress.maximum;
  if (!main?.solved) return { id: 'maximum', reason: 'Начните с ошибки в поиске максимума и проверьте граничные случаи.' };
  if (!progress.minimum?.solved) return { id: 'minimum', reason: 'Проверьте понимание на похожей задаче без подсказок.' };
  if (!progress.even?.solved) return { id: 'even', reason: main.hints >= 3 || main.attempts >= 5 ? 'Закрепите работу с условиями на коротком упражнении.' : 'Перейдите к условиям и подсчёту элементов.' };
  return { id: 'sum', reason: 'Объедините условие и накопитель в следующем упражнении.' };
}

export function experimentSummary(participants) {
  const started = participants.filter(p => p.progress.maximum?.startedAt);
  const finished = started.filter(p => p.progress.maximum.solved);
  const guided = started.filter(p => {
    const t = p.progress.maximum;
    return t.solved && (t.hintsAtSolve ?? t.hints) < 4 && t.solvedAt - t.startedAt <= 600000;
  });
  const transfer = started.filter(p => {
    const main = p.progress.maximum, next = p.progress.minimum;
    return main.solved && next?.solved && next.startedAt >= main.solvedAt;
  });
  const assistedTransfer = guided.filter(p => {
    const next = p.progress.minimum;
    return next?.solved && next.startedAt >= p.progress.maximum.solvedAt;
  });
  return { started: started.length, finished: finished.length, guided: guided.length, transfer: transfer.length, assistedTransfer: assistedTransfer.length, enough: started.length >= 5, supported: started.length >= 5 && assistedTransfer.length / started.length >= 0.6 };
}
