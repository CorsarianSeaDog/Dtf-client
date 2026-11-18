import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ isAuthenticated: true, generation: 0 }));
const getAccountSettings = vi.hoisted(() => vi.fn());
const page = vi.hoisted(() => ({
	url: new URL('http://localhost/'),
	state: { overlays: [] as App.OverlayState[] },
	data: { defaultFeed: 'popular' }
}));

vi.mock('$app/state', () => ({ page }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/storage/auth.svelte', () => ({ authStorage: auth }));
vi.mock('$lib/api/index.svelte', () => ({ api: { getAccountSettings } }));

import { feed, feedFromUrl, feedPath, sortingFromUrl } from './feed.svelte';
import { load } from '../routes/+page';

const loadHome = (query = '') => load({ url: new URL(`http://localhost/${query}`) } as Parameters<typeof load>[0]);

describe('лента по умолчанию', () => {
	beforeEach(() => {
		auth.isAuthenticated = true;
		auth.generation = 0;
		page.url = new URL('http://localhost/');
		page.state.overlays = [];
		page.data.defaultFeed = 'popular';
		getAccountSettings.mockReset().mockResolvedValue({ defaultFeed: 'my' });
	});

	it.each(['popular', 'new', 'my'])('главная открывает серверную ленту %s', async (name) => {
		getAccountSettings.mockResolvedValue({ defaultFeed: name });
		Object.assign(page.data, await loadHome());
		expect(feedFromUrl()).toBe(name);
		expect(sortingFromUrl()).toBe(name === 'popular' ? 'now' : name === 'new' ? 'all' : 'new');
	});

	it.each(['?feed=popular', '?feed=new', '?feed=my', '?sorting=week', '?period=day'])(
		'явная ссылка %s не зависит от настройки аккаунта',
		async (query) => {
			page.url = new URL(`http://localhost/${query}`);
			Object.assign(page.data, await loadHome(query));
			expect(getAccountSettings).not.toHaveBeenCalled();
			expect(feedFromUrl()).toBe(page.url.searchParams.get('feed') ?? 'popular');
			if (query === '?period=day') expect(sortingFromUrl()).toBe('day');
			if (query === '?sorting=week') expect(sortingFromUrl()).toBe('week');
		}
	);

	it('для гостя, неизвестной настройки и при ошибке остаётся популярное', async () => {
		auth.isAuthenticated = false;
		expect(await loadHome()).toEqual({ defaultFeed: 'popular' });
		expect(getAccountSettings).not.toHaveBeenCalled();

		auth.isAuthenticated = true;
		getAccountSettings.mockResolvedValue({ defaultFeed: 'unknown' });
		expect(await loadHome()).toEqual({ defaultFeed: 'popular' });

		getAccountSettings.mockRejectedValue(new Error('Нет сети'));
		expect(await loadHome()).toEqual({ defaultFeed: 'popular' });
	});

	it('не применяет ответ прежней сессии', async () => {
		const loading = loadHome();
		auth.generation++;
		expect(await loading).toEqual({ defaultFeed: 'popular' });
	});

	it('внутренние ссылки явно сохраняют выбор популярного и его сортировку', () => {
		page.data.defaultFeed = 'my';
		expect(feedPath('popular')).toBe('/?feed=popular');
		page.url = new URL(feedPath('popular', 'week'), 'http://localhost');
		expect(feedFromUrl()).toBe('popular');
		expect(sortingFromUrl()).toBe('week');
	});

	it('оверлей сохраняет ленту под ним', () => {
		feed.setCurrent('new', 'from5');
		page.state.overlays = [{ id: 'post', type: 'post', presentation: 'page', data: { postId: 1, sourceId: 'dtf' } }];
		page.data.defaultFeed = 'my';
		expect(feedFromUrl()).toBe('new');
		expect(sortingFromUrl()).toBe('from5');
	});
});
