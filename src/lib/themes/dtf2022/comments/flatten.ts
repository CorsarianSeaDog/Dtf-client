import type { CommentTreeItem } from '$lib/api/types';
import { filterSettings, matchCommentFilter, type FilterSettings } from '$lib/storage/filter.svelte';

/** Вертикальная линия ветки слева от комментария */
export interface ThreadLine {
	/** Ветка продолжается ниже этого комментария */
	border: boolean;
	/** Дуга к аватару — только у последней линии и только при реальной вложенности */
	arc: boolean;
	/** Ключ комментария, чьи ответы образуют эту ветку (по клику ветка сворачивается) */
	owner: string;
}

export interface CommentRow {
	key: string;
	comment: CommentTreeItem;
	/** Визуальный уровень, с 1 */
	level: number;
	lines: ThreadLine[];
	parent?: CommentTreeItem;
	/** Ключи предков от корня до родителя — для скрытия потомков свёрнутой ветки без пересборки списка */
	owners: string[];
}

export const commentKey = (c: { sourceId: string; id: number }) => `${c.sourceId}_${c.id}`;

// У комментариев с ответами сохраняем строку, чтобы ветка не меняла структуру
function isHiddenLeaf(comment: CommentTreeItem, settings: FilterSettings): boolean {
	return comment.children.length === 0 && !!matchCommentFilter(comment, settings);
}

/**
 * Дерево → плоский список, как рисует DTF: у комментария на уровне N есть N−1 линий.
 * Глубже maxDepth ответы не сдвигаются, а встают на последний уровень без дуги.
 */
export function flattenComments(roots: CommentTreeItem[], maxDepth: number, settings = filterSettings.value): CommentRow[] {
	const rows: CommentRow[] = [];

	// chain[k] — есть ли у узла цепочки на глубине k следующие соседи (ветка его родителя идёт дальше);
	// owners[i] — предок на глубине i
	function walk(nodes: CommentTreeItem[], depth: number, continues: boolean[], owners: string[], parent?: CommentTreeItem) {
		const visible = settings.mode === 'hard' ? nodes.filter((comment) => !isHiddenLeaf(comment, settings)) : nodes;
		visible.forEach((comment, index) => {
			const key = commentKey(comment);
			const chain = [...continues, index < visible.length - 1];
			const visual = Math.min(depth, maxDepth);

			rows.push({
				key,
				comment,
				level: visual + 1,
				// линия i — ветка предка глубины i, она продолжается, если у его потомка в цепочке есть соседи
				lines: chain.slice(1, visual + 1).map((border, i) => ({
					border,
					arc: i === visual - 1 && depth <= maxDepth,
					owner: owners[i]
				})),
				parent,
				owners
			});

			walk(comment.children, depth + 1, chain, [...owners, key], comment);
		});
	}

	walk(roots, 0, [], []);
	return rows;
}

/** Пересобирает ветки, только если правка добавила строку в фильтр или вернула её в список */
export function patchCommentRow(rows: CommentRow[], key: string, next: CommentTreeItem, rebuild: () => CommentRow[]): CommentRow[] {
	const settings = filterSettings.value;
	if (settings.mode === 'hard') {
		const visible = rows.some((row) => row.key === key);
		const hidden = isHiddenLeaf(next, settings);
		if (visible === hidden) return rebuild();
		if (hidden) return rows;
	}
	return rows.map((row) => (row.key === key ? { ...row, comment: next } : row));
}
