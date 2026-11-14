import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	const data: Record<string, string> = {};
	Object.defineProperty(globalThis, 'localStorage', {
		value: {
			getItem: (key: string) => data[key] ?? null,
			setItem: (key: string, value: string) => {
				data[key] = String(value);
			},
			removeItem: (key: string) => {
				delete data[key];
			},
			clear: () => {
				for (const key in data) delete data[key];
			}
		},
		writable: true
	});
});

import { createSmartTypographyState, smartTypography } from './smartTypography';
import { settings } from '$lib/storage/settings.svelte';

describe('createSmartTypographyState', () => {
	it('заменяет -- на длинное тире —', () => {
		const state = createSmartTypographyState();
		expect(state.handleInput('Привет --', 9, 'insertText')).toEqual({
			text: 'Привет —',
			caret: 8
		});
		// После одиночного дефиса или трёх дефисов подряд замены нет
		expect(state.handleInput('Привет -', 8, 'insertText')).toBeNull();
		expect(state.handleInput('---', 3, 'insertText')).toBeNull();
	});

	it('возвращает - при первом Backspace и не заменяет повторно, пока не стёрт второй минус', () => {
		const state = createSmartTypographyState();

		expect(state.handleInput('a --', 4, 'insertText')).toEqual({ text: 'a —', caret: 3 });

		// Первый Backspace откатывает — к одиночному -
		expect(state.handleBackspace('a —', 3)).toEqual({ text: 'a -', caret: 3 });

		// Повторный ввод минуса в этом же месте даёт -- и --- без автозамены
		expect(state.handleInput('a --', 4, 'insertText')).toBeNull();
		expect(state.handleInput('a ---', 5, 'insertText')).toBeNull();

		// Пока остался первый минус, подавление сохраняется
		expect(state.handleInput('a -', 3, 'deleteContentBackward')).toBeNull();
		expect(state.handleInput('a --', 4, 'insertText')).toBeNull();

		// Стираем и второй минус — при новом вводе -- снова заменяется на —
		expect(state.handleInput('a ', 2, 'deleteContentBackward')).toBeNull();
		expect(state.handleInput('a -', 3, 'insertText')).toBeNull();
		expect(state.handleInput('a --', 4, 'insertText')).toEqual({ text: 'a —', caret: 3 });
	});

	it('поддерживает откат по IME deleteContentBackward в input', () => {
		const state = createSmartTypographyState();
		expect(state.handleInput('--', 2, 'insertText')).toEqual({ text: '—', caret: 1 });
		expect(state.handleInput('', 0, 'deleteContentBackward')).toEqual({ text: '-', caret: 1 });
		expect(state.handleInput('--', 2, 'insertText')).toBeNull();
	});

	it('чередует кавычки "" -> «, затем » и снова « в том же тексте', () => {
		const state = createSmartTypographyState();

		expect(state.handleInput('Он сказал: ""', 13, 'insertText')).toEqual({
			text: 'Он сказал: «',
			caret: 12
		});
		expect(state.handleInput('Он сказал: «привет""', 20, 'insertText')).toEqual({
			text: 'Он сказал: «привет»',
			caret: 19
		});
		expect(state.handleInput('Он сказал: «привет» и ""', 24, 'insertText')).toEqual({
			text: 'Он сказал: «привет» и «',
			caret: 23
		});
	});

	it('возвращает " при Backspace после « или » и не заменяет до удаления второй кавычки', () => {
		const state = createSmartTypographyState();

		expect(state.handleInput('""', 2, 'insertText')).toEqual({ text: '«', caret: 1 });
		expect(state.handleBackspace('«', 1)).toEqual({ text: '"', caret: 1 });
		expect(state.handleInput('""', 2, 'insertText')).toBeNull();
		expect(state.handleInput('"', 1, 'deleteContentBackward')).toBeNull();
		expect(state.handleInput('', 0, 'deleteContentBackward')).toBeNull();
		expect(state.handleInput('""', 2, 'insertText')).toEqual({ text: '«', caret: 1 });

		// То же для закрывающей кавычки »
		expect(state.handleInput('«текст""', 8, 'insertText')).toEqual({ text: '«текст»', caret: 7 });
		expect(state.handleBackspace('«текст»', 7)).toEqual({ text: '«текст"', caret: 7 });
		expect(state.handleInput('«текст""', 8, 'insertText')).toBeNull();
		expect(state.handleInput('«текст', 6, 'deleteContentBackward')).toBeNull();
		expect(state.handleInput('«текст""', 8, 'insertText')).toEqual({ text: '«текст»', caret: 7 });
	});

	it('учитывает открывающую « из fullTextBeforePos', () => {
		const state = createSmartTypographyState();
		expect(state.handleInput('слово""', 7, 'insertText', 'Он сказал: «слово')).toEqual({
			text: 'слово»',
			caret: 6
		});
	});

	it('игнорирует вставку из буфера и нетиповые inputType', () => {
		const state = createSmartTypographyState();
		expect(state.handleInput('--', 2, 'insertFromPaste')).toBeNull();
		expect(state.handleInput('""', 2, 'historyUndo')).toBeNull();
	});
});

class FakeNode {
	nodeType = 1;
	parentElement: FakeElement | null = null;
	data = '';
}

class FakeElement extends FakeNode {
	listeners = new Map<string, Array<(e: any) => void>>();
	children: FakeNode[] = [];
	classes = new Set<string>();
	attrs = new Map<string, string>();
	ownerDocument: any = null;

	get childNodes() {
		return this.children;
	}

	get firstChild() {
		return this.children[0] ?? null;
	}

	contains(other: unknown): boolean {
		for (let cur = other as FakeNode | null; cur; cur = cur.parentElement) {
			if (cur === this) return true;
		}
		return false;
	}

	closest(selector: string): FakeElement | null {
		const parts = selector.split(',').map((s) => s.trim());
		for (let cur: FakeElement | null = this; cur; cur = cur.parentElement) {
			for (const part of parts) {
				if (part.startsWith('.') && cur.classes.has(part.slice(1))) return cur;
				if (
					part.startsWith('[contenteditable]') &&
					cur.attrs.has('contenteditable') &&
					(!part.includes(':not([contenteditable="false"])') || cur.attrs.get('contenteditable') !== 'false')
				) {
					return cur;
				}
			}
		}
		return null;
	}

	addEventListener(type: string, fn: (e: any) => void) {
		const list = this.listeners.get(type) ?? [];
		list.push(fn);
		this.listeners.set(type, list);
	}

	removeEventListener(type: string, fn: (e: any) => void) {
		this.listeners.set(
			type,
			(this.listeners.get(type) ?? []).filter((item) => item !== fn)
		);
	}

	dispatchEvent(event: any) {
		if (!event.target) {
			Object.defineProperty(event, 'target', { value: this, configurable: true });
		}
		for (const fn of this.listeners.get(event.type) ?? []) fn(event);
		return !event.defaultPrevented;
	}
}

class FakeTextArea extends FakeElement {
	value = '';
	selectionStart = 0;
	selectionEnd = 0;
	readOnly = false;
	disabled = false;

	setSelectionRange(start: number, end: number) {
		this.selectionStart = start;
		this.selectionEnd = end;
	}
}

function sendInput(host: FakeElement, target: FakeElement = host) {
	host.dispatchEvent({ type: 'input', inputType: 'insertText', target });
}

function sendBackspace(el: FakeElement): boolean {
	let prevented = false;
	el.dispatchEvent({
		type: 'keydown',
		key: 'Backspace',
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		isComposing: false,
		target: el,
		preventDefault: () => {
			prevented = true;
		}
	});
	return prevented;
}

describe('smartTypography attachment', () => {
	beforeEach(() => {
		localStorage.clear();
		settings.patch({ smartTypography: true });
		vi.stubGlobal('Node', FakeNode);
		vi.stubGlobal('Element', FakeElement);
		vi.stubGlobal('HTMLTextAreaElement', FakeTextArea);
		vi.stubGlobal('HTMLInputElement', class extends FakeElement {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('поддерживает замену и отмену по Backspace в DOM-элементе и отключается настройкой', () => {
		const textarea = new FakeTextArea();
		const detach = smartTypography(textarea as unknown as HTMLElement);

		textarea.value = 'Текст --';
		textarea.setSelectionRange(8, 8);
		sendInput(textarea);

		expect(textarea.value).toBe('Текст —');
		expect(textarea.selectionStart).toBe(7);

		// Первый Backspace через keydown откатывает к '-' и блокирует повторную замену
		expect(sendBackspace(textarea)).toBe(true);
		expect(textarea.value).toBe('Текст -');
		expect(textarea.selectionStart).toBe(7);

		textarea.value = 'Текст --';
		textarea.setSelectionRange(8, 8);
		sendInput(textarea);
		expect(textarea.value).toBe('Текст --');

		// Настройка выключена — автозамена и откат не срабатывают
		textarea.value = 'Текст —';
		textarea.setSelectionRange(7, 7);
		settings.patch({ smartTypography: false });
		expect(sendBackspace(textarea)).toBe(false);

		textarea.value = 'Текст --';
		textarea.setSelectionRange(8, 8);
		sendInput(textarea);
		expect(textarea.value).toBe('Текст --');

		// Включаем обратно и проверяем работу в этом же узле и игнор в .ce-code
		settings.patch({ smartTypography: true });
		textarea.value = 'Текст ""';
		textarea.setSelectionRange(8, 8);
		sendInput(textarea);
		expect(textarea.value).toBe('Текст «');

		const container = new FakeElement();
		const codeBlock = new FakeElement();
		codeBlock.classes.add('ce-code');
		codeBlock.parentElement = container;
		const codeArea = new FakeTextArea();
		codeArea.parentElement = codeBlock;
		const detachContainer = smartTypography(container as unknown as HTMLElement);

		codeArea.value = 'a--b';
		codeArea.setSelectionRange(3, 3);
		sendInput(container, codeArea);
		expect(codeArea.value).toBe('a--b');

		detachContainer?.();
		detach?.();
	});

	it('поддерживает contenteditable и учитывает открытую « из предыдущего узла', () => {
		const text1 = new FakeNode();
		text1.nodeType = 3;
		text1.data = 'Он сказал: «';

		const text2 = new FakeNode();
		text2.nodeType = 3;
		text2.data = 'слово""';

		let anchorNode: any = text2;
		let anchorOffset = 7;
		const sel = {
			rangeCount: 1,
			isCollapsed: true,
			get anchorNode() {
				return anchorNode;
			},
			get anchorOffset() {
				return anchorOffset;
			},
			collapse(node: any, offset: number) {
				anchorNode = node;
				anchorOffset = offset;
			}
		};

		const host = new FakeElement();
		host.attrs.set('contenteditable', 'true');
		text1.parentElement = host;
		text2.parentElement = host;
		host.children = [text1, text2];
		host.ownerDocument = {
			getSelection: () => sel,
			createRange: () => ({
				setStart: () => {},
				setEnd: () => {},
				toString: () => `${text1.data}${text2.data.slice(0, 5)}`
			})
		};

		const detach = smartTypography(host as unknown as HTMLElement);
		sendInput(host);

		expect(text2.data).toBe('слово»');
		expect(anchorNode).toBe(text2);
		expect(anchorOffset).toBe(6);

		detach?.();
	});
});
