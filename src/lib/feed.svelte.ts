import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import { untrack } from 'svelte';
import { scrollBehavior } from './motion';
import { haptics } from './haptics';

/** Ленты на главной в порядке вкладок (и свайпа). Выбранная лента лежит в адресе: /?feed=new */
export const FEEDS = ['popular', 'new', 'my'] as const;
export type FeedName = (typeof FEEDS)[number];

export const DEFAULT_FEED: FeedName = 'popular';

/** Доступные сортировки/фильтры каждой ленты; первый элемент — значение по умолчанию */
export const FEED_SORTINGS = {
	popular: ['now', 'day', 'week', 'month', 'year', 'all'],
	new: ['all', 'from5', 'from10'],
	my: ['new', 'hotness', 'seen']
} as const satisfies Record<FeedName, readonly string[]>;

export type FeedSorting<F extends FeedName = FeedName> = (typeof FEED_SORTINGS)[F][number];

export const defaultSorting = <F extends FeedName>(name: F): FeedSorting<F> => FEED_SORTINGS[name][0];

export function parseFeed(value: string | null): FeedName {
	return FEEDS.find((feed) => feed === value) ?? DEFAULT_FEED;
}

export function parseSorting<F extends FeedName>(name: F, value: string | null): FeedSorting<F> {
	const list: readonly string[] = FEED_SORTINGS[name];
	return (value && list.includes(value) ? value : list[0]) as FeedSorting<F>;
}

export function feedPath(feed: FeedName, sorting: FeedSorting = defaultSorting(feed)): string {
	const params = new URLSearchParams();
	if (feed !== DEFAULT_FEED) params.set('feed', feed);
	if (sorting !== defaultSorting(feed)) params.set('sorting', sorting);
	const query = params.toString();
	return query ? `/?${query}` : '/';
}

/** Соседняя лента в порядке вкладок: -1 — слева, 1 — справа */
export const neighborFeed = (name: FeedName, dir: -1 | 1): FeedName | undefined => FEEDS[FEEDS.indexOf(name) + dir];

// Лента, которую пользователь смотрит. Нужна боковой панели, чтобы подсвечивать её
// и тогда, когда поверх ленты открыт пост (в адресе тогда /post/123)
let current = $state<FeedName>(DEFAULT_FEED);
// Выбранная сортировка сохраняется за каждой лентой при переключении вкладок
const sortings = $state<Record<FeedName, FeedSorting>>({
	popular: defaultSorting('popular'),
	new: defaultSorting('new'),
	my: defaultSorting('my')
});
// Открытые ленты остаются в памяти страницы со своими постами, чтобы возврат и свайп были мгновенными
let kept = $state<FeedName[]>([DEFAULT_FEED]);
let refreshCount = $state(0);
// Обновление начато жестом: индикатор рисует жест, у ленты своего не нужно
let refreshQuiet = $state(false);
// Кто ждёт конца обновления (жест держит загрузку, пока лента не обновится)
let refreshWaiters: (() => void)[] = [];

// Прокрутка каждой ленты. Не состояние: её пишет прокрутка окна, а читают только при смене ленты
const scrolls = new Map<FeedName, number>();
// Куда прокрутить ленту, когда закроются оверлеи (ленту выбрали из-под поста)
let pendingScroll: number | undefined;

const sortingOf = (name: FeedName) => sortings[name];

// Без подписки: адрес ленту синхронизирует эффект страницы, и чтение списка зациклило бы его
function select(name: FeedName, sorting: FeedSorting) {
	current = name;
	sortings[name] = parseSorting(name, sorting);
	untrack(() => feed.keep(name));
}

/** Лента из адреса. Пока поверх ленты открыт оверлей, в адресе его путь, а не лента, и остаётся прежняя */
export function feedFromUrl(): FeedName {
	if (page.state.overlays?.length) return current;
	return parseFeed(page.url.searchParams.get('feed'));
}

/** Сортировка ленты из адреса (поддерживает и прежний `?period=` для популярного); поверх оверлея остаётся прежняя */
export function sortingFromUrl(): FeedSorting {
	if (page.state.overlays?.length) return sortings[current];
	const name = feedFromUrl();
	const raw = page.url.searchParams.get('sorting') ?? (name === 'popular' ? page.url.searchParams.get('period') : null);
	return parseSorting(name, raw);
}

export const feed = {
	get current() {
		return current;
	},
	/** Сортировка открытой ленты */
	get sorting() {
		return sortings[current];
	},
	sortingOf,
	/** Ленты, которые держит страница (открытые и подготовленные для свайпа) */
	get kept(): readonly FeedName[] {
		return kept;
	},
	/** Страница ленты сообщает, какая лента в адресе */
	setCurrent(next: FeedName, sorting: FeedSorting = defaultSorting(next)) {
		select(next, sorting);
	},
	/** Подготовить ленту заранее (соседняя для свайпа): она загрузится и будет ждать скрытой */
	keep(name: FeedName) {
		if (!kept.includes(name)) kept.push(name);
	},
	/** Страница ленты построена заново: прежних списков нет, остаётся только открытая лента */
	reset() {
		kept = [current];
		scrolls.clear();
		pendingScroll = undefined;
	},
	scrollOf(name: FeedName) {
		return scrolls.get(name) ?? 0;
	},
	rememberScroll(name: FeedName, top: number) {
		scrolls.set(name, top);
	},
	/** Прокрутка для ленты, выбранной из-под оверлея. Забирает её слой при закрытии оверлеев */
	consumeScrollTarget() {
		const target = pendingScroll;
		pendingScroll = undefined;
		return target;
	},
	/** Увеличивается, когда ленту просят перезагрузить (клик по логотипу на самой ленте, жест) */
	get refreshCount() {
		return refreshCount;
	},
	/** Обновление начато жестом: лента не показывает своего индикатора */
	get refreshQuiet() {
		return refreshQuiet;
	},
	/** Перезагрузить открытую ленту. Промис выполняется, когда она обновилась или не смогла */
	refresh(quiet = false): Promise<void> {
		if (!quiet) haptics.double();
		refreshQuiet = quiet;
		refreshCount++;
		return new Promise((done) => refreshWaiters.push(done));
	},
	/** Открытая лента закончила обновление */
	refreshed() {
		for (const done of refreshWaiters.splice(0)) done();
	}
};

/**
 * Открыть ленту. Работает из любого места, в том числе из-под оверлея или со страницы поста.
 * Другая лента открывается там, где её оставили. Нажатие на ту ленту, что уже открыта, обновляет её, как клик по логотипу;
 * смена сортировки начинается сверху. Без `sorting` остаётся выбранная у этой ленты раньше.
 */
export function openFeedTab(name: FeedName, sorting?: FeedSorting) {
	haptics.tick();
	const nextSorting = sorting ? parseSorting(name, sorting) : sortings[name];
	const onFeed = page.route.id === '/' && !page.state.overlays?.length;
	if (onFeed && name === current && nextSorting === sortings[name]) {
		window.scrollTo({ top: 0, behavior: scrollBehavior() });
		refreshQuiet = false;
		refreshCount++;
		return Promise.resolve();
	}

	// Та же лента (другая сортировка или выбрана из-под поста) начинается сверху
	if (name === current) {
		scrolls.delete(name);
		if (onFeed) window.scrollTo({ top: 0, behavior: 'instant' });
	}
	if (!onFeed) pendingScroll = scrolls.get(name) ?? 0;

	// Вкладка подсвечивается и лента показывается сразу, не дожидаясь смены адреса
	select(name, nextSorting);
	return goto(resolve(feedPath(name, nextSorting) as '/'), { reset: false });
}
