import { describe, expect, it } from 'vitest';
import type { CommentTreeItem } from '$lib/api/types';
import {
	collectThreadMentionAuthors,
	findMentionQuery,
	formatMentionTag,
	mergeMentionCandidates,
	parseCommentEditorParts,
	serializeEditorElement
} from './mentions';

describe('mentions helpers', () => {
	it('форматирует и разбирает <mention> и [@id|name] с экранированием', () => {
		const raw = 'Привет, <mention id="3182655" nickname="vinki">Евгеник &amp; Co</mention> и [@42|Вася]!';
		expect(parseCommentEditorParts(raw)).toEqual([
			{ type: 'text', text: 'Привет, ' },
			{ type: 'mention', id: 3182655, nickname: 'vinki', name: 'Евгеник & Co' },
			{ type: 'text', text: ' и ' },
			{ type: 'mention', id: 42, nickname: '', name: 'Вася' },
			{ type: 'text', text: '!' }
		]);
		expect(formatMentionTag({ id: 7, nickname: 'a"b', name: 'X<Y>' })).toBe(
			'<mention id="7" nickname="a&quot;b">X&lt;Y&gt;</mention>'
		);
	});

	it('сериализует DOM-узлы с упоминаниями и игнорирует одинокий хвостовой <br>-сентинел', () => {
		const textNode = (text: string) => ({ nodeType: 3, textContent: text } as unknown as Node);
		const brNode = () =>
			({
				nodeType: 1,
				tagName: 'BR',
				getAttribute: () => null,
				childNodes: []
			}) as unknown as Node;
		const mentionNode = (id: string, nickname: string, name: string) =>
			({
				nodeType: 1,
				tagName: 'SPAN',
				textContent: `@${name}`,
				getAttribute: (attr: string) =>
					attr === 'data-mention-id'
						? id
						: attr === 'data-mention-nickname'
							? nickname
							: attr === 'data-mention-name'
								? name
								: null,
				childNodes: []
			}) as unknown as Node;

		expect(serializeEditorElement({ childNodes: [brNode()] })).toBe('');
		expect(
			serializeEditorElement({
				childNodes: [textNode('Привет '), mentionNode('10', 'nick', 'Имя'), textNode('\nкак дела'), brNode()]
			})
		).toBe('Привет <mention id="10" nickname="nick">Имя</mention>\nкак дела');
	});

	it('находит @запрос в начале строки и после пробела, но не внутри email', () => {
		expect(findMentionQuery('@')).toEqual({ query: '', start: 0 });
		expect(findMentionQuery('привет @vin')).toEqual({ query: 'vin', start: 7 });
		expect(findMentionQuery('строка\n@юра')).toEqual({ query: 'юра', start: 7 });
		expect(findMentionQuery('user@gmail.com')).toBeNull();
		expect(findMentionQuery('привет @vin уже')).toBeNull();
	});

	it('собирает авторов ветки снизу вверх без дублей, удалённых и текущего пользователя', () => {
		const make = (id: number, authorId: number, name: string, removed = false): CommentTreeItem => ({
			id,
			sourceId: 'dtf',
			postId: 1,
			author: { id: authorId, name },
			content: '',
			createdAt: '',
			isRemoved: removed,
			children: []
		});

		const path = [make(1, 100, 'Корень'), make(2, 200, 'Я'), make(3, 100, 'Корень'), make(4, 300, 'Удалён', true), make(5, 400, 'Цель')];
		expect(collectThreadMentionAuthors(path, 200)).toEqual([
			{ id: 400, name: 'Цель', avatarUrl: undefined },
			{ id: 100, name: 'Корень', avatarUrl: undefined }
		]);
	});

	it('сливает локальных участников ветки и выдачу API без дублей и фильтрует устаревшую выдачу', () => {
		const local = [
			{ id: 1, name: 'Евгеник', nickname: 'vinki' },
			{ id: 2, name: 'Антон' }
		];
		const remote = [
			{ id: 1, name: 'Евгеник', nickname: 'vinki' },
			{ id: 3, name: 'Виниш Котян', nickname: 'vinishkotyan' },
			{ id: 4, name: 'ChatGPT Bot', nickname: 'chatgptbot' }
		];

		expect(mergeMentionCandidates(local, remote, 'vin').map((u) => u.id)).toEqual([1, 3, 4]);
		expect(mergeMentionCandidates(local, remote, 'vin', 10, true).map((u) => u.id)).toEqual([1, 3]);
	});
});
