import { onDestroy, tick, untrack } from 'svelte';
import type { CommentTreeItem } from '$lib/api/types';
import { getCommentsViewState, saveCommentsViewState } from '$lib/commentsCache';
import type { CommentsLogic } from '$lib/components/Comments/commentsLogic.svelte';
import type { VirtualRows } from './virtualRows.svelte';

/** Общая привязка колбэков логики, восстановления вида (сохраняется при уничтожении) и якоря прокрутки для списка комментариев темы */
export function bindCommentsView(options: {
	logic: CommentsLogic;
	virtual: VirtualRows;
	collapsed: Set<string>;
	getPost: () => { postId: number; sourceId: string };
	onPatchRow: (key: string, next: CommentTreeItem) => void;
	onCountChange?: (delta: number) => void;
	onReconnect?: () => void;
}): void {
	const { logic, virtual, collapsed, getPost, onPatchRow, onCountChange, onReconnect } = options;
	logic.onRowPatched = onPatchRow;
	logic.onCommentCountChange = (delta) => onCountChange?.(delta);
	logic.onReconnect = () => onReconnect?.();

	const { postId, sourceId } = untrack(getPost);
	const savedView = getCommentsViewState(postId, sourceId);
	if (savedView) {
		logic.sorting = savedView.sorting;
		for (const key of savedView.collapsed) collapsed.add(key);
		virtual.restoreHeights(savedView.heights);
	}

	let pendingAnchor: { key: string; top: number } | null = null;
	logic.onBeforeExternalInsert = () => {
		pendingAnchor = virtual.captureAnchor();
	};
	logic.onAfterExternalInsert = () => {
		const anchor = pendingAnchor;
		pendingAnchor = null;
		if (anchor) void tick().then(() => virtual.restoreAnchor(anchor));
	};

	onDestroy(() =>
		saveCommentsViewState(postId, sourceId, {
			sorting: logic.sorting,
			collapsed: [...collapsed],
			heights: virtual.exportHeights()
		})
	);
}
