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
