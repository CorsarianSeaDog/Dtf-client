import type { PageLoad } from './$types';
import { api } from '$lib/api/index.svelte';
import { DEFAULT_FEED, parseFeed } from '$lib/feed.svelte';
import { authStorage } from '$lib/storage/auth.svelte';

export const load: PageLoad = async ({ url }) => {
	// Явная лента и прежние ссылки на периоды популярного важнее настройки аккаунта.
	if (['feed', 'sorting', 'period'].some((key) => url.searchParams.has(key)) || !authStorage.isAuthenticated) {
		return { defaultFeed: DEFAULT_FEED };
	}

	const generation = authStorage.generation;
	try {
		const settings = await api.getAccountSettings();
		return { defaultFeed: generation === authStorage.generation ? parseFeed(settings.defaultFeed) : DEFAULT_FEED };
	} catch {
		// Ошибка настроек не должна мешать открытию самой ленты.
		return { defaultFeed: DEFAULT_FEED };
	}
};
