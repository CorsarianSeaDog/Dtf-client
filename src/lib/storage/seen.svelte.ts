import { postKey } from '$lib/api/utils';
import { persistedState } from './persisted.svelte';
import { settings, type SeenFeed } from './settings.svelte';

/*
 * Журнал прочитанных постов для выбранных лент. Лежит только на этом устройстве.
 * Что считать прочтением, решают настройки: открытие на N секунд, конец поста в экране, показ в ленте на N секунд.
 * Пока скрытие выключено, журнал не ведётся.
 */

/** Старые ключи вытесняются, чтобы журнал не рос бесконечно */
const LIMIT = 5000;
/** Отметки копятся в памяти и сохраняются пачкой: persistedState пишет весь JSON целиком */
const FLUSH_MS = 2000;
/** Сколько конец поста должен пробыть в экране, чтобы не засчитывать быструю прокрутку мимо */
const END_SECONDS = 0.5;
/** Карточка в ленте считается показанной, когда в центральной части экрана: высокие карточки целиком в экран не входят */
const FEED_MARGIN = '-30% 0px';

type PostRef = { id: number; sourceId: string };

const store = persistedState<string[]>('redtf:data:seen-posts', []);
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** Сохранить накопленные отметки. Они дописываются к свежему значению, чтобы не затереть журнал другой вкладки */
export function flushSeen() {
	clearTimeout(timer);
	timer = undefined;
	if (pending.size === 0) return;
	const fresh = pending;
	pending = new Set();
	store.value = [...store.value.filter((key) => !fresh.has(key)), ...fresh].slice(-LIMIT);
}

if (typeof document !== 'undefined') {
	addEventListener('pagehide', flushSeen);
	document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushSeen());
}

export const hidesSeenIn = (feed?: SeenFeed) =>
	settings.value.hideSeen && (feed === undefined || settings.value.hideSeenFeeds[feed] !== false);

export const markSeen = (post: PostRef, feed?: SeenFeed) => {
	if (!hidesSeenIn(feed)) return;
	const key = postKey(post);
	if (pending.has(key) || store.value.includes(key)) return;
	pending.add(key);
	timer ??= setTimeout(flushSeen, FLUSH_MS);
};

/** Лента берёт снимок при загрузке: только что прочитанное остаётся на месте до обновления */
export const seenSnapshot = (feed: SeenFeed) => new Set(hidesSeenIn(feed) ? [...store.value, ...pending] : []);

export function clearSeen() {
	pending = new Set();
	store.value = [];
}

/**
 * Отметить пост прочитанным, когда `el` пробыл в экране `seconds` секунд подряд. `margin` сужает зону видимости (rootMargin).
 * Скрытая вкладка и слой под открытой страницей (content-visibility) не считаются: таймер ждёт, пока элемент снова будет виден.
 * Возвращает снятие наблюдения.
 */
export function watchSeen(
	el: Element,
	post: PostRef,
	seconds: number,
	{ margin = '0px', feed }: { margin?: string; feed?: SeenFeed } = {}
): () => void {
	if (typeof IntersectionObserver === 'undefined') return () => {};
	let wait: ReturnType<typeof setTimeout> | undefined;
	// checkVisibility() не замечает content-visibility: hidden на самом элементе, а слой под страницей скрыт именно на корне
	const probe = () => el.checkVisibility?.() !== false && globalThis.getComputedStyle?.(el).contentVisibility !== 'hidden';
	const arm = (ms: number) => {
		wait = setTimeout(() => {
			if (document.visibilityState === 'visible' && probe()) {
				markSeen(post, feed);
				observer.disconnect();
			} else arm(1000);
		}, ms);
	};
	const observer = new IntersectionObserver(
		(entries) => {
			clearTimeout(wait);
			if (entries[entries.length - 1].isIntersecting) arm(seconds * 1000);
		},
		{ rootMargin: margin }
	);
	observer.observe(el);
	return () => {
		clearTimeout(wait);
		observer.disconnect();
	};
}

/** Страница поста: пост открыт `seenOpenSeconds` секунд */
export const trackOpen = (el: Element, post: PostRef, feed?: SeenFeed) => {
	const seconds = settings.value.seenOpenSeconds;
	return hidesSeenIn(feed) && seconds > 0 ? watchSeen(el, post, seconds, { feed }) : undefined;
};

/** Пустой элемент в конце поста: когда он в экране, пост дочитан */
export const trackFullRead = (el: Element, post: PostRef, feed?: SeenFeed) =>
	hidesSeenIn(feed) && settings.value.seenFullRead ? watchSeen(el, post, END_SECONDS, { feed }) : undefined;

/** Нужна ли ленте обёртка с наблюдателем вокруг карточек */
export const tracksFeed = (feed: SeenFeed) => hidesSeenIn(feed) && settings.value.seenFeedSeconds > 0;

/** Карточка поста в ленте */
export const trackInFeed = (el: Element, post: PostRef, feed: SeenFeed) =>
	tracksFeed(feed) ? watchSeen(el, post, settings.value.seenFeedSeconds, { margin: FEED_MARGIN, feed }) : undefined;
