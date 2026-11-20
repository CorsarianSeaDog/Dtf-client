import { expect, it, vi } from 'vitest';
import { dtfApiProvider } from './index';
import { fetchWithAuth } from './client';

vi.mock('./client', async (importOriginal) => ({
	...await importOriginal<typeof import('./client')>(),
	fetchWithAuth: vi.fn(),
	requireAuth: vi.fn()
}));

it('для «Первых» запрашивает поддерживаемую DTF сортировку date', async () => {
	vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: { items: [] } }));
	await dtfApiProvider.getComments(42, undefined, 'dateAsc');
	expect(fetchWithAuth).toHaveBeenCalledWith('https://api.dtf.ru/v2.10/comments?contentId=42&sorting=date');
});

it('getFavoriteGifs возвращает mp4 previewUrl для анимации в меню гифок', async () => {
	const andropov = { type: 'image', data: { uuid: 'uuid-1', width: 200, height: 150, size: 1000, type: 'gif' } };
	vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: { items: [{ leonardoUuid: 'uuid-1', andropov }] } }));

	const items = await dtfApiProvider.getFavoriteGifs();
	expect(items).toEqual([{ previewUrl: 'https://leonardo.osnova.io/uuid-1/-/format/mp4/', media: andropov }]);
});

it('addFavoriteGif отправляет andropov/tenor в /v2.9/favorite-gifs и removeFavoriteGif удаляет по uuid', async () => {
	const andropov = { type: 'image', data: { uuid: '1111-2222', width: 320, height: 240, size: 500, type: 'gif' } };
	vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: { leonardoUuid: '1111-2222', andropov } }));

	const added = await dtfApiProvider.addFavoriteGif({ uuid: '1111-2222', width: 320, height: 240, size: 500 });
	expect(added).toEqual({ previewUrl: 'https://leonardo.osnova.io/1111-2222/-/format/mp4/', media: andropov });
	const [addUrl, addInit] = vi.mocked(fetchWithAuth).mock.calls.at(-1)!;
	expect(addUrl).toBe('https://api.dtf.ru/v2.9/favorite-gifs');
	expect(addInit?.method).toBe('POST');
	const addBody = addInit?.body as URLSearchParams;
	expect(addBody.get('type')).toBe('andropov');
	expect(addBody.get('id')).toBe('1111-2222');
	expect(JSON.parse(addBody.get('data')!)).toEqual({ type: 'image', data: { uuid: '1111-2222', width: 320, height: 240, size: 500, type: 'gif' } });

	vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: {} }));
	await dtfApiProvider.removeFavoriteGif('1111-2222');
	expect(vi.mocked(fetchWithAuth).mock.calls.at(-1)).toEqual(['https://api.dtf.ru/v2.9/favorite-gifs/1111-2222', { method: 'DELETE' }]);
});
