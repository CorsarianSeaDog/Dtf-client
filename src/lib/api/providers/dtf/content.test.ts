import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '$lib/api/types';
import { authStorage } from '$lib/storage/auth.svelte';
import { dtfApiProvider } from './index';
import { fetchWithAuth } from './client';

vi.mock('./client', async (importOriginal) => ({
	...await importOriginal<typeof import('./client')>(),
	fetchWithAuth: vi.fn()
}));

const session: Session = {
	type: 'Bearer',
	accessToken: 'token',
	refreshToken: 'refresh',
	accessExpTimestamp: Math.floor(Date.now() / 1000) + 3600,
	refreshExpTimestamp: Math.floor(Date.now() / 1000) + 7200
};

describe('deletePost', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authStorage.session = session;
	});

	afterEach(() => {
		authStorage.session = null;
	});

	it('отправляет DELETE /v2.4/content/{id} и проверяет успех', async () => {
		vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ message: '', result: { success: true } }));

		await expect(dtfApiProvider.deletePost(5388155)).resolves.toBeUndefined();
		expect(fetchWithAuth).toHaveBeenCalledWith('https://api.dtf.ru/v2.4/content/5388155', { method: 'DELETE' });
	});

	it('бросает ошибку при отсутствии сессии или success: false', async () => {
		authStorage.session = null;
		await expect(dtfApiProvider.deletePost(5388155)).rejects.toThrow();
		expect(fetchWithAuth).not.toHaveBeenCalled();

		authStorage.session = session;
		vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ message: '', result: { success: false } }));
		await expect(dtfApiProvider.deletePost(5388155)).rejects.toThrow('Не удалось удалить запись');
	});
});

describe('getContentControls', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authStorage.session = session;
	});

	afterEach(() => {
		authStorage.session = null;
	});

	it('запрашивает GET /v2.4/content/etcControls и маппит флаги', async () => {
		vi.mocked(fetchWithAuth).mockResolvedValueOnce(
			Response.json({ message: '', result: { etcControls: { editEntry: true, pinContent: false, remove: true } } })
		);

		await expect(dtfApiProvider.getContentControls(42)).resolves.toEqual({
			editEntry: true,
			pinContent: false,
			remove: true
		});
		expect(fetchWithAuth).toHaveBeenCalledWith('https://api.dtf.ru/v2.4/content/etcControls?id=42');
	});
});

describe('searchMentions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authStorage.session = session;
	});

	afterEach(() => {
		authStorage.session = null;
	});

	it('запрашивает /v2.9/users/mentions с q или без него и не ходит без авторизации', async () => {
		authStorage.session = null;
		await expect(dtfApiProvider.searchMentions('vin')).rejects.toThrow();
		expect(fetchWithAuth).not.toHaveBeenCalled();

		authStorage.session = session;
		vi.mocked(fetchWithAuth).mockResolvedValueOnce(
			Response.json({ message: '', result: [{ id: 1, name: 'Vince', nickname: 'vince' }] })
		);
		await expect(dtfApiProvider.searchMentions('  vin ')).resolves.toEqual([
			{ id: 1, name: 'Vince', nickname: 'vince', avatarUrl: undefined }
		]);
		expect(fetchWithAuth).toHaveBeenCalledWith('https://api.dtf.ru/v2.9/users/mentions?q=vin', { signal: undefined });

		vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ message: '', result: [] }));
		await expect(dtfApiProvider.searchMentions('')).resolves.toEqual([]);
		expect(fetchWithAuth).toHaveBeenCalledWith('https://api.dtf.ru/v2.9/users/mentions', { signal: undefined });
	});
});

describe('getBookmarkedComments', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authStorage.session = session;
	});

	afterEach(() => {
		authStorage.session = null;
	});

	const comment = (id: number, date: number) => ({ type: 'comment', data: { id, date, text: '', author: { id: 1, name: 'A' }, entry: { id: 77 } } });

	it('полная страница отдаёт дату последнего как курсор, неполная — конец списка', async () => {
		const full = Array.from({ length: 10 }, (_, i) => comment(i + 1, 1700000000 - i));
		vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ message: '', result: full }));

		const first = await dtfApiProvider.getBookmarkedComments();
		expect(fetchWithAuth).toHaveBeenCalledWith('https://api.dtf.ru/v2.8/bookmarks?type=comments&count=10');
		expect(first.items).toHaveLength(10);
		expect(first.items[0].postId).toBe(77);
		expect(first.lastSortingValue).toBe(1700000000 - 9);

		vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ message: '', result: [comment(11, 1690000000)] }));
		const last = await dtfApiProvider.getBookmarkedComments(first.lastSortingValue);
		expect(fetchWithAuth).toHaveBeenLastCalledWith(`https://api.dtf.ru/v2.8/bookmarks?type=comments&count=10&last_sorting_value=${1700000000 - 9}`);
		expect(last.lastSortingValue).toBeUndefined();
	});
});

describe('copyPostToDraft', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authStorage.session = session;
	});

	afterEach(() => {
		authStorage.session = null;
	});

	const blocks = [
		{ type: 'text', anchor: 'intro', data: { text: 'Текст' } },
		{ type: 'media', cover: true, data: { items: [{ image: { data: { uuid: 'test-media' } } }] } }
	];
	const original = {
		id: 42, type: 1, subsite_id: 7, title: 'Пост', is_published: true, is_adult: true,
		is_enabled_comments: false, currentVersionId: 12, entry: { blocks }
	};

	it('создаёт черновик с исходными блоками и не затрагивает оригинал', async () => {
		vi.mocked(fetchWithAuth)
			.mockResolvedValueOnce(Response.json({ result: { entry: original } }))
			.mockResolvedValueOnce(Response.json({ result: { entry: { id: 55, is_published: false } } }));

		await expect(dtfApiProvider.copyPostToDraft(42)).resolves.toBe(55);
		expect(fetchWithAuth).toHaveBeenNthCalledWith(1, 'https://api.dtf.ru/v2.1/editor/42');
		const [saveUrl, saveInit] = vi.mocked(fetchWithAuth).mock.calls[1];
		expect(saveUrl).toBe('https://api.dtf.ru/v2.31/editor');
		expect(saveInit?.method).toBe('POST');
		const sentEntry = JSON.parse((saveInit?.body as FormData).get('entry') as string);
		expect(sentEntry).toEqual({
			id: 0, type: 1, subsite_id: 7, title: 'Пост', is_published: false, is_adult: true,
			is_enabled_comments: false, is_enabled_likes: true, is_enabled_ad: true, entry: { blocks }
		});
	});

	it('показывает ошибку, если DTF вернул ID оригинала или опубликованную запись', async () => {
		vi.mocked(fetchWithAuth)
			.mockResolvedValueOnce(Response.json({ result: { entry: original } }))
			.mockResolvedValueOnce(Response.json({ result: { entry: { id: original.id, is_published: false } } }))
			.mockResolvedValueOnce(Response.json({ result: { entry: original } }))
			.mockResolvedValueOnce(Response.json({ result: { entry: { id: 56, is_published: true } } }));

		await expect(dtfApiProvider.copyPostToDraft(42)).rejects.toThrow('DTF не подтвердил создание нового черновика');
		await expect(dtfApiProvider.copyPostToDraft(42)).rejects.toThrow('DTF не подтвердил создание нового черновика');
	});
});
