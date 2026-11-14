import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dtfApiProvider } from './index';
import { fetchSearch } from './client';

vi.mock('./client', async (importOriginal) => ({
	...await importOriginal<typeof import('./client')>(),
	fetchSearch: vi.fn()
}));

const rawComment = (id: number, overrides: Record<string, unknown> = {}) => ({
	type: 'comment',
	data: {
		id,
		author: { id: 933181, name: 'Автор' },
		date: 1700000000,
		text: `Текст ${id}`,
		replyTo: 0,
		level: 0,
		entry: { id: 5319226, title: 'Заголовок поста', subsite_id: 933181 },
		likes: { counterLikes: 3, isLiked: false },
		reactions: { counters: [{ id: 1, count: 2 }], reactionId: 0 },
		...overrides
	},
	meta: { highlight: `<mark>Текст</mark> ${id}` }
});

describe('searchComments', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('запрашивает /v2.51/search/comments и мапит поля комментария, поста и сниппета', async () => {
		vi.mocked(fetchSearch).mockResolvedValueOnce(Response.json({
			result: {
				items: [rawComment(101)],
				total: 1,
				lastId: 101,
				lastSortingValue: 1
			}
		}));

		const res = await dtfApiProvider.searchComments({ query: 'тест' });

		expect(fetchSearch).toHaveBeenCalledWith('/v2.51/search/comments?sorting=relevance&page=1&q=%D1%82%D0%B5%D1%81%D1%82');
		expect(res).toMatchObject({
			total: 1,
			page: 1,
			hasMore: false,
			lastId: 101,
			lastSortingValue: 1
		});
		expect(res.items[0]).toMatchObject({
			id: 101,
			sourceId: 'dtf',
			postId: 5319226,
			postTitle: 'Заголовок поста',
			postSubsiteId: 933181,
			searchSnippet: '<mark>Текст</mark> 101',
			content: 'Текст 101',
			author: { id: 933181, name: 'Автор' },
			likes: { count: 3, myVote: 0 },
			reactions: { counters: [{ id: 1, count: 2 }], reactionId: 0 }
		});
	});

	it('передаёт sorting, strict, authorId и page; работает без query при указанном authorId', async () => {
		vi.mocked(fetchSearch).mockResolvedValueOnce(Response.json({
			result: { items: [], total: 0 }
		}));

		await dtfApiProvider.searchComments({
			query: 'test drive',
			sorting: 'date',
			strict: true,
			authorId: 933181,
			page: 2
		});

		const url = vi.mocked(fetchSearch).mock.calls[0][0];
		const params = new URLSearchParams(url.split('?')[1]);
		expect(url.startsWith('/v2.51/search/comments?')).toBe(true);
		expect(params.get('q')).toBe('test drive');
		expect(params.get('sorting')).toBe('date');
		expect(params.get('strict')).toBe('true');
		expect(params.get('author')).toBe('933181');
		expect(params.get('page')).toBe('2');

		vi.mocked(fetchSearch).mockResolvedValueOnce(Response.json({
			result: { items: [rawComment(202)], total: 18 }
		}));

		const byAuthorOnly = await dtfApiProvider.searchComments({ authorId: 933181, page: 0 });
		const authorOnlyParams = new URLSearchParams(vi.mocked(fetchSearch).mock.calls[1][0].split('?')[1]);
		expect(authorOnlyParams.has('q')).toBe(false);
		expect(authorOnlyParams.get('author')).toBe('933181');
		expect(authorOnlyParams.get('page')).toBe('1');
		expect(byAuthorOnly.page).toBe(1);
	});

	it('считает hasMore по размеру страницы (12) и total, пропускает битые элементы без id', async () => {
		const page1 = Array.from({ length: 12 }, (_, i) => rawComment(i + 1));
		vi.mocked(fetchSearch).mockResolvedValueOnce(Response.json({
			result: { items: page1, total: 18 }
		}));
		const first = await dtfApiProvider.searchComments({ query: 'a', page: 1 });
		expect(first.hasMore).toBe(true);

		const page2 = Array.from({ length: 6 }, (_, i) => rawComment(i + 13));
		vi.mocked(fetchSearch).mockResolvedValueOnce(Response.json({
			result: { items: [...page2, { type: 'comment', data: {} }], total: 18 }
		}));
		const second = await dtfApiProvider.searchComments({ query: 'a', page: 2 });
		expect(second.items).toHaveLength(6);
		expect(second.hasMore).toBe(false);
	});

	it('не ставит searchSnippet и postSubsiteId, если они отсутствуют, и пробрасывает ошибку сети', async () => {
		vi.mocked(fetchSearch).mockResolvedValueOnce(Response.json({
			result: { items: [{ type: 'comment', data: { id: 5, text: 'ок' } }], total: 1 }
		}));
		const res = await dtfApiProvider.searchComments({ query: 'ок' });
		expect(res.items[0].postId).toBe(0);
		expect(res.items[0].searchSnippet).toBeUndefined();
		expect(res.items[0].postSubsiteId).toBeUndefined();

		vi.mocked(fetchSearch).mockRejectedValueOnce(new Error('Сетевая ошибка'));
		await expect(dtfApiProvider.searchComments({ query: 'ок' })).rejects.toThrow('Сетевая ошибка');
	});
});

describe('searchPosts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('передаёт author и курсор; при указанном authorId работает и без query', async () => {
		vi.mocked(fetchSearch).mockResolvedValueOnce(Response.json({
			result: {
				items: [{
					type: 'entry',
					data: { id: 10, title: 'Пост', author: { id: 3469248, name: 'A' }, blocks: [] },
					meta: { highlight: 'Пост<mark>тест</mark>' }
				}],
				lastId: 10,
				lastSortingValue: 2,
				total: 1
			}
		}));

		const withAuthor = await dtfApiProvider.searchPosts(
			'тест',
			'date',
			{ title: false, editorial: false, strict: true, authorId: 3469248 },
			{ lastId: 20, lastSortingValue: 5 }
		);

		const url1 = vi.mocked(fetchSearch).mock.calls[0][0];
		const params1 = new URLSearchParams(url1.split('?')[1]);
		expect(url1.startsWith('/v2.10/search/posts?')).toBe(true);
		expect(params1.get('q')).toBe('тест');
		expect(params1.get('sorting')).toBe('date');
		expect(params1.get('strict')).toBe('true');
		expect(params1.get('author')).toBe('3469248');
		expect(params1.get('lastId')).toBe('20');
		expect(params1.get('lastSortingValue')).toBe('5');
		expect(withAuthor.total).toBe(1);
		expect(withAuthor.items[0].searchSnippet).toBe('<mark>тест</mark>');

		vi.mocked(fetchSearch).mockResolvedValueOnce(Response.json({
			result: { items: [], total: 0 }
		}));

		await dtfApiProvider.searchPosts('', 'relevance', { title: false, editorial: false, strict: false, authorId: 3469248 });
		const params2 = new URLSearchParams(vi.mocked(fetchSearch).mock.calls[1][0].split('?')[1]);
		expect(params2.has('q')).toBe(false);
		expect(params2.get('author')).toBe('3469248');
	});
});
