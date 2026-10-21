export const tasks = [
  {
    id: 'maximum', title: 'Максимум в массиве', category: 'Массивы и границы', difficulty: 1, minutes: 7,
    description: 'Функция findMax(numbers) должна возвращать самое большое число в непустом массиве. В стартовом коде спрятана ошибка. Найдите её с помощью тестов и исправьте.',
    contract: 'На входе непустой массив конечных чисел. На выходе одно число. Исходный массив менять не нужно.',
    example: 'findMax([-10, -3, -20]) → -3', fn: 'findMax',
    starter: 'function findMax(numbers) {\n  let max = 0;\n  for (const number of numbers) {\n    if (number > max) {\n      max = number;\n    }\n  }\n  return max;\n}',
    solution: 'function findMax(numbers) {\n  let max = numbers[0];\n  for (const number of numbers) {\n    if (number > max) max = number;\n  }\n  return max;\n}',
    explanation: 'Начальное значение берём из массива: тогда результат принадлежит входным данным, даже если все числа отрицательные. Можно также начать с -Infinity.',
    tests: [
      { input: [3, 7, 2], expected: 7, label: 'Положительные числа' },
      { input: [-10, -3, -20], expected: -3, label: 'Все числа отрицательные', tag: 'negative' },
      { input: [-9], expected: -9, label: 'Один отрицательный элемент', tag: 'negative' },
      { input: [0, -2, -4], expected: 0, label: 'Ноль среди отрицательных' },
      { input: [-4, 8, 8, 1], expected: 8, label: 'Повторяющийся максимум' },
      { input: [-1.5, -0.2, -8.7], expected: -0.2, label: 'Дробные отрицательные', tag: 'negative' }
    ],
    hints: [
      'Сравните успешные и неуспешные тесты. Что общего у массивов, для которых результат неверный?',
      'Если все элементы меньше нуля, сработает ли условие number > max при начальном max = 0? Откуда тогда возьмётся правильный ответ?',
      'Используйте первый элемент массива как начальный максимум. Затем сравните с ним остальные элементы и обновляйте максимум.'
    ]
  },
  {
    id: 'minimum', title: 'Минимум без подсказок', category: 'Перенос навыка', difficulty: 1, minutes: 5, transfer: true,
    description: 'Теперь примените идею самостоятельно. Напишите findMin(numbers), которая находит наименьшее число в непустом массиве. В этой задаче подсказок нет: проверяем, удалось ли перенести навык.',
    contract: 'На входе непустой массив конечных чисел. Верните одно число, не меняя входной массив.',
    example: 'findMin([6, 2, 9]) → 2', fn: 'findMin',
    starter: 'function findMin(numbers) {\n  // Найдите наименьшее число\n  return undefined;\n}',
    solution: 'function findMin(numbers) {\n  let min = numbers[0];\n  for (const number of numbers) {\n    if (number < min) min = number;\n  }\n  return min;\n}',
    explanation: 'Начало с первого элемента работает и для полностью положительных, и для полностью отрицательных массивов.',
    tests: [
      { input: [6, 2, 9], expected: 2, label: 'Положительные числа' },
      { input: [4, 7, 1], expected: 1, label: 'Минимум не в начале' },
      { input: [-6, -2, -9], expected: -9, label: 'Отрицательные числа' },
      { input: [5], expected: 5, label: 'Один элемент' },
      { input: [3, 0, 2], expected: 0, label: 'Ноль в массиве' },
      { input: [0.8, 0.3, 1.2], expected: 0.3, label: 'Дробные числа' }
    ], hints: []
  },
  {
    id: 'even', title: 'Счётчик чётных чисел', category: 'Условия и циклы', difficulty: 2, minutes: 8,
    description: 'Напишите countEven(numbers): функция должна возвращать количество чётных целых чисел в массиве. Проверьте поведение на нуле, отрицательных числах и пустом массиве.',
    contract: 'Массив содержит только целые числа и может быть пустым. Возвращаем целое число от 0 до длины массива.',
    example: 'countEven([-4, 0, 3, 8]) → 3', fn: 'countEven',
    starter: 'function countEven(numbers) {\n  let count = 0;\n  for (const number of numbers) {\n    // Когда нужно увеличить count?\n  }\n  return count;\n}',
    solution: 'function countEven(numbers) {\n  let count = 0;\n  for (const number of numbers) {\n    if (number % 2 === 0) count++;\n  }\n  return count;\n}',
    explanation: 'У чётного числа остаток от деления на 2 равен нулю. Это верно и для нуля, и для отрицательных чётных чисел.',
    tests: [
      { input: [1, 2, 3, 4], expected: 2, label: 'Смешанный массив' },
      { input: [0], expected: 1, label: 'Ноль тоже чётный' },
      { input: [-4, -3, -2], expected: 2, label: 'Отрицательные числа' },
      { input: [], expected: 0, label: 'Пустой массив', tag: 'empty' },
      { input: [1, 3, 5], expected: 0, label: 'Только нечётные' },
      { input: [2, 2, 8, 10], expected: 4, label: 'Только чётные' }
    ],
    hints: ['Посмотрите, при каких входных данных счётчик должен изменяться. Что значит «число чётное»?', 'В JavaScript оператор % возвращает остаток от деления. Какой остаток получится при делении чётного числа на 2?', 'Внутри цикла проверьте number % 2 === 0. Если условие верно, увеличьте count на единицу.']
  },
  {
    id: 'sum', title: 'Сумма положительных', category: 'Фильтрация и накопление', difficulty: 2, minutes: 8,
    description: 'Реализуйте sumPositive(numbers): сложите только числа строго больше нуля. Если таких чисел нет, верните 0.',
    contract: 'На входе массив конечных чисел, включая дробные. Он может быть пустым.',
    example: 'sumPositive([-2, 5, 0, 3]) → 8', fn: 'sumPositive',
    starter: 'function sumPositive(numbers) {\n  let sum = 0;\n  for (const number of numbers) {\n    sum += number;\n  }\n  return sum;\n}',
    solution: 'function sumPositive(numbers) {\n  let sum = 0;\n  for (const number of numbers) {\n    if (number > 0) sum += number;\n  }\n  return sum;\n}',
    explanation: 'Накопитель начинается с 0. Добавление выполняется только для элементов, прошедших условие number > 0.',
    tests: [
      { input: [-2, 5, 0, 3], expected: 8, label: 'Смешанные числа' },
      { input: [-5, -2], expected: 0, label: 'Все числа отрицательные', tag: 'negative' },
      { input: [], expected: 0, label: 'Пустой массив', tag: 'empty' },
      { input: [0, 0], expected: 0, label: 'Только нули' },
      { input: [2, 4, 1], expected: 7, label: 'Все числа положительные' },
      { input: [0.5, -1, 1.5], expected: 2, label: 'Дробные числа' }
    ], hints: ['Какие именно элементы должны попасть в сумму? Сравните это правило с действием внутри цикла.', 'Сейчас sum изменяется для каждого элемента. Как ограничить сложение только числами строго больше нуля?', 'Перед sum += number добавьте условие number > 0. Начальное значение sum оставьте равным нулю.']
  }
];
export const getTask = id => tasks.find(task => task.id === id);
