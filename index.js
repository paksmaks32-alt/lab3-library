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
// 3. Загальні можливості: перелік, один елемент, окреме поле
// ---------------------------------------------------------------------------

program
  .command('list')
  .description('показати стислий список книг')
  .option('-l, --limit <кількість>', 'показати не більше вказаної кількості книг')
  .action((options, command) => {
    const books = booksFor(command);
    const limit = options.limit === undefined
      ? books.length
      : parsePositiveInt(options.limit, 'Значення --limit');
    books.slice(0, limit).forEach((book) => console.log(bookLine(book)));
    console.log(`Показано ${Math.min(limit, books.length)} з ${books.length}`);
  });

program
  .command('show')
  .description('показати одну книгу з усіма полями')
  .argument('<id>', 'ідентифікатор книги (поле id)')
  .action((id, options, command) => {
    printJson(findBook(booksFor(command), id));
  });

program
  .command('get')
  .description('показати значення окремого поля книги, зокрема вкладеного')
  .argument('<id>', 'ідентифікатор книги (поле id)')
  .argument('<шлях>', 'шлях до поля через крапку, напр. copies.0.inventoryNumber або copies[0].borrowHistory')
  .action((id, path, options, command) => {
    const book = findBook(booksFor(command), id);
    // copies[0].isAvailable → copies.0.isAvailable → ['copies', '0', 'isAvailable']
    const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter((key) => key !== '');
    if (keys.length === 0) throw new UserError('Шлях до поля порожній', EXIT_USAGE_ERROR);

    let current = book;
    for (const key of keys) {
      // Поле відсутнє, якщо його немає як власного ключа (або йти далі нікуди).
      // Поле зі значенням null — присутнє, і ми друкуємо null.
      if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) {
        throw new UserError(`Поля «${path}» у книзі ${book.id} немає (бракує «${key}»)`);
      }
      current = current[key];
    }
    printJson(current);
  });

// ---------------------------------------------------------------------------
// 4. Можливості варіанта 10 «Бібліотека»
// ---------------------------------------------------------------------------

program
  .command('author')
  .description('знайти книги автора за частиною імені (без урахування регістру)')
  .argument('<частина-імені>', 'частина імені або прізвища автора')
  .action((part, options, command) => {
    const needle = part.trim().toLocaleLowerCase('uk');
    if (needle === '') throw new UserError('Частина імені не може бути порожньою', EXIT_USAGE_ERROR);

    const found = booksFor(command).filter((book) =>
      book.authors.some((author) => author.toLocaleLowerCase('uk').includes(needle)));

    if (found.length === 0) {
      console.log(`Книг автора, ім'я якого містить «${part}», не знайдено`);
      return;
    }
    found.forEach((book) => console.log(bookLine(book)));
    console.log(`Знайдено книг: ${found.length}`);
  });

program
  .command('copies')
  .description('показати примірники книги')
  .argument('<id>', 'ідентифікатор книги (поле id)')
  .option('-a, --available', 'показати лише доступні примірники')
  .action((id, options, command) => {
    const book = findBook(booksFor(command), id);
    const copies = options.available
      ? book.copies.filter((copy) => copy.isAvailable)
      : book.copies;

    console.log(`«${book.title}»: примірників ${book.copies.length}, показано ${copies.length}`);
    for (const copy of copies) {
      if (copy.isAvailable) {
        console.log(`  ${copy.inventoryNumber}  доступний`);
      } else {
        // Хто тримає примірник: запис в історії, де returnDate === null.
        const current = copy.borrowHistory.find((record) => record.returnDate === null);
        const holder = current ? ` (у читача: ${current.borrower} з ${current.borrowDate})` : '';
        console.log(`  ${copy.inventoryNumber}  видано${holder}`);
      }
    }
  });

program
  .command('history')
  .description('показати історію видач конкретного примірника')
  .argument('<інвентарний-номер>', 'інвентарний номер примірника, напр. INV-1001')
  .action((inventoryNumber, options, command) => {
    const wanted = inventoryNumber.toUpperCase();
    // Примірники лежать усередині книг, тому шукаємо в усіх книгах одразу.
    const book = booksFor(command).find((b) =>
      b.copies.some((copy) => copy.inventoryNumber.toUpperCase() === wanted));
    if (!book) throw new UserError(`Примірника ${inventoryNumber} немає в каталозі`);
    const copy = book.copies.find((c) => c.inventoryNumber.toUpperCase() === wanted);

    console.log(`${copy.inventoryNumber} — «${book.title}»`);
    if (copy.borrowHistory.length === 0) {
      console.log('  Історія видач порожня');
      return;
    }
    for (const record of copy.borrowHistory) {
      const returned = record.returnDate ?? 'не повернуто';
      console.log(`  ${record.borrowDate} → ${returned}  ${record.borrower}`);
    }
  });

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
