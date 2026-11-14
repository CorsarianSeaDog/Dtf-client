import type { Attachment } from 'svelte/attachments';
import { settings } from '$lib/storage/settings.svelte';

export interface SmartTypographyResult {
	text: string;
	caret: number;
}

type RawChar = '-' | '"';

const EXCLUDED_SELECTOR =
	'.ce-code, code, pre, .ce-toolbar, .ce-inline-toolbar, .ce-conversion-toolbar, .ce-popover, .ce-settings';

const NAV_KEYS = new Set([
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'Home',
	'End',
	'Delete'
]);

/** Чистый автомат состояний для автозамены `--` → `—` и `""` → `«` / `»` с отменой по Backspace */
export function createSmartTypographyState() {
	let replaced: { target: unknown; pos: number; replacement: string; raw: RawChar } | null = null;
	let suppressed: { target: unknown; pos: number; raw: RawChar } | null = null;

	function revert(text: string, sliceAfter: number, target: unknown): SmartTypographyResult {
		const { pos, raw } = replaced!;
		replaced = null;
		suppressed = { target, pos, raw };
		return { text: text.slice(0, pos) + raw + text.slice(sliceAfter), caret: pos + 1 };
	}

	function handleBackspace(
		text: string,
		caret: number,
		target: unknown = null
	): SmartTypographyResult | null {
		if (
			replaced &&
			replaced.target === target &&
			caret === replaced.pos + 1 &&
			text[replaced.pos] === replaced.replacement
		) {
			return revert(text, replaced.pos + 1, target);
		}
		replaced = null;
		return null;
	}

	function handleInput(
		text: string,
		caret: number,
		inputType?: string | null,
		fullTextBeforePos?: string,
		target: unknown = null
	): SmartTypographyResult | null {
		if (
			suppressed &&
			(suppressed.target !== target || caret <= suppressed.pos || text[suppressed.pos] !== suppressed.raw)
		) {
			suppressed = null;
		}

		// На мобильных клавиатурах (IME) удаление часто приходит сразу в input без отменяемого keydown/beforeinput
		if (inputType === 'deleteContentBackward' || inputType === 'deleteByComposition') {
			if (
				replaced &&
				replaced.target === target &&
				caret === replaced.pos &&
				text[replaced.pos] !== replaced.replacement
			) {
				return revert(text, replaced.pos, target);
			}
			replaced = null;
			return null;
		}

		replaced = null;

		if (inputType && inputType !== 'insertText' && inputType !== 'insertCompositionText') {
			return null;
		}

		if (caret < 2) return null;

		const pos = caret - 2;
		const pair = text.slice(pos, caret);
		if (pair !== '--' && pair !== '""') return null;

		const raw = pair[0] as RawChar;
		if (suppressed && suppressed.target === target && suppressed.pos === pos && suppressed.raw === raw) {
			return null;
		}

		// Три и более одинаковых символа подряд (--- или """) не трогаем
		if (pos > 0 && text[pos - 1] === raw) return null;

		let replacement: string;
		if (raw === '-') {
			replacement = '—';
		} else {
			const before = fullTextBeforePos ?? text.slice(0, pos);
			replacement = before.lastIndexOf('«') > before.lastIndexOf('»') ? '»' : '«';
		}

		const nextText = text.slice(0, pos) + replacement + text.slice(caret);
		const nextCaret = pos + 1;
		replaced = { target, pos, replacement, raw };
		return { text: nextText, caret: nextCaret };
	}

	return {
		handleBackspace,
		handleInput,
		clearReplaced: () => {
			replaced = null;
		},
		reset: () => {
			replaced = null;
			suppressed = null;
		}
	};
}

interface EditableContext {
	target: unknown;
	dispatchTarget: HTMLElement;
	text: string;
	caret: number;
	getBeforeForQuotes: () => string | undefined;
	apply: (res: SmartTypographyResult) => void;
}

function readContext(root: HTMLElement, rawTarget: EventTarget | null): EditableContext | null {
	const el =
		rawTarget instanceof Element
			? rawTarget
			: rawTarget instanceof Node
				? rawTarget.parentElement
				: null;
	if (!el || !root.contains(el) || el.closest(EXCLUDED_SELECTOR)) return null;

	if (
		el instanceof HTMLTextAreaElement ||
		(el instanceof HTMLInputElement && (el.type === 'text' || !el.type))
	) {
		if (el.readOnly || el.disabled) return null;
		const start = el.selectionStart;
		const end = el.selectionEnd;
		if (start === null || end === null || start !== end) return null;
		return {
			target: el,
			dispatchTarget: el,
			text: el.value,
			caret: start,
			getBeforeForQuotes: () => undefined,
			apply: (res) => {
				el.value = res.text;
				el.setSelectionRange(res.caret, res.caret);
			}
		};
	}

	const host = el.closest<HTMLElement>('[contenteditable]:not([contenteditable="false"])');
	if (!host || !root.contains(host) || host.closest(EXCLUDED_SELECTOR)) return null;

	const doc = host.ownerDocument;
	const sel = doc.getSelection();
	if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;

	const anchor = sel.anchorNode;
	if (!anchor || anchor.nodeType !== 3 || !host.contains(anchor)) return null;

	const textNode = anchor as Text;
	if (textNode.parentElement?.closest(EXCLUDED_SELECTOR)) return null;

	const caret = sel.anchorOffset;
	const text = textNode.data;

	return {
		target: textNode,
		dispatchTarget: host,
		text,
		caret,
		getBeforeForQuotes: () => {
			if (caret < 2 || text.slice(caret - 2, caret) !== '""') return undefined;
			if (host.firstChild === textNode && host.childNodes.length === 1) {
				return text.slice(0, caret - 2);
			}
			const range = doc.createRange();
			range.setStart(host, 0);
			range.setEnd(textNode, caret - 2);
			return range.toString();
		},
		apply: (res) => {
			textNode.data = res.text;
			sel.collapse(textNode, res.caret);
		}
	};
}

/** Аттачмент Svelte для умной типографики в полях ввода, textarea и contenteditable */
export const smartTypography: Attachment<HTMLElement> = (node) => {
	const state = createSmartTypographyState();
	let internalInput = false;

	function isEnabled(): boolean {
		if (settings.value.smartTypography) return true;
		state.reset();
		return false;
	}

	function syncInput(target: HTMLElement) {
		internalInput = true;
		try {
			target.dispatchEvent(new Event('input', { bubbles: true }));
		} finally {
			internalInput = false;
		}
	}

	function tryBackspace(e: Event) {
		const ctx = readContext(node, e.target);
		if (!ctx) return;
		const res = state.handleBackspace(ctx.text, ctx.caret, ctx.target);
		if (!res) return;
		e.preventDefault();
		ctx.apply(res);
		syncInput(ctx.dispatchTarget);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!isEnabled() || e.isComposing) return;
		if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
			tryBackspace(e);
			return;
		}
		if (NAV_KEYS.has(e.key)) {
			state.clearReplaced();
		}
	}

	function onBeforeInput(e: InputEvent) {
		if (!isEnabled() || internalInput) return;
		if (e.inputType === 'deleteContentBackward' && e.cancelable) {
			tryBackspace(e);
		}
	}

	function onInput(e: Event) {
		if (!isEnabled() || internalInput) return;
		const ctx = readContext(node, e.target);
		if (!ctx) {
			state.clearReplaced();
			return;
		}
		const inputType = 'inputType' in e ? (e as InputEvent).inputType : undefined;
		const res = state.handleInput(
			ctx.text,
			ctx.caret,
			inputType,
			ctx.getBeforeForQuotes(),
			ctx.target
		);
		if (!res) return;
		ctx.apply(res);
		// На одном узле слушатель bind:value/bind:textContent срабатывает до capture-обработчика — досылаем input
		if (e.target === node) {
			syncInput(ctx.dispatchTarget);
		}
	}

	node.addEventListener('keydown', onKeydown, true);
	node.addEventListener('beforeinput', onBeforeInput as EventListener, true);
	node.addEventListener('input', onInput, true);
	node.addEventListener('pointerdown', state.clearReplaced, true);

	return () => {
		node.removeEventListener('keydown', onKeydown, true);
		node.removeEventListener('beforeinput', onBeforeInput as EventListener, true);
		node.removeEventListener('input', onInput, true);
		node.removeEventListener('pointerdown', state.clearReplaced, true);
	};
};
