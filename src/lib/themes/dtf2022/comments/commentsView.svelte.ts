import type { CommentTreeItem } from '$lib/api/types';
import type { CommentsLogic } from '$lib/components/Comments/commentsLogic.svelte';

/** Общая привязка колбэков логики комментариев к списку темы */
export function bindCommentsView(options: {
	logic: CommentsLogic;
	onPatchRow: (key: string, next: CommentTreeItem) => void;
	onCountChange?: (delta: number) => void;
	onReconnect?: () => void;
}): void {
	const { logic, onPatchRow, onCountChange, onReconnect } = options;
	logic.onRowPatched = onPatchRow;
	logic.onCommentCountChange = (delta) => onCountChange?.(delta);
	logic.onReconnect = () => onReconnect?.();
}
