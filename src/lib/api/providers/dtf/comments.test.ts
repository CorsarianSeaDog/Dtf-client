import { expect, it, vi } from 'vitest';
import { dtfApiProvider } from './index';
import { fetchWithAuth } from './client';

vi.mock('./client', async (importOriginal) => ({
	...await importOriginal<typeof import('./client')>(),
	fetchWithAuth: vi.fn()
}));

it('для «Первых» запрашивает поддерживаемую DTF сортировку date', async () => {
	vi.mocked(fetchWithAuth).mockResolvedValueOnce(Response.json({ result: { items: [] } }));
	await dtfApiProvider.getComments(42, undefined, 'dateAsc');
	expect(fetchWithAuth).toHaveBeenCalledWith('https://api.dtf.ru/v2.10/comments?contentId=42&sorting=date');
});
