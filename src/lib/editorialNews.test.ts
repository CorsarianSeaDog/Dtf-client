import { afterEach, expect, it, vi } from 'vitest';
import type { PaginatedResult, Post } from '$lib/api/types';

const { getEditorialNews } = vi.hoisted(() => ({ getEditorialNews: vi.fn() }));
vi.mock('$lib/api/index.svelte', () => ({ api: { getEditorialNews } }));

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
	getEditorialNews.mockReset();
});

it('ждёт общий запрос новостей, сохраняет порции и обновляет устаревшее', async () => {
	const { editorialNews } = await import('./editorialNews.svelte');
	const first = { id: 1 } as Post;
	const next = { id: 2 } as Post;
	let finish!: (page: PaginatedResult<Post>) => void;
	getEditorialNews.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

	const pending = editorialNews.loadInitial();
	expect(editorialNews.loadInitial()).toBe(pending);
	expect(editorialNews.loading).toBe(true);
	expect(editorialNews.ready).toBe(false);
	finish({ items: [first], lastId: 10 });
	await pending;
	expect(editorialNews.ready).toBe(true);
	expect(editorialNews.loading).toBe(false);
	await editorialNews.loadInitial();
	expect(getEditorialNews).toHaveBeenCalledTimes(1);

	getEditorialNews.mockResolvedValueOnce({ items: [next], lastId: 20 });
	await editorialNews.loadMore();
	expect(getEditorialNews).toHaveBeenLastCalledWith(10);
	expect(editorialNews.items).toEqual([first, next]);
	await editorialNews.loadInitial();
	expect(editorialNews.items).toEqual([first, next]);

	vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * 60_000);
	getEditorialNews.mockResolvedValueOnce({ items: [] });
	await editorialNews.loadInitial();
	expect(getEditorialNews).toHaveBeenLastCalledWith(0);
	expect(editorialNews.items).toEqual([]);
	expect(editorialNews.hasMore).toBe(false);
});

it('ошибка новостей завершает ожидание ленты и позволяет повторить запрос, сохраняя показанное', async () => {
	const { editorialNews } = await import('./editorialNews.svelte');
	vi.spyOn(console, 'error').mockImplementation(() => {});
	getEditorialNews.mockRejectedValueOnce(new Error('Нет сети'));
	await expect(editorialNews.loadInitial()).resolves.toBeUndefined();
	expect(editorialNews.loading).toBe(false);
	expect(editorialNews.ready).toBe(true);
	expect(editorialNews.items).toEqual([]);

	const first = { id: 1 } as Post;
	getEditorialNews.mockResolvedValueOnce({ items: [first], lastId: 10 });
	await editorialNews.loadInitial();
	expect(editorialNews.items).toEqual([first]);

	getEditorialNews.mockRejectedValueOnce(new Error('Нет сети'));
	await expect(editorialNews.loadInitial(true)).resolves.toBeUndefined();
	expect(editorialNews.items).toEqual([first]);
	expect(editorialNews.loading).toBe(false);
});

it('принудительное обновление во время подгрузки порции перезапрашивает начало и сбрасывает lastId', async () => {
	const { editorialNews } = await import('./editorialNews.svelte');
	const initial = { id: 1 } as Post;
	getEditorialNews.mockResolvedValueOnce({ items: [initial], lastId: 10 });
	await editorialNews.loadInitial();

	let finishMore!: (page: PaginatedResult<Post>) => void;
	getEditorialNews.mockReturnValueOnce(new Promise((resolve) => { finishMore = resolve; }));
	const morePromise = editorialNews.loadMore();

	const fresh = { id: 2 } as Post;
	getEditorialNews.mockResolvedValueOnce({ items: [fresh] });
	const refreshPromise = editorialNews.loadInitial(true);

	finishMore({ items: [{ id: 99 } as Post], lastId: 20 });
	await Promise.all([morePromise, refreshPromise]);

	expect(editorialNews.items).toEqual([fresh]);

	getEditorialNews.mockResolvedValueOnce({ items: [] });
	await editorialNews.loadMore();
	expect(getEditorialNews).toHaveBeenLastCalledWith(0);
});

const post = (id: number, title: string): Post => ({
	id,
	sourceId: 'dtf',
	title,
	blocks: [],
	author: { id: 1, name: 'Editor' },
	commentsCount: 0,
	createdAt: '',
	isEditorial: true
});

it('в жёстком режиме дозагружает до 4 видимых новостей и буферизует остаток неровного батча для loadMore', async () => {
	const { filterNewsItems, filterSettings } = await import('./storage/filter.svelte');
	filterSettings.patch({ mode: 'hard', filterNews: true, keywords: ['скрыть'], tags: [], users: [] });
	const { editorialNews } = await import('./editorialNews.svelte');

	getEditorialNews
		.mockResolvedValueOnce({
			items: [post(1, 'Новость 1'), post(2, 'Скрыть 2'), post(3, 'Новость 3'), post(4, 'Скрыть 4')],
			lastId: 100
		})
		.mockResolvedValueOnce({
			items: [post(5, 'Новость 5'), post(6, 'Новость 6'), post(7, 'Новость 7'), post(8, 'Новость 8')],
			lastId: 90
		});

	await editorialNews.loadInitial();
	expect(getEditorialNews).toHaveBeenCalledTimes(2);
	expect(getEditorialNews).toHaveBeenNthCalledWith(1, 0);
	expect(getEditorialNews).toHaveBeenNthCalledWith(2, 100);
	expect(filterNewsItems(editorialNews.items).map((r) => r.item.id)).toEqual([1, 3, 5, 6]);
	expect(editorialNews.hasMore).toBe(true);

	// Следующая порция забирает [7, 8] из буфера и добирает ещё 2 видимые из нового батча, оставляя [12] в буфере
	getEditorialNews.mockResolvedValueOnce({
		items: [post(9, 'Скрыть 9'), post(10, 'Новость 10'), post(11, 'Новость 11'), post(12, 'Новость 12')],
		lastId: 80
	});

	await editorialNews.loadMore();
	expect(getEditorialNews).toHaveBeenCalledTimes(3);
	expect(getEditorialNews).toHaveBeenLastCalledWith(90);
	expect(filterNewsItems(editorialNews.items).map((r) => r.item.id)).toEqual([1, 3, 5, 6, 7, 8, 10, 11]);
	expect(editorialNews.hasMore).toBe(true);
});

it('останавливает дозагрузку после 3 дополнительных запросов (предохранитель) и не догружает в мягком режиме', async () => {
	const { filterNewsItems, filterSettings } = await import('./storage/filter.svelte');
	filterSettings.patch({ mode: 'hard', filterNews: true, keywords: ['скрыть'], tags: [], users: [] });
	const { editorialNews } = await import('./editorialNews.svelte');

	getEditorialNews
		.mockResolvedValueOnce({ items: [post(1, 'Живая 1'), post(2, 'Скрыть'), post(3, 'Скрыть'), post(4, 'Скрыть')], lastId: 100 })
		.mockResolvedValueOnce({ items: [post(5, 'Скрыть'), post(6, 'Скрыть')], lastId: 90 })
		.mockResolvedValueOnce({ items: [post(7, 'Скрыть'), post(8, 'Скрыть')], lastId: 80 })
		.mockResolvedValueOnce({ items: [post(9, 'Скрыть'), post(10, 'Скрыть')], lastId: 70 })
		.mockResolvedValueOnce({ items: [post(11, 'Живая 11')], lastId: 60 });

	await editorialNews.loadInitial();
	// 1 основной запрос + 3 дополнительных = 4
	expect(getEditorialNews).toHaveBeenCalledTimes(4);
	expect(filterNewsItems(editorialNews.items).map((r) => r.item.id)).toEqual([1]);
	expect(editorialNews.hasMore).toBe(true);

	// В мягком режиме лишние дозагрузки не делаются
	filterSettings.patch({ mode: 'soft' });
	getEditorialNews.mockReset();
	getEditorialNews.mockResolvedValueOnce({
		items: [post(20, 'Скрыть'), post(21, 'Скрыть')],
		lastId: 50
	});
	await editorialNews.loadInitial(true);
	expect(getEditorialNews).toHaveBeenCalledTimes(1);
	expect(editorialNews.items.map((p) => p.id)).toEqual([20, 21]);
});

it('скрывает hasMore, когда сервер закончился и в буфере остались только отфильтрованные новости', async () => {
	const { filterNewsItems, filterSettings } = await import('./storage/filter.svelte');
	filterSettings.patch({ mode: 'hard', filterNews: true, keywords: ['скрыть'], tags: [], users: [] });
	const { editorialNews } = await import('./editorialNews.svelte');

	getEditorialNews
		.mockResolvedValueOnce({
			items: [post(1, 'Живая 1'), post(2, 'Живая 2'), post(3, 'Живая 3'), post(4, 'Живая 4'), post(5, 'Скрыть 5')],
			lastId: 10
		})
		.mockResolvedValueOnce({ items: [], lastId: 10 });

	await editorialNews.loadInitial();
	expect(filterNewsItems(editorialNews.items).map((r) => r.item.id)).toEqual([1, 2, 3, 4]);
	expect(editorialNews.hasMore).toBe(true);

	await editorialNews.loadMore();
	expect(filterNewsItems(editorialNews.items).map((r) => r.item.id)).toEqual([1, 2, 3, 4]);
	expect(editorialNews.hasMore).toBe(false);
});
