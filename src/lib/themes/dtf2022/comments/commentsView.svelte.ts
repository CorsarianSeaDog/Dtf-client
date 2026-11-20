import { onDestroy, tick, untrack } from 'svelte';
import type { CommentTreeItem } from '$lib/api/types';
import { getCommentsViewState, saveCommentsViewState } from '$lib/commentsCache';
import { createCommentFocusController, type CommentFocusController } from '$lib/components/Comments/commentFocus.svelte';
import type { CommentsLogic } from '$lib/components/Comments/commentsLogic.svelte';
import { notify } from '../ui/notify.svelte';
import { commentKey } from './flatten';
import type { VirtualRows } from './virtualRows.svelte';

/** Общая привязка колбэков логики, восстановления вида (сохраняется при уничтожении), фокуса и якоря прокрутки для списка комментариев темы */
export function bindCommentsView(options: {
	logic: CommentsLogic;
	virtual: VirtualRows;
	collapsed: Set<string>;
	getPost: () => { postId: number; sourceId: string };
	getFocus: () => { commentId?: number; nonce?: number; active?: boolean };
	hasRow?: (key: string) => boolean;
	onPatchRow: (key: string, next: CommentTreeItem) => void;
	onFocused?: () => void;
	onReady?: (jump: () => void) => void;
	onCountChange?: (delta: number) => void;
	onReconnect?: () => void;
	onRefreshReady?: (refresh: (() => Promise<void>) | undefined) => void;
}): CommentFocusController {
	const {
		logic,
		virtual,
		collapsed,
		getPost,
		getFocus,
		hasRow,
		onPatchRow,
		onFocused,
		onReady = (jump) => notify.success('Комментарий появился', { label: 'Перейти', onclick: jump }),
		onCountChange,
		onReconnect,
		onRefreshReady
	} = options;
	logic.onRowPatched = onPatchRow;
	logic.onCommentCountChange = (delta) => onCountChange?.(delta);
	logic.onReconnect = () => onReconnect?.();
	onRefreshReady?.(() => logic.refresh());

	const { postId, sourceId } = untrack(getPost);
	const savedView = getCommentsViewState(postId, sourceId);
	if (savedView) {
		logic.sorting = savedView.sorting;
		for (const key of savedView.collapsed) collapsed.add(key);
		virtual.restoreHeights(savedView.heights);
	}

	const focus = createCommentFocusController({
		logic,
		hasRow,
		onFocused,
		onReady,
		reveal: (key) => {
			const path = logic.pathTo(key);
			if (path) {
				for (const item of path) collapsed.delete(commentKey(item));
			}
			void virtual.focus(key);
		}
	});
	$effect(() => {
		const { commentId, nonce, active } = getFocus();
		focus.step(commentId, nonce, active);
	});

	let pendingAnchor: { key: string; top: number } | null = null;
	logic.onBeforeExternalInsert = () => {
		pendingAnchor = virtual.captureAnchor();
	};
	logic.onAfterExternalInsert = () => {
		const anchor = pendingAnchor;
		pendingAnchor = null;
		if (anchor) void tick().then(() => virtual.restoreAnchor(anchor));
	};

	onDestroy(() => {
		onRefreshReady?.(undefined);
		focus.destroy();
		saveCommentsViewState(postId, sourceId, {
			sorting: logic.sorting,
			collapsed: [...collapsed],
			heights: virtual.exportHeights()
		});
	});

	return focus;
}
