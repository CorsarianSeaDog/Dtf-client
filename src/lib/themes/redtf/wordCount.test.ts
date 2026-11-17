import { expect, it } from 'vitest';
import { wordCount } from './wordCount';

it('считает слова заголовка и текстовых блоков, без разметки, сущностей и нетекстовых блоков', () => {
	const { words, minutes } = wordCount('Мой пост', {
		blocks: [
			{ type: 'paragraph', data: { text: 'Один <b>два</b>&nbsp;три&amp;четыре <a href="https://x.ru/a b">пять</a>' } },
			{ type: 'header', data: { text: 'Раздел', level: 2 } },
			{ type: 'list', data: { style: 'unordered', items: [{ content: 'пункт один', items: [{ content: 'вложенный', items: [] }] }, 'старый пункт'] } },
			{ type: 'quote', data: { text: 'цитата', caption: 'автор' } },
			{ type: 'code', data: { code: 'const a = 1;' } },
			{ type: 'image', data: { file: { url: 'x' }, caption: 'подпись не считается' } },
			{ type: 'gallery', data: { items: [{ caption: 'тоже нет' }] } },
			{ type: 'person', data: { title: 'Имя', description: 'нет' } },
			{ type: 'delimiter', data: {} }
		]
	});
	// заголовок 2; абзац: Один, два, три&четыре, пять = 4; раздел 1; список 2+1+2 = 5; цитата 2;
	// код: const, a, «1;» = 3 («=» без букв и цифр словом не считается)
	expect(words).toBe(2 + 4 + 1 + 5 + 2 + 3);
	expect(minutes).toBe(1);
	// Тег внутри слова слов не добавляет, <br> — добавляет
	expect(wordCount('', { blocks: [{ type: 'paragraph', data: { text: 'сло<b>во</b><br>ещё' } }] }).words).toBe(2);
});

it('у пустой записи нет ни слов, ни минут; минуты округляются вверх', () => {
	expect(wordCount('', { blocks: [] })).toEqual({ words: 0, minutes: 0 });
	expect(wordCount('   ', undefined)).toEqual({ words: 0, minutes: 0 });
	expect(wordCount('a '.repeat(201), { blocks: [] }).minutes).toBe(2);
	expect(wordCount('a '.repeat(200), { blocks: [] }).minutes).toBe(1);
});
