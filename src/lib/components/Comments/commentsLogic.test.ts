import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment, RealtimeCommentEvent, RealtimeSubscriptionOptions } from '$lib/api/types';

const { getComments, subscribeComments, cacheComments, peekComments, viewerState } = vi.hoisted(() => ({
	getComments: vi.fn(),
	subscribeComments: vi.fn(),
	cacheComments: vi.fn(),
	peekComments: vi.fn(
		(): {
			flatComments: Comment[];
			cursor: Record<string, { lastId: number; lastSortingValue: number }> | undefined;
			hasMore: boolean;
		} | null => null
	),
	viewerState: { id: 999 }
}));

vi.mock('$lib/api/index.svelte', () => ({ api: { getComments, subscribeComments } }));
vi.mock('$lib/api/currentUser.svelte', () => ({
	currentUser: {
		get value() {
			return viewerState.id ? { id: viewerState.id } : null;
		}
	}
}));
vi.mock('$lib/commentsCache', () => ({
	cacheComments,
	peekComments
}));

import { CommentsLogic } from './commentsLogic.svelte';
import { applyReaction, rollbackOptimisticReaction } from '$lib/reactions';

const makeComment = (id: number, overrides: Partial<Comment> = {}): Comment => ({
	id,
	sourceId: 'dtf',
	postId: 100,
	author: { id: id * 10, name: `User ${id}` },
	content: `text ${id}`,
	createdAt: '2026-01-01T00:00:00.000Z',
	...overrides
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('CommentsLogic ($state.raw)', () => {
	let logic: CommentsLogic;

	beforeEach(async () => {
		viewerState.id = 999;
		getComments.mockReset().mockResolvedValue({
			items: [makeComment(1), makeComment(2, { replyTo: 1 })],
			cursors: undefined
		});
		subscribeComments.mockReset();
		cacheComments.mockReset();
		peekComments.mockReset().mockReturnValue(null);

		logic = new CommentsLogic(() => 100);
		await logic.loadComments();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('patchComment заменяет узел в дереве, карте, flatComments и кэше без пересборки списка', () => {
		const prevRoots = logic.comments;
		const prevNode = logic.comments[0].children[0];

		const returned = logic.patchComment('dtf_2', { isFavorited: true });

		expect(logic.comments).toBe(prevRoots);
		const nextNode = logic.comments[0].children[0];
		expect(nextNode).not.toBe(prevNode);
		expect(nextNode).toBe(returned);
		expect(nextNode.isFavorited).toBe(true);
		expect(logic.allCommentsMap.get('dtf_2')).toBe(nextNode);
		expect(logic.flatComments.find((c) => c.id === 2)?.isFavorited).toBe(true);
		expect(cacheComments).toHaveBeenCalled();
	});

	it('addComment добавляет корень и ответ с обновлением родителя', () => {
		const prevParent = logic.comments[0];

		logic.addComment(makeComment(3));
		expect(logic.comments).toHaveLength(2);
		expect(logic.allCommentsMap.has('dtf_3')).toBe(true);

		logic.addComment(makeComment(4, { replyTo: 1 }));
		const nextParent = logic.comments[0];
		expect(nextParent).not.toBe(prevParent);
		expect(nextParent.children.map((c) => c.id)).toEqual([2, 4]);
		expect(nextParent._totalReplies).toBe(2);
	});

	it('updateComment обновляет flatComments и пересоздаёт узел в дереве', () => {
		const prevNode = logic.comments[0];
		logic.updateComment(makeComment(1, { content: 'edited' }));

		expect(logic.flatComments.find((c) => c.id === 1)?.content).toBe('edited');
		expect(logic.comments[0]).not.toBe(prevNode);
		expect(logic.comments[0].content).toBe('edited');
	});

	it('дедуплицирует свой addComment и WS comment_created в любом порядке без двойного подсчёта', () => {
		const deltas: number[] = [];
		logic.onCommentCountChange = (d) => deltas.push(d);

		// 1. Сначала addComment, затем WS-эхо comment_created
		logic.addComment(
			makeComment(10, {
				isRedtf: true,
				reactions: { counters: [{ id: 1, count: 1 }], reactionId: 1 }
			})
		);
		logic.handleRealtimeEvent({
			type: 'comment_created',
			postId: 100,
			comment: makeComment(10, {
				lastModificationDate: 50,
				reactions: { counters: [{ id: 1, count: 1 }], reactionId: 0 }
			})
		});

		expect(logic.comments.filter((c) => c.id === 10)).toHaveLength(1);
		expect(logic.allCommentsMap.get('dtf_10')?.reactions?.reactionId).toBe(1);
		expect(logic.allCommentsMap.get('dtf_10')?.isRedtf).toBe(true);

		// 2. Сначала WS comment_created, затем запоздавший HTTP addComment
		logic.handleRealtimeEvent({
			type: 'comment_created',
			postId: 100,
			comment: makeComment(11, { lastModificationDate: 60 })
		});
		logic.addComment(makeComment(11, { content: 'from http', lastModificationDate: 70 }));

		expect(logic.comments.filter((c) => c.id === 11)).toHaveLength(1);
		expect(logic.allCommentsMap.get('dtf_11')?.content).toBe('from http');
		expect(deltas).toEqual([1, 1]);
	});

	it('учитывает lastModificationDate при правках и сохраняет закладки, реакции и дочернюю ветку', () => {
		logic.patchComment('dtf_1', {
			isFavorited: true,
			lastModificationDate: 200,
			reactions: { counters: [{ id: 5, count: 2 }], reactionId: 5 }
		});
		const patchedRows: string[] = [];
		logic.onRowPatched = (key) => patchedRows.push(key);

		// Устаревшее редактирование отклоняется
		logic.handleRealtimeEvent({
			type: 'comment_edited',
			postId: 100,
			comment: makeComment(1, { content: 'stale edit', lastModificationDate: 100 })
		});
		expect(logic.allCommentsMap.get('dtf_1')?.content).toBe('text 1');

		// Актуальное редактирование применяется, сохраняя children, isFavorited и свой reactionId
		logic.handleRealtimeEvent({
			type: 'comment_edited',
			postId: 100,
			comment: makeComment(1, {
				content: 'fresh edit',
				lastModificationDate: 300,
				reactions: { counters: [{ id: 5, count: 3 }], reactionId: 0 }
			})
		});
		const updated = logic.allCommentsMap.get('dtf_1')!;
		expect(updated.content).toBe('fresh edit');
		expect(updated.isFavorited).toBe(true);
		expect(updated.children).toHaveLength(1);
		expect(updated.reactions).toEqual({ counters: [{ id: 5, count: 3 }], reactionId: 5 });
		expect(patchedRows).toEqual(['dtf_1']);
	});

	it('«Первые» сортирует по времени корни и ответы, включая догрузку и восстановление кэша', async () => {
		const early = makeComment(10, { createdAt: '2026-11-17T10:30:00.000Z' });
		const late = makeComment(20, { createdAt: '2026-11-17T11:41:00.000Z' });
		const pinned = makeComment(30, { createdAt: '2026-11-17T12:00:00.000Z', isPinned: true });
		const earlyReply = makeComment(11, { replyTo: 10, createdAt: '2026-11-17T10:31:00.000Z' });
		const lateReply = makeComment(12, { replyTo: 10, createdAt: '2026-11-17T11:42:00.000Z' });
		logic.sorting = 'dateAsc';
		getComments.mockResolvedValueOnce({
			items: [late, pinned],
			cursors: { dtf: { lastId: 20, lastSortingValue: 1 } }
		});
		await logic.loadComments(true);
		getComments.mockResolvedValueOnce({ items: [early, lateReply, earlyReply] });
		await logic.loadComments();
		expect(logic.comments.map((c) => c.id)).toEqual([30, 10, 20]);
		expect(logic.comments[1].children.map((c) => c.id)).toEqual([11, 12]);

		vi.useFakeTimers();
		peekComments.mockReturnValueOnce({ flatComments: [late, early, lateReply, earlyReply, pinned], cursor: undefined, hasMore: false });
		await logic.loadComments(true);
		expect(logic.comments.map((c) => c.id)).toEqual([30, 10, 20]);
		expect(logic.comments[1].children.map((c) => c.id)).toEqual([11, 12]);
		vi.clearAllTimers();
	});

	it('вставляет корневой комментарий наверх после закреплённых при date и вниз при worst/dateAsc', async () => {
		getComments.mockResolvedValueOnce({
			items: [makeComment(1, { isPinned: true }), makeComment(2)],
			cursors: undefined
		});
		logic.sorting = 'date';
		await logic.loadComments(true);

		logic.upsertComment(makeComment(30));
		expect(logic.comments.map((c) => c.id)).toEqual([1, 30, 2]);

		logic.sorting = 'worst';
		logic.upsertComment(makeComment(31));
		expect(logic.comments.map((c) => c.id)).toEqual([1, 30, 2, 31]);
		logic.sorting = 'dateAsc';
		logic.upsertComment(makeComment(32));
		expect(logic.comments.map((c) => c.id)).toEqual([1, 30, 2, 31, 32]);
	});

	it('придерживает orphan-ответ до прихода родителя через досинхронизацию без дубля счётчика', async () => {
		vi.useFakeTimers();
		const deltas: number[] = [];
		logic.onCommentCountChange = (d) => deltas.push(d);

		getComments.mockResolvedValueOnce({
			items: [makeComment(50), makeComment(51, { replyTo: 50 }), makeComment(1), makeComment(2, { replyTo: 1 })],
			cursors: undefined
		});

		logic.handleRealtimeEvent({
			type: 'comment_created',
			postId: 100,
			comment: makeComment(51, { replyTo: 50 })
		});

		// Пока родителя нет, в корень не проваливается и запрашивает resync
		expect(logic.allCommentsMap.has('dtf_51')).toBe(false);
		expect(logic.comments.map((c) => c.id)).toEqual([1]);
		expect(deltas).toEqual([1]);

		// REST отстаёт от сокета, поэтому досинхронизация идёт с задержкой
		await vi.advanceTimersByTimeAsync(350);
		expect(getComments).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2000);
		expect(getComments).toHaveBeenCalledTimes(2);
		expect(logic.allCommentsMap.get('dtf_50')?.children.map((c) => c.id)).toEqual([51]);
		expect(logic.allCommentsMap.has('dtf_51')).toBe(true);
		// #51 учтён один раз, при попадании в orphanReplies; вставка #50 из REST счётчик не меняет
		expect(deltas).toEqual([1]);
	});

	it('защищает комментарии внешних источников (replace/restore) от перезаписи DTF-заглушкой', async () => {
		getComments.mockResolvedValueOnce({
			items: [
				makeComment(20, {
					sourceId: 'archive',
					isReplaced: true,
					originalSourceId: 'dtf',
					content: 'Заменено архивом',
					reactions: { counters: [{ id: 1, count: 2 }], reactionId: 0 }
				}),
				makeComment(30, {
					sourceId: 'dtf',
					isRemoved: true,
					content: '',
					restored: { content: 'Восстановленный текст', sourceId: 'archive' }
				})
			],
			cursors: undefined
		});
		await logic.loadComments(true);

		const countChanges: number[] = [];
		logic.onCommentCountChange = (d) => countChanges.push(d);

		// DTF присылает обновление для комментария, заменённого внешним источником
		logic.handleRealtimeEvent({
			type: 'comment_edited',
			postId: 100,
			comment: makeComment(20, {
				sourceId: 'dtf',
				content: 'Заглушка DTF',
				reactions: { counters: [{ id: 1, count: 5 }], reactionId: 0 },
				lastModificationDate: 500
			})
		});
		expect(logic.allCommentsMap.get('archive_20')?.content).toBe('Заменено архивом');
		expect(logic.allCommentsMap.get('archive_20')?.reactions?.counters).toEqual([{ id: 1, count: 5 }]);
		expect(logic.comments.filter((c) => c.id === 20)).toHaveLength(1);
		expect(countChanges).toEqual([]);

		// DTF присылает удаление поверх restored-комментария — архивный текст сохраняется
		logic.handleRealtimeEvent({
			type: 'comment_edited',
			postId: 100,
			comment: makeComment(30, { isRemoved: true, content: '' })
		});
		expect(logic.allCommentsMap.get('dtf_30')?.restored?.content).toBe('Восстановленный текст');
	});

	it('comment voted применяется к узлу: чужой A -> B, своё эхо не двоит A, откат на живом состоянии сохраняет чужие голоса', () => {
		const vote = (commentId: number, fromReactionId: number, reactionId: number, reactionCount: number, actorId: number) =>
			logic.handleRealtimeEvent({ type: 'comment_voted', postId: 100, commentId, fromReactionId, reactionId, reactionCount, actorId });
		const reactionsOf = (id: number) => logic.allCommentsMap.get(`dtf_${id}`)?.reactions;

		vote(1, 0, 5, 3, 777);
		vote(1, 5, 7, 1, 778);
		expect(reactionsOf(1)).toEqual({ counters: [{ id: 5, count: 2 }, { id: 7, count: 2 }], reactionId: 0 });

		// Свой оптимистичный 5 -> 8 и его эхо: A не вычитается второй раз
		logic.patchComment('dtf_1', { reactions: { counters: [{ id: 5, count: 2 }, { id: 7, count: 2 }], reactionId: 5 } });
		logic.patchComment('dtf_1', (cur) => ({ reactions: applyReaction(cur.reactions, 8) }));
		vote(1, 5, 8, 0, viewerState.id);
		expect(reactionsOf(1)).toEqual({ counters: [{ id: 5, count: 1 }, { id: 7, count: 2 }, { id: 8, count: 1 }], reactionId: 8 });

		// Откат неудавшегося 0 -> 5: пока шёл запрос, чужой поставил 12; функция-патч видит живое состояние
		const patchedKeys: string[] = [];
		logic.onRowPatched = (k) => patchedKeys.push(k);
		logic.patchComment('dtf_2', { reactions: { counters: [{ id: 5, count: 1 }], reactionId: 5 } });
		vote(2, 0, 12, 1, 555);
		logic.patchComment('dtf_2', (cur) => ({ reactions: rollbackOptimisticReaction(cur.reactions, 0, 5) }));
		expect(reactionsOf(2)).toEqual({ counters: [{ id: 12, count: 1 }], reactionId: 0 });
		expect(patchedKeys).toEqual(['dtf_2']);
	});

	it('буферизует события во время loadComments и вызывает onReconnect + resync при переподключении WS', async () => {
		vi.useFakeTimers();
		let capturedOnUpdate: ((ev: RealtimeCommentEvent) => void) | undefined;
		let capturedOptions: RealtimeSubscriptionOptions | undefined;
		const unsubSpy = vi.fn();
		subscribeComments.mockImplementation((_postId, _sourceId, onUpdate, options) => {
			capturedOnUpdate = onUpdate;
			capturedOptions = options;
			return unsubSpy;
		});

		const onReconnect = vi.fn();
		logic.onReconnect = onReconnect;
		const stop = logic.connectRealtime();

		const pendingLoad = deferred<{ items: Comment[]; cursors: undefined }>();
		getComments.mockReturnValueOnce(pendingLoad.promise);
		const loadPromise = logic.loadComments(true);
		expect(logic.loading).toBe(true);

		// Событие пришло во время загрузки снимка
		capturedOnUpdate?.({
			type: 'comment_created',
			postId: 100,
			comment: makeComment(99, { content: 'buffered new' })
		});
		expect(logic.allCommentsMap.has('dtf_99')).toBe(false);

		pendingLoad.resolve({ items: [makeComment(1)], cursors: undefined });
		await loadPromise;
		expect(logic.allCommentsMap.get('dtf_99')?.content).toBe('buffered new');

		// Reconnect WS -> триггерит onReconnect и отложенную досинхронизацию без +1 к счётчику
		const deltas: number[] = [];
		logic.onCommentCountChange = (d) => deltas.push(d);
		getComments.mockResolvedValueOnce({ items: [makeComment(1), makeComment(100)], cursors: undefined });
		capturedOptions?.onReady?.({ reconnected: true });
		expect(onReconnect).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(2100);
		expect(logic.allCommentsMap.has('dtf_100')).toBe(true);
		expect(deltas).toEqual([]);

		stop();
		expect(unsubSpy).toHaveBeenCalledTimes(1);
	});

	it('счётчик поста: живое событие и свой комментарий дают ровно +1, вставка из досинхронизации не меняет его', async () => {
		const deltas: number[] = [];
		logic.onCommentCountChange = (d) => deltas.push(d);
		const created = (id: number) => logic.handleRealtimeEvent({ type: 'comment_created', postId: 100, comment: makeComment(id) });

		getComments.mockResolvedValueOnce({ items: [makeComment(1), makeComment(2, { replyTo: 1 }), makeComment(40)], cursors: undefined });
		await logic.resyncFromServer();
		expect(logic.allCommentsMap.has('dtf_40')).toBe(true);
		expect(deltas).toEqual([]);

		// Событие по уже вставленному из REST комментарию не считается повторно
		created(40);
		expect(deltas).toEqual([]);

		created(41);
		expect(deltas).toEqual([1]);

		// Свой комментарий и его эхо по сокету — один раз
		logic.addComment(makeComment(42));
		created(42);
		expect(deltas).toEqual([1, 1]);
	});

	it('досинхронизация не трогает неизменившийся комментарий и патчит только изменившийся', async () => {
		const patched: string[] = [];
		logic.onRowPatched = (key) => patched.push(key);
		const node = logic.allCommentsMap.get('dtf_1');

		getComments.mockResolvedValueOnce({ items: [makeComment(1), makeComment(2, { replyTo: 1 })], cursors: undefined });
		await logic.resyncFromServer();
		expect(patched).toEqual([]);
		expect(logic.allCommentsMap.get('dtf_1')).toBe(node);

		getComments.mockResolvedValueOnce({
			items: [makeComment(1, { content: 'edited', lastModificationDate: 10 }), makeComment(2, { replyTo: 1 })],
			cursors: undefined
		});
		await logic.resyncFromServer();
		expect(patched).toEqual(['dtf_1']);
		expect(logic.allCommentsMap.get('dtf_1')?.content).toBe('edited');
	});

	it('досинхронизация не откатывает голос, который REST ещё не догнал', async () => {
		logic.handleRealtimeEvent({ type: 'comment_voted', postId: 100, commentId: 1, fromReactionId: 0, reactionId: 4, reactionCount: 1, actorId: 5 });
		const voted = logic.allCommentsMap.get('dtf_1')?.reactions;
		expect(voted?.counters).toEqual([{ id: 4, count: 1 }]);

		// Снимок REST снят до голоса: счётчики остаются из сокета
		getComments.mockResolvedValueOnce({
			items: [makeComment(1, { reactions: { counters: [], reactionId: 0 } }), makeComment(2, { replyTo: 1 })],
			cursors: undefined
		});
		await logic.resyncFromServer();
		expect(logic.allCommentsMap.get('dtf_1')?.reactions).toEqual(voted);

		// К следующей досинхронизации REST уже считается свежим
		getComments.mockResolvedValueOnce({
			items: [makeComment(1, { reactions: { counters: [{ id: 4, count: 3 }], reactionId: 0 } }), makeComment(2, { replyTo: 1 })],
			cursors: undefined
		});
		await logic.resyncFromServer();
		expect(logic.allCommentsMap.get('dtf_1')?.reactions?.counters).toEqual([{ id: 4, count: 3 }]);
	});

	it('досинхронизация, запрошенная во время загрузки, выполняется после её окончания', async () => {
		vi.useFakeTimers();
		const pendingLoad = deferred<{ items: Comment[]; cursors: undefined }>();
		getComments.mockReturnValueOnce(pendingLoad.promise);
		const load = logic.loadComments(true);
		await logic.resyncFromServer();
		expect(getComments).toHaveBeenCalledTimes(2);

		getComments.mockResolvedValueOnce({ items: [makeComment(1), makeComment(60)], cursors: undefined });
		pendingLoad.resolve({ items: [makeComment(1)], cursors: undefined });
		await load;
		await vi.advanceTimersByTimeAsync(2100);
		expect(logic.allCommentsMap.has('dtf_60')).toBe(true);
	});

	it('change_donation_amount_for_comment обновляет донаты узла', () => {
		logic.handleRealtimeEvent({ type: 'change_donation_amount_for_comment', postId: 100, commentId: 1, amount: 250 });
		expect(logic.allCommentsMap.get('dtf_1')?.donation).toBe(250);
	});

	it('после попадания в кэш добирает свежие комментарии в фоне, а bypassCache читает сервер напрямую', async () => {
		vi.useFakeTimers();
		peekComments.mockReturnValueOnce({
			flatComments: [makeComment(1)],
			cursor: undefined,
			hasMore: false
		});
		getComments.mockResolvedValueOnce({
			items: [makeComment(1), makeComment(77)],
			cursors: undefined
		});

		await logic.loadComments(true);
		expect(logic.comments.map((c) => c.id)).toEqual([1]);

		await vi.advanceTimersByTimeAsync(10);
		expect(logic.allCommentsMap.has('dtf_77')).toBe(true);

		// bypassCache игнорирует peekComments
		peekComments.mockReturnValueOnce({
			flatComments: [makeComment(1)],
			cursor: undefined,
			hasMore: false
		});
		getComments.mockResolvedValueOnce({
			items: [makeComment(1), makeComment(88)],
			cursors: undefined
		});
		await logic.loadComments(true, { bypassCache: true });
		expect(logic.allCommentsMap.has('dtf_88')).toBe(true);
	});
});
