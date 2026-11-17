/** Во что превращается пустой абзац, начатый с markdown-подобного сокращения */
export type BlockShortcut = { tool: string; data: Record<string, unknown> };

const SHORTCUTS: Record<string, BlockShortcut> = {
	'##': { tool: 'header', data: { level: 2 } },
	'###': { tool: 'header', data: { level: 3 } },
	'-': { tool: 'list', data: { style: 'unordered' } },
	'1.': { tool: 'list', data: { style: 'ordered' } },
	'>': { tool: 'quote', data: {} }
};

/**
 * Текст абзаца вместе с только что набранным пробелом → блок или null.
 * Срабатывает, только если в абзаце ничего нет, кроме сокращения и этого пробела.
 * Пробел в contenteditable приходит как неразрывный, поэтому принимаем оба.
 */
export function parseShortcut(text: string): BlockShortcut | null {
	const match = /^(\S+)[  ]$/.exec(text);
	return match ? (SHORTCUTS[match[1]] ?? null) : null;
}
