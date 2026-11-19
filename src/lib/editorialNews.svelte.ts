import { api } from '$lib/api/index.svelte';
import type { Post } from '$lib/api/types';
import { filterSettings, matchNewsFilter } from '$lib/storage/filter.svelte';

// Новости и подгруженные порции переживают пересоздание ленты и смену темы.
const STALE = 5 * 60_000;
const NEWS_BATCH = 4;
const MAX_EXTRA_FETCHES = 3;

let items = $state.raw<Post[]>([]);
let buffer = $state.raw<Post[]>([]);
let loading = $state(false);
let ready = $state(false);
let serverHasMore = $state(true);
let lastId = 0;
let updatedAt = 0;
let requestId = 0;
let pending: Promise<void> | undefined;
let pendingReplace = false;

function countNews(pool: Post[], hard: boolean) {
	if (!hard) return { visible: pool.length, hidden: 0 };
	let visible = 0;
	let hidden = 0;
	for (const post of pool) {
		if (matchNewsFilter(post)) hidden++;
		else visible++;
	}
	return { visible, hidden };
}

function splitNewsPool(pool: Post[], limit: number, hard: boolean): { taken: Post[]; rest: Post[] } {
	if (!hard) return { taken: pool, rest: [] };
	let visible = 0;
	for (let i = 0; i < pool.length; i++) {
		if (!matchNewsFilter(pool[i])) {
			visible++;
			if (visible === limit) {
				return { taken: pool.slice(0, i + 1), rest: pool.slice(i + 1) };
			}
		}
	}
	return { taken: pool, rest: [] };
}

async function runLoad(replace: boolean, id: number): Promise<void> {
	const hard = filterSettings.value.mode === 'hard';
	const pool: Post[] = replace ? [] : [...buffer];
	let cursor = replace ? 0 : lastId;
	let hasNext = replace ? true : serverHasMore;
	let fetched = 0;

	try {
		while (hasNext) {
			const { visible, hidden } = countNews(pool, hard);
			if (fetched > 0 && (!hard || visible >= NEWS_BATCH || hidden === 0 || fetched > MAX_EXTRA_FETCHES)) {
				break;
			}
			// Если остатка прошлого неровного батча хватает на полную порцию, запрос не нужен
			if (fetched === 0 && !replace && visible >= NEWS_BATCH) {
				break;
			}

			const page = await api.getEditorialNews(cursor);
			if (id !== requestId) return;

			fetched++;
			pool.push(...page.items);
			cursor = page.lastId ?? cursor;
			hasNext = page.items.length > 0;
		}
	} catch (error) {
		if (id !== requestId) return;
		if (fetched === 0) {
			// Новости — дополнение: ошибка не мешает показать посты, уже загруженное остаётся.
			console.error('Не удалось загрузить новости:', error);
			return;
		}
		console.error('Не удалось догрузить новости:', error);
	}

	if (id !== requestId) return;
	const { taken, rest } = splitNewsPool(pool, NEWS_BATCH, hard);
	items = replace ? taken : [...items, ...taken];
	buffer = rest;
	lastId = cursor;
	serverHasMore = hasNext;
	updatedAt = Date.now();
}

function load(replace = false): Promise<void> {
	if (pending) {
		if (!replace || pendingReplace) return pending;
	}
	if (!replace && !serverHasMore && buffer.length === 0) return Promise.resolve();
	const id = ++requestId;
	loading = true;
	pendingReplace = replace;
	const run = runLoad(replace, id).finally(() => {
		if (id === requestId) {
			loading = false;
			ready = true;
			pending = undefined;
		}
	});
	pending = run;
	return run;
}

export const editorialNews = {
	get items() {
		return items;
	},
	get loading() {
		return loading;
	},
	get hasMore() {
		return (
			serverHasMore ||
			(filterSettings.value.mode === 'hard'
				? buffer.some((post) => !matchNewsFilter(post))
				: buffer.length > 0)
		);
	},
	get ready() {
		return ready;
	},
	loadInitial(force = false) {
		return !force && updatedAt && Date.now() - updatedAt < STALE ? Promise.resolve() : load(true);
	},
	loadMore: () => load()
};
