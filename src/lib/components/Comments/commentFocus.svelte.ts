import { untrack } from 'svelte';
import { watchUserScroll } from '$lib/watchUserScroll';
import type { CommentsLogic } from './commentsLogic.svelte';

export type CommentFocusStatus = 'idle' | 'loading' | 'waiting' | 'ready' | 'found' | 'hidden-by-filter' | 'not-found';

/** Нарастающие паузы фонового ожидания комментария при задержке API DTF (~58 с суммарно) */
export const FOCUS_RETRY_DELAYS_MS = [3_000, 5_000, 8_000, 12_000, 15_000, 15_000] as const;

export type CommentFocusLogic = Pick<
	CommentsLogic,
	'loading' | 'resyncing' | 'hasMore' | 'error' | 'networkSeq' | 'resolveCommentKey' | 'loadComments' | 'resyncFromServer'
>;

export type CommentFocusController = ReturnType<typeof createCommentFocusController>;

/**
 * Поиск и ожидание `focusCommentId` без сброса уже показанных комментариев:
 * - при промахе в кэше или повторном переходе делает один неразрушающий `resyncFromServer`;
 * - если DTF ещё не отдал комментарий, ждёт его в фоне с нарастающей паузой (до ~60 с) и ловит по WebSocket;
 * - если пользователь сам начал читать/скроллить, не перебивает экран — переводит в `ready` для ручного перехода;
 * - на скрытом слое (`active = false`) ставит таймеры и наблюдение за прокруткой на паузу.
 */
export function createCommentFocusController(options: {
	logic: CommentFocusLogic;
	reveal: (key: string) => void;
	hasRow?: (key: string) => boolean;
	retryDelaysMs?: readonly number[];
	onFocused?: () => void;
	onReady?: (jump: () => void) => void;
}) {
	const { logic, reveal, hasRow = () => true, onFocused, onReady } = options;
	const delays = options.retryDelaysMs ?? FOCUS_RETRY_DELAYS_MS;

	let status = $state<CommentFocusStatus>('idle');
	let current: CommentFocusStatus = 'idle';
	let activeCommentId: number | undefined;
	let lastFocusKey: string | undefined;
	let done = false;
	let startNetworkSeq = 0;
	let initialResyncRequested = false;
	let retryIndex = 0;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let stopScrollWatch: (() => void) | undefined;
	let userScrolled = false;

	const setStatus = (next: CommentFocusStatus): CommentFocusStatus => {
		if (current !== next) status = current = next;
		return next;
	};

	function stopWaiting() {
		clearTimeout(retryTimer);
		retryTimer = undefined;
		stopScrollWatch?.();
		stopScrollWatch = undefined;
	}

	function finish(next: CommentFocusStatus): CommentFocusStatus {
		stopWaiting();
		done = true;
		return setStatus(next);
	}

	function startScrollWatch() {
		if (stopScrollWatch || userScrolled) return;
		stopScrollWatch = watchUserScroll(() => {
			userScrolled = true;
			stopScrollWatch = undefined;
		});
	}

	function focusResolved(resolvedKey: string) {
		finish('found');
		onFocused?.();
		reveal(resolvedKey);
	}

	function scheduleNextRetry() {
		if (retryTimer !== undefined || retryIndex >= delays.length) return;
		const keyAtSchedule = lastFocusKey;
		retryTimer = setTimeout(() => {
			retryTimer = undefined;
			if (keyAtSchedule !== lastFocusKey || done) return;
			// Если уже идёт загрузка/ресинк (например, смена сортировки), не сжигаем попытку — step() перепланирует после её завершения
			if (untrack(() => logic.loading || logic.resyncing)) return;
			retryIndex++;
			void logic.resyncFromServer();
		}, delays[retryIndex]);
	}

	function jump() {
		if (!activeCommentId) return;
		const resolvedKey = untrack(() => logic.resolveCommentKey(activeCommentId!));
		if (!resolvedKey) return;
		if (!untrack(() => hasRow(resolvedKey))) {
			finish('hidden-by-filter');
			return;
		}
		untrack(() => focusResolved(resolvedKey));
	}

	function checkNow() {
		if (!activeCommentId || !lastFocusKey || done) return;
		stopWaiting();
		userScrolled = false;
		startScrollWatch();
		setStatus('waiting');
		if (!untrack(() => logic.loading || logic.resyncing)) {
			untrack(() => void logic.resyncFromServer());
		}
	}

	function retry() {
		if (!activeCommentId || !lastFocusKey) return;
		done = false;
		retryIndex = 0;
		checkNow();
	}

	function dismiss() {
		finish('idle');
	}

	function destroy() {
		stopWaiting();
		activeCommentId = undefined;
		done = true;
	}

	return {
		get status() {
			return status;
		},
		get checking() {
			return logic.loading || logic.resyncing;
		},

		step(focusCommentId?: number, focusNonce?: number, active = true): CommentFocusStatus {
			if (!focusCommentId) {
				stopWaiting();
				activeCommentId = undefined;
				lastFocusKey = undefined;
				done = false;
				return setStatus('idle');
			}

			const currentFocusKey = `${focusCommentId}_${focusNonce ?? 0}`;
			if (currentFocusKey !== lastFocusKey) {
				stopWaiting();
				activeCommentId = focusCommentId;
				lastFocusKey = currentFocusKey;
				done = false;
				startNetworkSeq = untrack(() => logic.networkSeq);
				initialResyncRequested = false;
				retryIndex = 0;
				userScrolled = false;
				setStatus('loading');
			}

			if (done) return current;

			if (!active) {
				stopWaiting();
				return current;
			}

			const resolvedKey = logic.resolveCommentKey(focusCommentId);
			if (resolvedKey) {
				if (!hasRow(resolvedKey)) return finish('hidden-by-filter');

				if (userScrolled) {
					stopWaiting();
					const wasReady = current === 'ready';
					setStatus('ready');
					if (!wasReady) untrack(() => onReady?.(jump));
					return 'ready';
				}

				untrack(() => focusResolved(resolvedKey));
				return 'found';
			}

			if (logic.loading || logic.resyncing) {
				// Во время повторных проверок остаёмся в `waiting`, чтобы плашка не мигала
				if (current !== 'waiting') setStatus('loading');
				return current;
			}

			if (logic.error) return finish('idle');

			if (logic.hasMore) {
				untrack(() => void logic.loadComments());
				return current;
			}

			if (!initialResyncRequested && logic.networkSeq === startNetworkSeq) {
				initialResyncRequested = true;
				untrack(() => void logic.resyncFromServer());
				return current;
			}

			if (retryIndex < delays.length) {
				startScrollWatch();
				scheduleNextRetry();
				return setStatus('waiting');
			}

			// Лимит попыток исчерпан, но `done` оставляем false: если коммент приедет позже по WebSocket, поймаем его
			clearTimeout(retryTimer);
			retryTimer = undefined;
			startScrollWatch();
			return setStatus('not-found');
		},

		checkNow,
		retry,
		jump,
		dismiss,
		destroy
	};
}
