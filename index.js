#!/usr/bin/env node
// Бібліотечний каталог (ЛР3, варіант 10).
// Програма читає JSON-файл із ЛР1 і відповідає на запити з командного рядка.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command, Help, Option } from 'commander';

// ---------------------------------------------------------------------------
// 1. Константи та допоміжні функції
// ---------------------------------------------------------------------------

// Файл за замовчуванням лежить поруч з index.js, тому програма знаходить його
// незалежно від того, з якої теки її запустили.
const DEFAULT_FILE = fileURLToPath(new URL('./data.json', import.meta.url));

// Коди завершення: 0 — успіх, 1 — помилка даних (файл, JSON, елемент),
// 2 — неправильний виклик (невідома опція, пропущений аргумент, не число).
const EXIT_DATA_ERROR = 1;
const EXIT_USAGE_ERROR = 2;

// Помилка, яку бачить користувач: лише текст повідомлення, без стеку викликів.
class UserError extends Error {
  constructor(message, exitCode = EXIT_DATA_ERROR) {
    super(message);
    this.exitCode = exitCode;
  }
}

// Читає й розбирає JSON-файл, перевіряє, що в ньому є масив books.
function loadBooks(filePath) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new UserError(`Файл не знайдено: ${filePath}`);
    if (err.code === 'EISDIR') throw new UserError(`Це тека, а не файл: ${filePath}`);
    throw new UserError(`Не вдалося прочитати файл ${filePath}: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    // Node повідомляє місце помилки англійською: "... (line 3 column 5)".
    const place = err.message.match(/line (\d+) column (\d+)/);
    const where = place ? ` (рядок ${place[1]}, стовпець ${place[2]})` : '';
    throw new UserError(`Некоректний JSON у файлі ${filePath}${where}`);
  }

  if (data === null || !Array.isArray(data.books)) {
    throw new UserError(`У файлі ${filePath} немає масиву "books"`);
  }
  return data.books;
}

// Дістає шлях до файлу з глобальної опції --file (працює з будь-якою командою).
function booksFor(command) {
  return loadBooks(command.optsWithGlobals().file);
}

// Перетворює рядок на ціле додатне число або повідомляє про помилку виклику.
function parsePositiveInt(value, what) {
  if (!/^\d+$/.test(value) || Number(value) === 0) {
    throw new UserError(`${what} має бути цілим додатним числом, отримано «${value}»`, EXIT_USAGE_ERROR);
  }
  return Number(value);
}

// Шукає книгу за id.
function findBook(books, idText) {
  const id = parsePositiveInt(idText, 'Ідентифікатор книги');
  const book = books.find((b) => b.id === id);
  if (!book) throw new UserError(`Книги з id ${id} немає в каталозі`);
  return book;
}

// Один рядок короткого опису книги: [id] назва — автори (рік).
function bookLine(book) {
  return `[${book.id}] ${book.title} — ${book.authors.join(', ')} (${book.publicationYear})`;
}

// Виводить значення як JSON: рядки в лапках, null як null, об'єкти з відступами.
function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

// ---------------------------------------------------------------------------
// 2. Опис програми та українська довідка
// ---------------------------------------------------------------------------

// Commander друкує заголовки довідки англійською; перекладаємо їх.
const HELP_TITLES = {
  'Usage:': 'Використання:',
  'Options:': 'Опції:',
  'Global Options:': 'Глобальні опції:',
  'Arguments:': 'Аргументи:',
  'Commands:': 'Команди:',
};

const program = new Command();

program
  // Ці налаштування задаються першими, бо підкоманди копіюють їх під час створення.
  .configureHelp({
    showGlobalOptions: true,
    styleTitle: (title) => HELP_TITLES[title] ?? title,
    commandUsage(cmd) {
      return Help.prototype.commandUsage.call(this, cmd)
        .replace('[options]', '[опції]')
        .replace('[command]', '[команда]');
    },
    subcommandTerm(cmd) {
      return Help.prototype.subcommandTerm.call(this, cmd).replace('[options]', '[опції]');
    },
    optionDescription(option) {
      return Help.prototype.optionDescription.call(this, option)
        .replace('default:', 'за замовчуванням:');
    },
  })
  .configureOutput({ outputError: () => {} }) // власні повідомлення друкуємо самі
  .exitOverride() // замість process.exit() commander кидає помилку, яку ловимо нижче
  .helpOption('-h, --help', 'показати довідку')
  .helpCommand('help [команда]', 'показати довідку для команди')
  .name('library')
  .description('Довідник бібліотечного каталогу: книги, примірники та історія видач')
  .version('1.0.0', '-V, --version', 'показати версію програми')
  .addOption(
    new Option('-f, --file <шлях>', 'шлях до JSON-файлу каталогу')
      .default(DEFAULT_FILE, 'data.json поруч з index.js'),
  );

// ---------------------------------------------------------------------------
// 5. Запуск і обробка помилок
// ---------------------------------------------------------------------------

// Повідомлення commander англійською замінюємо на українські за кодом помилки.
// Назву (опції, аргументу, команди) беремо з лапок в оригінальному тексті.
function commanderMessage(err) {
  const name = err.message.match(/'([^']+)'/)?.[1] ?? '';
  switch (err.code) {
    case 'commander.unknownOption': return `Невідома опція: ${name}`;
    case 'commander.unknownCommand': return `Невідома команда: ${name}`;
    case 'commander.missingArgument': return `Пропущено обов'язковий аргумент: ${name}`;
    case 'commander.optionMissingArgument': return `Опції ${name} потрібне значення`;
    case 'commander.excessArguments': return 'Забагато аргументів для цієї команди';
    default: return `Помилка виклику: ${err.message}`;
  }
}

try {
  program.parse();
} catch (err) {
  if (err instanceof UserError) {
    console.error(`Помилка: ${err.message}`);
    process.exitCode = err.exitCode;
  } else if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
    process.exitCode = 0; // довідку або версію вже надруковано на запит користувача
  } else if (err.code === 'commander.help') {
    process.exitCode = EXIT_USAGE_ERROR; // команду не вказано: commander сам надрукував довідку
  } else if (err.code?.startsWith('commander.')) {
    console.error(`Помилка: ${commanderMessage(err)}`);
    console.error('Довідка: node index.js --help');
    process.exitCode = EXIT_USAGE_ERROR;
  } else {
    console.error(`Неочікувана помилка: ${err.message}`);
    process.exitCode = EXIT_DATA_ERROR;
  }
}
