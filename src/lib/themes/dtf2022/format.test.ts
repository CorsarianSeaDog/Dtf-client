import { describe, expect, it } from 'vitest';
import { donationsNote, formatDay, formatNotificationTime, formatTime, plural, formatRating } from './format';
import { parseCommentText } from './comments/commentText';
import { flattenComments } from './comments/flatten';
import { isWideMedia, mediaMaxWidth } from './media';
import type { CommentTreeItem } from '$lib/api/types';

describe('format', () => {
	const now = new Date('2026-10-16T12:00:00').getTime();

	it('время в стиле DTF', () => {
		expect(formatTime(new Date(now - 4 * 3600_000).toISOString(), false, now)).toBe('4 часа');
		expect(formatTime(new Date(now - 21 * 60_000).toISOString(), false, now)).toBe('21 минуту');
		expect(formatTime('2026-02-26T21:15:00', false, now)).toBe('26 фев');
		expect(formatTime('2026-02-26T21:15:00', true, now)).toBe('26 фев в 21:15');
		expect(formatTime('2022-12-30T10:00:00', false, now)).toBe('30.12.2022');
	});

	it('время в уведомлениях', () => {
		const ago = (ms: number) => new Date(now - ms).toISOString();
		expect(formatNotificationTime(ago(12 * 60_000), now)).toBe('12 минут назад');
		expect(formatNotificationTime(ago(3 * 3600_000 + 60_000), now)).toBe('3 часа назад');
		expect(formatNotificationTime('2026-10-16T06:38:00', now)).toBe('сегодня в 06:38');
		expect(formatNotificationTime('2026-10-15T21:10:00', now)).toBe('вчера в 21:10');
		expect(formatNotificationTime('2026-02-26T21:15:00', now)).toBe('26 фев в 21:15');
	});

	it('день в панели периодов', () => {
		expect(formatDay(new Date('2023-03-01T12:00:00'))).toBe('1 марта');
	});

	it('склонения и рейтинг', () => {
		const forms: [string, string, string] = ['комментарий', 'комментария', 'комментариев'];
		expect([1, 3, 5, 21, 836].map((n) => plural(n, forms))).toEqual([
			'комментарий', 'комментария', 'комментариев', 'комментарий', 'комментариев'
		]);
		expect(formatRating(690337)).toBe('+690 337');
	});
});

describe('mediaMaxWidth', () => {
	it('совпадает с data-image-max-width из архива DTF', () => {
		// лента: высота до 460
		expect(mediaMaxWidth(1920, 1080, 460)).toBe(818);
		expect(mediaMaxWidth(913, 913, 460)).toBe(460);
		expect(mediaMaxWidth(1711, 2160, 460)).toBe(364);
		// комментарии: высота до 300, но не шире натуральной ширины
		expect(mediaMaxWidth(1080, 2220, 300)).toBe(146);
		expect(mediaMaxWidth(518, 34, 300)).toBe(518);
		// страница поста: горизонтальные — только натуральная ширина, остальные — как в ленте
		expect(mediaMaxWidth(1440, 1080)).toBe(1440);
		expect([isWideMedia(1440, 1080), isWideMedia(913, 913), isWideMedia(1711, 2160)]).toEqual([true, false, false]);
	});
});

describe('parseCommentText', () => {
	it('цитаты, упоминания, ссылки и переносы', () => {
		const result = parseCommentText(
			'>цитата\r\n<mention id="7" nickname="">Вася</mention>, смотри https://dtf.ru/x.\r\n\r\nвторой абзац'
		);
		expect(result).toEqual([
			{ quote: true, lines: [[{ type: 'text', text: 'цитата' }]] },
			{
				quote: false,
				lines: [[
					{ type: 'mention', id: 7, name: 'Вася' },
					{ type: 'text', text: ', смотри ' },
					{ type: 'link', url: 'https://dtf.ru/x' },
					{ type: 'text', text: '.' }
				]]
			},
			{ quote: false, lines: [[{ type: 'text', text: 'второй абзац' }]] }
		]);
	});
	it('упоминания в формате [@id|имя] и незакрытая скобка в обычном тексте', () => {
		expect(parseCommentText('и [@494450|Vino] закрепи, [черновик')).toEqual([
			{
				quote: false,
				lines: [[
					{ type: 'text', text: 'и ' },
					{ type: 'mention', id: 494450, name: 'Vino' },
					{ type: 'text', text: ' закрепи, [черновик' }
				]]
			}
		]);
	});
	it('выделение <mark> из поиска в тексте, упоминании и ссылке', () => {
		expect(parseCommentText('[@1|<mark>Vino</mark>] <mark>см</mark> https://<mark>dtf.ru</mark>/x.')).toEqual([
			{
				quote: false,
				lines: [[
					{ type: 'mention', id: 1, name: 'Vino', parts: [{ text: 'Vino', mark: true }] },
					{ type: 'text', text: ' ' },
					{ type: 'text', text: 'см', mark: true },
					{ type: 'text', text: ' ' },
					{ type: 'link', url: 'https://dtf.ru/x', parts: [{ text: 'https://', mark: false }, { text: 'dtf.ru', mark: true }, { text: '/x', mark: false }] },
					{ type: 'text', text: '.' }
				]]
			}
		]);
	});
	it('сниппеты поиска: <mark> в атрибуте упоминания, обрезанные теги и скобки на краях', () => {
		const lineOf = (raw: string) => parseCommentText(raw)[0].lines[0];
		expect(lineOf('<mention id="1" <mark>nickname</mark>="">Asuka</mention > <mention id="2" nickname="">Megumin')).toEqual([
			{ type: 'mention', id: 1, name: 'Asuka' },
			{ type: 'text', text: ' ' },
			{ type: 'mention', id: 2, name: 'Megumin' }
		]);
		expect(lineOf('Начало </mention > и <mention id="99" <mark>nickname</mark>')).toEqual([
			{ type: 'text', text: 'Начало ' },
			{ type: 'text', text: ' и ' }
		]);
		expect(lineOf('и [@12|<mark>Бо</mark>')).toEqual([
			{ type: 'text', text: 'и ' },
			{ type: 'mention', id: 12, name: 'Бо', parts: [{ text: 'Бо', mark: true }] }
		]);
		expect(lineOf('обрыв [@494')).toEqual([{ type: 'text', text: 'обрыв ' }]);
	});
});

describe('flattenComments', () => {
	const node = (id: number, children: CommentTreeItem[] = []) =>
		({ id, sourceId: 'dtf', children, _totalReplies: children.length, author: { id, name: `u${id}` } }) as unknown as CommentTreeItem;

	it('линии веток: продолжение, конец ветки и максимальная вложенность', () => {
		// 1 ─┬─ 2 ── 4 ── 5
		//    └─ 3
		const tree = [node(1, [node(2, [node(4, [node(5)])]), node(3)])];
		const rows = flattenComments(tree, 2);
		const lines = rows.map((r) => r.lines.map((l) => `${l.border ? '|' : ' '}${l.arc ? 'arc' : ''}`));
		expect(rows.map((r) => r.comment.id)).toEqual([1, 2, 4, 5, 3]);
		expect(lines).toEqual([[], ['|arc'], ['|', ' arc'], ['|', ' '], [' arc']]);
	});

	it('строка хранит ключи всех предков для скрытия свёрнутой ветки', () => {
		const tree = [node(1, [node(2, [node(4)])])];
		const rows = flattenComments(tree, 1);
		expect(rows.map((r) => [r.comment.id, r.owners])).toEqual([
			[1, []],
			[2, ['dtf_1']],
			[4, ['dtf_1', 'dtf_2']]
		]);
	});

	it('в жёстком режиме вырезает комментарии без ответов и сохраняет структуру веток', () => {
		const hidden = (id: number, children: CommentTreeItem[] = []) => ({ ...node(id, children), content: 'Стоп-слово' });
		const tree = [hidden(1), node(2, [hidden(3, [node(4), hidden(5)]), node(6)])];
		const settings = { tags: [], keywords: ['стоп-слово'], users: [], filterPosts: true, filterComments: true };

		const rows = flattenComments(tree, 2, { ...settings, mode: 'hard' });
		expect(rows.map((row) => [row.comment.id, row.level, row.parent?.id, row.owners])).toEqual([
			[2, 1, undefined, []],
			[3, 2, 2, ['dtf_2']],
			[4, 3, 3, ['dtf_2', 'dtf_3']],
			[6, 2, 2, ['dtf_2']]
		]);
		expect(flattenComments(tree, 2, { ...settings, mode: 'hard', filterComments: false }).map((row) => row.comment.id))
			.toEqual([1, 2, 3, 4, 5, 6]);
	});
});

describe('donationsNote', () => {
	it('баланс у подключённых, «Не подключены» без счёта или без подтверждения, пусто до ответа', () => {
		expect(donationsNote({ balance: 1500, isConfirmed: true })).toBe('1 500 ₽');
		expect(donationsNote(null)).toBe('Не подключены');
		expect(donationsNote({ balance: 0, isConfirmed: false })).toBe('Не подключены');
		expect(donationsNote(undefined)).toBeUndefined();
	});
});
