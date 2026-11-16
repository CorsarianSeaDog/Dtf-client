import type { Comment } from '$lib/api/types';

/*
 * Кэш комментариев в памяти.
 * Комментарии, загруженные для открытых постов, сохраняются здесь.
 * При возврате к посту из глубины стека оверлеев комментарии восстанавливаются мгновенно (0 мс),
 * без ожидания сети и без потери состояния.
 */

const MAX_POSTS_COMMENTS = 20;

export interface CachedComments {
	flatComments: Comment[];
	cursor?: Record<string, { lastId: number; lastSortingValue: number }>;
	hasMore: boolean;
	time: number;
}

export interface CommentsViewState {
	sorting: string;
	collapsed: string[];
	heights: Array<[string, number]>;
	time: number;
}

const cache = new Map<string, CachedComments>();
const viewStateCache = new Map<string, CommentsViewState>();

export function commentsCacheKey(postId: number, sourceId: string = 'dtf', sorting: string = 'hotness'): string {
	return `${sourceId}:${postId}:${sorting}`;
}

export function commentsViewStateKey(postId: number, sourceId: string = 'dtf'): string {
	return `${sourceId}:${postId}`;
}

/** Сохранить список комментариев поста в памяти */
export function cacheComments(
	postId: number,
	sourceId: string = 'dtf',
	sorting: string = 'hotness',
	data: { flatComments: Comment[]; cursor?: Record<string, { lastId: number; lastSortingValue: number }>; hasMore: boolean }
): void {
	if (!postId) return;
	const key = commentsCacheKey(postId, sourceId, sorting);
	cache.delete(key);
	cache.set(key, { ...data, time: Date.now() });
	if (cache.size > MAX_POSTS_COMMENTS) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
}

/** Получить комментарии поста синхронно из памяти */
export function peekComments(postId: number, sourceId: string = 'dtf', sorting: string = 'hotness'): CachedComments | undefined {
	return cache.get(commentsCacheKey(postId, sourceId, sorting));
}

/** Сохранить состояние просмотра комментариев поста в памяти */
export function saveCommentsViewState(
	postId: number,
	sourceId: string = 'dtf',
	state: Omit<CommentsViewState, 'time'>
): void {
	if (!postId) return;
	const key = commentsViewStateKey(postId, sourceId);
	viewStateCache.delete(key);
	viewStateCache.set(key, {
		sorting: state.sorting,
		collapsed: [...state.collapsed],
		heights: state.heights.map(([id, h]) => [id, h]),
		time: Date.now()
	});
	if (viewStateCache.size > MAX_POSTS_COMMENTS) {
		const oldest = viewStateCache.keys().next().value;
		if (oldest !== undefined) viewStateCache.delete(oldest);
	}
}

/** Получить сохранённое состояние просмотра комментариев поста */
export function getCommentsViewState(postId: number, sourceId: string = 'dtf'): CommentsViewState | undefined {
	return viewStateCache.get(commentsViewStateKey(postId, sourceId));
}

/** Очистить кэш комментариев (для тестов) */
export function clearCommentsCache(): void {
	cache.clear();
	viewStateCache.clear();
}
