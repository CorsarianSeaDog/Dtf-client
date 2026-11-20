import { untrack } from 'svelte';
import { api } from '$lib/api/index.svelte';
import { currentUser } from '$lib/api/currentUser.svelte';
import type {
	Comment,
	CommentTreeItem,
	CommentUpdate,
	Reactions,
	RealtimeCommentDonationEvent,
	RealtimeCommentEvent,
	RealtimeCommentVotedEvent
} from '$lib/api/types';
import { cacheComments, peekComments } from '$lib/commentsCache';
import { applyRealtimeVote } from '$lib/reactions';
import { buildTree, formatDate } from './commentUtils';
import { PanoramaEngine } from './panoramaEngine.svelte';

/** Задержка досинхронизации: REST отстаёт от сокета на 0.3–1.5 с и до этого отдаёт старые счётчики */
const RESYNC_DELAY_MS = 2000;

/** takeViewer: своя реакция берётся из входящих (свой комментарий или авторизованный REST), иначе из текущего состояния */
function mergeCommentReactions(existing: Reactions | undefined, incoming: Reactions | undefined, takeViewer?: boolean): Reactions | undefined {
	if (takeViewer) return incoming ?? existing;
	if (!incoming) return existing;
	return { counters: incoming.counters, reactionId: existing?.reactionId ?? 0 };
}

function hasCommentBodyChanged(a: Comment, b: Comment): boolean {
	if ((a.content ?? '') !== (b.content ?? '')) return true;
	if (Boolean(a.isRemoved) !== Boolean(b.isRemoved)) return true;
	return JSON.stringify(a.media ?? []) !== JSON.stringify(b.media ?? []);
}

const sameValue = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

function stripTreeFields(patch: Partial<CommentTreeItem>): Partial<Comment> {
	const { children: _children, parentKey: _parentKey, _totalReplies: _total, _formattedDate: _date, ...rest } = patch;
	return rest;
}

export class CommentsLogic {
	getPostId: () => number;
	getSourceId: () => string;
	get postId() { return this.getPostId(); }
	get sourceId() { return this.getSourceId(); }

	comments = $state.raw<CommentTreeItem[]>([]);
	flatComments = $state.raw<Comment[]>([]);
	allCommentsMap = $state.raw(new Map<string, CommentTreeItem>());
	loading = $state(false);
	resyncing = $state(false);
	/** Растёт после каждого свежего сетевого ответа первой страницы (не при чтении кэша и не при догрузке хвоста) */
	networkSeq = $state(0);
	error = $state<string | null>(null);

	sorting = $state('hotness');
	cursor = $state<Record<string, { lastId: number; lastSortingValue: number }> | undefined>();
	hasMore = $state(true);

	observerElement = $state<HTMLElement | undefined>();
	viewportElement = $state<HTMLElement | undefined>();

	engine = new PanoramaEngine();

	// Preview state
	previewVisible = $state(false);
	previewComment = $state<CommentTreeItem | null>(null);
	previewX = $state(0);
	previewY = $state(0);

	maxVisualDepth = $state(6);

	/** Точечное обновление одной строки в теме без пересборки всего списка */
	onRowPatched?: (key: string, next: CommentTreeItem) => void;
	onBeforeExternalInsert?: () => void;
	onAfterExternalInsert?: () => void;
	onCommentCountChange?: (delta: number) => void;
	onReconnect?: () => void;

	private loadSeq = 0;
	private knownCommentKeys = new Set<string>();
	private replacedKeyMap = new Map<string, string>();
	private orphanReplies = new Map<number, Comment[]>();
	private pendingEvents: RealtimeCommentEvent[] = [];
	private resyncTimer: ReturnType<typeof setTimeout> | undefined;
	private resyncQueued = false;
	private resyncStartedAt = 0;
	/** Когда по комментарию пришёл голос из сокета: REST его ещё не догнал, и досинхронизация такие счётчики не трогает */
	private votedAt = new Map<string, number>();

	constructor(getPostId: () => number, getSourceId: () => string = () => 'dtf') {
		this.getPostId = getPostId;
		this.getSourceId = getSourceId;

		$effect(() => {
			// Отслеживаем изменение postId и sourceId; сначала подписка, потом загрузка: иначе connectRealtime сбросил бы досинхронизацию после кэша
			void this.postId;
			void this.sourceId;
			return untrack(() => {
				const stop = this.connectRealtime();
				this.loadComments(true);
				return stop;
			});
		});

		$effect(() => {
			const mq = window.matchMedia('(max-width: 768px)');
			this.maxVisualDepth = mq.matches ? 3 : 6;

			const mqListener = (e: MediaQueryListEvent) => {
				this.maxVisualDepth = e.matches ? 3 : 6;
			};
			mq.addEventListener('change', mqListener);
			return () => mq.removeEventListener('change', mqListener);
		});

		$effect(() => {
			if (this.viewportElement) {
				this.engine.mount(this.viewportElement);
				return () => {
					this.engine.destroy();
				};
			}
		});

		$effect(() => {
			if (this.observerElement) {
				const observer = new IntersectionObserver(
					(entries) => {
						if (entries[0].isIntersecting) {
							this.loadComments();
						}
					},
					{ rootMargin: '200px' }
				);
				observer.observe(this.observerElement);
				return () => observer.disconnect();
			}
		});
	}

	showPreview = (comment: CommentTreeItem, x: number, y: number) => {
		this.previewComment = comment;
		this.previewX = x;
		this.previewY = y;
		this.previewVisible = true;
	};

	hidePreview = () => {
		this.previewVisible = false;
	};

	/** Подключает realtime-поток комментариев; возвращает функцию отписки */
	connectRealtime(): () => void {
		const postId = this.postId;
		const sourceId = this.sourceId;

		let active = true;
		const unsubComments = api.subscribeComments(
			postId,
			sourceId,
			(event) => {
				if (!active || this.postId !== postId || this.sourceId !== sourceId) return;
				this.handleRealtimeEvent(event);
			},
			{
				onReady: ({ reconnected }) => {
					if (!active || this.postId !== postId || this.sourceId !== sourceId) return;
					if (reconnected) {
						this.scheduleResync();
						this.onReconnect?.();
					}
				}
			}
		);

		return () => {
			active = false;
			this.clearResyncTimer();
			this.resyncQueued = false;
			unsubComments?.();
		};
	}

	/** Путь от корня до комментария: сперва O(depth) вверх по allCommentsMap, затем запасной DFS */
	pathTo(key: string, nodes: CommentTreeItem[] = this.comments, path: CommentTreeItem[] = []): CommentTreeItem[] | undefined {
		if (nodes === this.comments && path.length === 0) {
			const node = this.allCommentsMap.get(key);
			if (node) {
				const fastPath: CommentTreeItem[] = [];
				let cur: CommentTreeItem | undefined = node;
				let broken = false;
				const visited = new Set<CommentTreeItem>();
				while (cur && !visited.has(cur)) {
					visited.add(cur);
					fastPath.push(cur);
					const parentKey = cur.parentKey ?? (cur.replyTo ? `${cur.sourceId}_${cur.replyTo}` : undefined);
					if (!parentKey) break;
					const resolvedParent = this.allCommentsMap.has(parentKey)
						? parentKey
						: (this.replacedKeyMap.get(parentKey) ?? parentKey);
					cur = this.allCommentsMap.get(resolvedParent);
					if (!cur) {
						broken = true;
						break;
					}
				}
				if (!broken && fastPath.length > 0) {
					fastPath.reverse();
					if (this.comments.includes(fastPath[0])) {
						return fastPath;
					}
				}
			}
		}

		for (const node of nodes) {
			const next = [...path, node];
			if (`${node.sourceId}_${node.id}` === key) return next;
			const found = this.pathTo(key, node.children, next);
			if (found) return found;
		}
	}

	/**
	 * Заменяет узел в $state.raw-дереве и карте, синхронизирует flatComments и кэш,
	 * не пересобирая плоский список на 1000+ комментариях.
	 */
	patchComment(key: string, update: Partial<CommentTreeItem> | CommentUpdate): CommentTreeItem | undefined {
		const path = this.pathTo(key);
		if (!path) return;
		const idx = path.length - 1;
		const patch = typeof update === 'function' ? update(path[idx]) : update;
		const next: CommentTreeItem = { ...path[idx], ...patch };
		const siblings = idx === 0 ? this.comments : path[idx - 1].children;
		const pos = siblings.indexOf(path[idx]);
		if (pos !== -1) siblings[pos] = next;
		this.allCommentsMap.set(key, next);

		const flatPatch = stripTreeFields(patch);
		if (Object.keys(flatPatch).length > 0) {
			const flatIdx = this.flatComments.findIndex((c) => `${c.sourceId}_${c.id}` === key);
			if (flatIdx !== -1) {
				const updated = [...this.flatComments];
				updated[flatIdx] = { ...updated[flatIdx], ...flatPatch };
				this.flatComments = updated;
			}
		}

		cacheComments(this.postId, this.sourceId, this.sorting, {
			flatComments: this.flatComments,
			cursor: this.cursor,
			hasMore: this.hasMore
		});

		return next;
	}

	/**
	 * Идемпотентная вставка или версионное обновление комментария (свои, события сокета и досинхронизация через общий путь).
	 * own — свой комментарий, authoritative — снимок REST (не меняет счётчик поста и не просит досинхронизацию).
	 */
	upsertComment(
		comment: Comment,
		options?: { own?: boolean; authoritative?: boolean; silentAnchor?: boolean }
	): CommentTreeItem | undefined {
		const rawKey = `${comment.sourceId}_${comment.id}`;
		const targetKey = this.allCommentsMap.has(rawKey) ? rawKey : (this.replacedKeyMap.get(rawKey) ?? rawKey);
		const existing = this.allCommentsMap.get(targetKey);

		if (existing) {
			// Входящая версия старше текущей: игнорируем
			if (
				typeof existing.lastModificationDate === 'number' &&
				typeof comment.lastModificationDate === 'number' &&
				comment.lastModificationDate < existing.lastModificationDate
			) {
				return existing;
			}

			const isExternalReplaced = Boolean((existing.isReplaced || existing.sourceId !== 'dtf') && comment.sourceId === 'dtf');
			const preserveRestored = Boolean(existing.restored && (comment.isRemoved || !comment.content));
			const staleSnapshot = options?.authoritative && (this.votedAt.get(targetKey) ?? 0) > this.resyncStartedAt - RESYNC_DELAY_MS;
			const reactions = staleSnapshot
				? existing.reactions
				: mergeCommentReactions(existing.reactions, comment.reactions, options?.own || options?.authoritative);

			let patch: Partial<CommentTreeItem>;
			if (isExternalReplaced) {
				patch = {
					lastModificationDate: comment.lastModificationDate ?? existing.lastModificationDate,
					reactions,
					likes: comment.likes ?? existing.likes
				};
			} else {
				patch = {
					content: comment.content,
					media: comment.media,
					author: comment.author,
					lastModificationDate: comment.lastModificationDate ?? existing.lastModificationDate,
					isRemoved: comment.isRemoved ?? existing.isRemoved,
					removedByModerator: comment.removedByModerator ?? existing.removedByModerator,
					isPinned: comment.isPinned ?? existing.isPinned,
					isHiddenByBan: comment.isHiddenByBan ?? existing.isHiddenByBan,
					isIgnored: comment.isIgnored ?? existing.isIgnored,
					isFavorited: comment.isFavorited ?? existing.isFavorited,
					isRedtf: comment.isRedtf ?? existing.isRedtf,
					deviceSource: comment.deviceSource ?? existing.deviceSource,
					restored: preserveRestored ? existing.restored : (comment.restored ?? existing.restored),
					reactions,
					likes: comment.likes ?? existing.likes
				};
			}

			// Ничего не изменилось (типичный случай досинхронизации): ни патча, ни записи в кэш, ни перерисовки строки
			const changed = Object.entries(patch).some(([k, v]) => !sameValue(existing[k as keyof Comment], v));
			let result: CommentTreeItem | undefined = existing;
			if (changed) {
				result = this.patchComment(targetKey, patch);
				if (result && this.onRowPatched) {
					this.onRowPatched(targetKey, result);
				} else {
					this.comments = [...this.comments];
				}
			}
			this.drainOrphans(comment.id, options);
			return result;
		}

		const parentPath = this.resolveParentPath(comment);
		if (comment.replyTo && !parentPath && !options?.own) {
			const list = this.orphanReplies.get(comment.replyTo) ?? [];
			const idx = list.findIndex((c) => c.sourceId === comment.sourceId && c.id === comment.id);
			if (idx >= 0) list[idx] = comment;
			else list.push(comment);
			this.orphanReplies.set(comment.replyTo, list);

			if (!this.knownCommentKeys.has(rawKey)) {
				this.knownCommentKeys.add(rawKey);
				if (!options?.authoritative) this.onCommentCountChange?.(1);
			}
			// Родитель мог прийти раньше нас; если страниц больше нет, добираем его с сервера
			if (!this.hasMore && !options?.authoritative) this.scheduleResync();
			return undefined;
		}

		const shouldAnchor = !options?.own && !options?.silentAnchor;
		if (shouldAnchor) this.onBeforeExternalInsert?.();

		const wasKnown = this.knownCommentKeys.has(rawKey) || this.knownCommentKeys.has(targetKey);
		this.knownCommentKeys.add(rawKey);
		if (comment.isReplaced && comment.originalSourceId) {
			const origKey = `${comment.originalSourceId}_${comment.id}`;
			this.replacedKeyMap.set(origKey, rawKey);
			this.knownCommentKeys.add(origKey);
		}

		const parent = parentPath?.[parentPath.length - 1];
		const item: CommentTreeItem = {
			...comment,
			children: [],
			parentKey: parent ? `${parent.sourceId}_${parent.id}` : undefined,
			_formattedDate: formatDate(comment.createdAt),
			_totalReplies: 0
		};

		this.flatComments = [...this.flatComments, comment];
		this.allCommentsMap.set(rawKey, item);

		if (!parentPath) {
			if (this.sorting === 'date') {
				let insertAt = 0;
				while (insertAt < this.comments.length && this.comments[insertAt].isPinned) insertAt++;
				this.comments = [
					...this.comments.slice(0, insertAt),
					item,
					...this.comments.slice(insertAt)
				];
			} else {
				this.comments = [...this.comments, item];
			}
		} else {
			let childNode = item;
			for (let i = parentPath.length - 1; i >= 0; i--) {
				const oldNode = parentPath[i];
				const nextNode: CommentTreeItem = {
					...oldNode,
					_totalReplies: (oldNode._totalReplies ?? 0) + 1,
					children:
						i === parentPath.length - 1
							? [...oldNode.children, childNode]
							: oldNode.children.map((c) => (c === parentPath[i + 1] ? childNode : c))
				};
				this.allCommentsMap.set(`${nextNode.sourceId}_${nextNode.id}`, nextNode);
				if (i === 0) {
					this.comments = this.comments.map((r) => (r === oldNode ? nextNode : r));
				}
				childNode = nextNode;
			}
		}

		this.drainOrphans(comment.id, options);

		if (!wasKnown && !options?.authoritative) this.onCommentCountChange?.(1);

		cacheComments(this.postId, this.sourceId, this.sorting, {
			flatComments: this.flatComments,
			cursor: this.cursor,
			hasMore: this.hasMore
		});

		if (shouldAnchor) this.onAfterExternalInsert?.();

		return this.allCommentsMap.get(rawKey) ?? item;
	}

	/** Вставляет только что отправленный комментарий в дерево без полной пересборки */
	addComment(comment: Comment) {
		return this.upsertComment(comment, { own: true });
	}

	/** Текст комментария после правки */
	updateComment(comment: Comment) {
		return this.upsertComment(comment, { own: true });
	}

	/** Ключ комментария в дереве по id (с учётом подмены внешним источником); реактивно следит за деревом */
	resolveCommentKey(commentId: number): string | undefined {
		void this.comments;
		const rawKey = `${this.sourceId}_${commentId}`;
		return this.allCommentsMap.has(rawKey) ? rawKey : this.replacedKeyMap.get(rawKey);
	}

	/** Применяет событие `comment voted` из realtime к одному узлу дерева */
	applyVoteEvent(event: RealtimeCommentVotedEvent) {
		const targetKey = this.resolveCommentKey(event.commentId);
		const target = targetKey && this.allCommentsMap.get(targetKey);
		if (!targetKey || !target) return;

		const viewerId = untrack(() => currentUser.value?.id);
		const reactions = applyRealtimeVote(target.reactions, event, viewerId);
		this.votedAt.set(targetKey, Date.now());
		const next = this.patchComment(targetKey, { reactions });
		if (next) this.onRowPatched?.(targetKey, next);
	}

	/** Применяет событие `change_donation_amount_for_comment`: сумма донатов комментария */
	applyDonationEvent(event: RealtimeCommentDonationEvent) {
		const targetKey = this.resolveCommentKey(event.commentId);
		const target = targetKey && this.allCommentsMap.get(targetKey);
		if (!targetKey || !target || (target.donation ?? 0) === event.amount) return;

		const next = this.patchComment(targetKey, { donation: event.amount || undefined });
		if (next) this.onRowPatched?.(targetKey, next);
	}

	handleRealtimeEvent(event: RealtimeCommentEvent) {
		if (event.postId !== this.postId) return;
		if (this.loading) {
			this.pendingEvents.push(event);
			return;
		}
		this.processRealtimeEvent(event);
	}

	async loadComments(reset = false, options?: { bypassCache?: boolean }) {
		if (!reset && (this.loading || !this.hasMore)) return;

		const seq = ++this.loadSeq;

		if (reset) {
			this.clearResyncTimer();
			this.resyncQueued = false;
			this.orphanReplies.clear();
			this.votedAt.clear();
			this.pendingEvents = [];

			const cached = !options?.bypassCache ? peekComments(this.postId, this.sourceId, this.sorting) : undefined;
			if (cached) {
				this.cursor = cached.cursor;
				this.flatComments = [...cached.flatComments];
				const tree = buildTree(this.flatComments, this.sourceId, this.sorting);
				this.comments = tree.roots;
				this.allCommentsMap = tree.map;
				this.hasMore = cached.hasMore;
				this.loading = false;
				this.error = null;
				this.knownCommentKeys.clear();
				this.syncKeyIndexesFromFlat();
				// После мгновенного показа кэша фоново добираем новые комментарии и правки
				this.scheduleResync(0);
				return;
			}

			this.cursor = undefined;
			this.flatComments = [];
			this.comments = [];
			this.allCommentsMap = new Map<string, CommentTreeItem>();
			this.knownCommentKeys.clear();
			this.replacedKeyMap.clear();
		}

		this.loading = true;
		this.error = null;
		const isFirstPage = reset || !this.cursor;

		try {
			const postId = this.postId;
			const sourceId = this.sourceId;
			const sorting = this.sorting;
			const result = await api.getComments(postId, sourceId, this.cursor, sorting);
			if (seq !== this.loadSeq) return;

			this.flatComments = this.mergeFlatComments(this.flatComments, result.items);
			const tree = buildTree(this.flatComments, this.sourceId, this.sorting);
			this.comments = tree.roots;
			this.allCommentsMap = tree.map;
			this.syncKeyIndexesFromFlat();

			if (result.cursors && Object.keys(result.cursors).length > 0) {
				this.cursor = result.cursors;
				this.hasMore = true;
			} else {
				this.hasMore = false;
			}

			cacheComments(this.postId, this.sourceId, this.sorting, {
				flatComments: this.flatComments,
				cursor: this.cursor,
				hasMore: this.hasMore
			});
			if (isFirstPage) this.networkSeq++;

			// События, пришедшие во время загрузки снимка, применяются поверх готового дерева
			if (this.pendingEvents.length > 0) {
				const buffered = this.pendingEvents.splice(0);
				for (const ev of buffered) {
					this.processRealtimeEvent(ev);
				}
			}
		} catch (e) {
			if (seq === this.loadSeq) {
				this.error = (e as Error).message;
			}
		} finally {
			if (seq === this.loadSeq) {
				this.loading = false;
				// Досинхронизация, запрошенная во время загрузки, не должна пропасть
				if (this.resyncQueued) {
					this.resyncQueued = false;
					this.scheduleResync();
				}
			}
		}
	}

	/** Обновить комментарии: при ошибке или пустом списке загружает заново без кэша, иначе досинхронизирует */
	async refresh(): Promise<void> {
		if (this.error || this.comments.length === 0) {
			await this.loadComments(true, { bypassCache: true });
			return;
		}
		await this.resyncFromServer();
	}

	scheduleResync(delayMs = RESYNC_DELAY_MS) {
		if (this.resyncing) {
			this.resyncQueued = true;
			return;
		}
		if (this.resyncTimer !== undefined) return;
		const seq = this.loadSeq;
		this.resyncTimer = setTimeout(() => {
			this.resyncTimer = undefined;
			if (seq !== this.loadSeq) return;
			void this.resyncFromServer();
		}, delayMs);
	}

	async resyncFromServer(): Promise<void> {
		if (this.loading || this.resyncing) {
			this.resyncQueued = true;
			return;
		}

		this.clearResyncTimer();
		const seq = this.loadSeq;
		const postId = this.postId;
		const sourceId = this.sourceId;
		const sorting = this.sorting;
		this.resyncing = true;
		this.resyncStartedAt = Date.now();

		try {
			const result = await api.getComments(postId, sourceId, undefined, sorting);
			if (seq !== this.loadSeq || this.postId !== postId || this.sourceId !== sourceId || this.sorting !== sorting) {
				return;
			}
			const hadAnyChange = result.items.some((item) => {
				const rawKey = `${item.sourceId}_${item.id}`;
				const targetKey = this.allCommentsMap.has(rawKey) ? rawKey : (this.replacedKeyMap.get(rawKey) ?? rawKey);
				const existing = this.allCommentsMap.get(targetKey);
				if (!existing) return true;
				const isExternalReplaced = Boolean((existing.isReplaced || existing.sourceId !== 'dtf') && item.sourceId === 'dtf');
				const preserveRestored = Boolean(existing.restored && (item.isRemoved || !item.content));
				return !isExternalReplaced && !preserveRestored && hasCommentBodyChanged(existing, item);
			});
			if (hadAnyChange) this.onBeforeExternalInsert?.();
			for (const item of result.items) {
				this.upsertComment(item, { silentAnchor: true, authoritative: true });
			}
			if (hadAnyChange) this.onAfterExternalInsert?.();

			if (!this.cursor && result.cursors && Object.keys(result.cursors).length > 0) {
				this.cursor = result.cursors;
				this.hasMore = true;
			}
			cacheComments(this.postId, this.sourceId, this.sorting, {
				flatComments: this.flatComments,
				cursor: this.cursor,
				hasMore: this.hasMore
			});
			this.networkSeq++;
		} catch {
			// Фоновый добор не сбрасывает уже показанные комментарии
		} finally {
			this.resyncing = false;
			// Следующая досинхронизация начнётся не раньше задержки: к ней REST уже догонит эти голоса
			this.votedAt.clear();
			if (this.resyncQueued && seq === this.loadSeq) {
				this.resyncQueued = false;
				this.scheduleResync();
			}
		}
	}

	onSortingChange = (event: Event) => {
		this.sorting = (event.target as HTMLSelectElement).value;
		this.loadComments(true);
	};

	private processRealtimeEvent(event: RealtimeCommentEvent) {
		if (event.type === 'comment_voted') {
			this.applyVoteEvent(event);
		} else if (event.type === 'change_donation_amount_for_comment') {
			this.applyDonationEvent(event);
		} else {
			this.upsertComment(event.comment);
		}
	}

	private resolveParentPath(comment: Comment): CommentTreeItem[] | undefined {
		if (!comment.replyTo) return undefined;
		let parentKey = `${comment.sourceId}_${comment.replyTo}`;
		if (!this.allCommentsMap.has(parentKey)) {
			parentKey = `${this.sourceId}_${comment.replyTo}`;
		}
		if (!this.allCommentsMap.has(parentKey)) {
			parentKey = this.replacedKeyMap.get(parentKey) ?? parentKey;
		}
		return this.allCommentsMap.has(parentKey) ? this.pathTo(parentKey) : undefined;
	}

	private drainOrphans(parentId: number, options?: { own?: boolean; authoritative?: boolean }) {
		const waiting = this.orphanReplies.get(parentId);
		if (!waiting?.length) return;
		this.orphanReplies.delete(parentId);
		for (const orphan of waiting) {
			this.upsertComment(orphan, {
				own: options?.own,
				authoritative: options?.authoritative,
				silentAnchor: true
			});
		}
	}

	private syncKeyIndexesFromFlat() {
		this.replacedKeyMap.clear();
		for (const c of this.flatComments) {
			const actualKey = `${c.sourceId}_${c.id}`;
			this.knownCommentKeys.add(actualKey);
			if (c.isReplaced && c.originalSourceId) {
				const origKey = `${c.originalSourceId}_${c.id}`;
				this.replacedKeyMap.set(origKey, actualKey);
				this.knownCommentKeys.add(origKey);
			}
		}
	}

	private mergeFlatComments(existing: Comment[], incoming: Comment[]): Comment[] {
		if (existing.length === 0) return [...incoming];
		const byKey = new Map<string, number>();
		const merged = [...existing];
		for (let i = 0; i < merged.length; i++) {
			byKey.set(`${merged[i].sourceId}_${merged[i].id}`, i);
		}
		for (const item of incoming) {
			const key = `${item.sourceId}_${item.id}`;
			const idx = byKey.get(key);
			if (idx === undefined) {
				byKey.set(key, merged.length);
				merged.push(item);
			} else {
				const prev = merged[idx];
				if (
					typeof prev.lastModificationDate === 'number' &&
					typeof item.lastModificationDate === 'number' &&
					item.lastModificationDate < prev.lastModificationDate
				) {
					continue;
				}
				merged[idx] = {
					...item,
					isFavorited: item.isFavorited ?? prev.isFavorited,
					isRedtf: item.isRedtf ?? prev.isRedtf,
					restored: prev.restored && (item.isRemoved || !item.content) ? prev.restored : (item.restored ?? prev.restored)
				};
			}
		}
		return merged;
	}

	private clearResyncTimer() {
		if (this.resyncTimer !== undefined) {
			clearTimeout(this.resyncTimer);
			this.resyncTimer = undefined;
		}
	}
}
