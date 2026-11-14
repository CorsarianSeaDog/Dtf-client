import { describe, expect, it, vi } from 'vitest';
import { dtfApiProvider } from './index';
import { fetchWithAuth } from './client';

vi.mock('./client', async (importOriginal) => ({
	...await importOriginal<typeof import('./client')>(),
	fetchWithAuth: vi.fn()
}));

describe('getProfile', () => {
	it('запрашивает профиль по короткому имени или числовому ID', async () => {
		for (const [id, query] of [['donatovnet', 'uri=donatovnet'], [970884, 'id=970884'], ['a&b', 'uri=a%26b']] as const) {
			vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: { subsite: { id: 970884, name: 'Donatov.Net' } } }));
			await expect(dtfApiProvider.getProfile(id)).resolves.toMatchObject({ id: 970884, name: 'Donatov.Net' });
			expect(fetchWithAuth).toHaveBeenLastCalledWith(`https://api.dtf.ru/v2.31/subsite?${query}`);
		}
	});

	it('возвращает ошибку для неизвестного имени и сбоя сети', async () => {
		vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: {} }));
		await expect(dtfApiProvider.getProfile('unknown')).rejects.toThrow('Профиль не найден');
		vi.mocked(fetchWithAuth).mockRejectedValueOnce(new Error('Сетевая ошибка'));
		await expect(dtfApiProvider.getProfile('donatovnet')).rejects.toThrow('Сетевая ошибка');
	});
});

describe('getRecommendations', () => {
	it('запрашивает первую страницу и следующую по курсору, курсор кончается вместе с записями', async () => {
		const entry = { id: 5, title: 'Пост', author: { id: 1, name: 'A' }, blocks: [] };
		vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: { items: [{ type: 'entry', data: entry }], lastId: '5397840', excludeIds: 'a+b/c' } }));
		const first = await dtfApiProvider.getRecommendations(100);
		expect(fetchWithAuth).toHaveBeenLastCalledWith('https://api.dtf.ru/v2.10/recommendations?markdown=false&contentId=100&previousPage=post');
		expect(first.cursor).toEqual({ lastId: '5397840', excludeIds: 'a+b/c' });

		vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: { items: [], lastId: '5397840', excludeIds: 'x' } }));
		const next = await dtfApiProvider.getRecommendations(100, first.cursor);
		expect(fetchWithAuth).toHaveBeenLastCalledWith(expect.stringContaining('&lastId=5397840&excludeIds=a%2Bb%2Fc'));
		expect(next.cursor).toBeUndefined();
	});
});

describe('getProfileComments', () => {
	it('передаёт сортировку new и hotness в /v2.5/comments и курсор пагинации', async () => {
		const raw = { id: 10, text: 'Коммент', author: { id: 1, name: 'A' }, entry: { id: 42 } };
		vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: { items: [raw], lastId: 10, lastSortingValue: 1700000000 } }));
		await dtfApiProvider.getProfileComments(125515, 'new');
		expect(fetchWithAuth).toHaveBeenLastCalledWith('https://api.dtf.ru/v2.5/comments?subsiteId=125515&sorting=new&page=0');

		vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: { items: [raw], lastId: 10, lastSortingValue: 73.5 } }));
		await dtfApiProvider.getProfileComments(125515, 'popular', { lastId: 10, lastSortingValue: 73.5 });
		expect(fetchWithAuth).toHaveBeenLastCalledWith('https://api.dtf.ru/v2.5/comments?subsiteId=125515&sorting=hotness&page=0&lastId=10&lastSortingValue=73.5');
	});
});
