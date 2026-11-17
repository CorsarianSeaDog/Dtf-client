import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	uploadToFile: vi.fn(),
	waitMediaReady: vi.fn(() => Promise.resolve()),
	mountUploadProgress: vi.fn(() => ({
		update: vi.fn(),
		finish: vi.fn(() => Promise.resolve()),
		destroy: vi.fn()
	}))
}));

vi.mock('$lib/themes/index.svelte', () => ({
	activeTheme: { motion: undefined }
}));

vi.mock('$lib/motion', () => ({
	play: vi.fn(() => undefined)
}));

vi.mock('$lib/components/mountUploadProgress.svelte', () => ({
	mountUploadProgress: mocks.mountUploadProgress
}));

vi.mock('../upload', () => ({
	uploadToFile: mocks.uploadToFile,
	waitMediaReady: mocks.waitMediaReady,
	isAbortError: (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
	createMediaEl: (_src: string, isVideo: boolean, className: string) => {
		const el = document.createElement(isVideo ? 'video' : 'img');
		el.classList.add(className);
		return el;
	}
}));

import GalleryTool from './GalleryTool';

type FakeEl = {
	tagName: string;
	classList: {
		items: Set<string>;
		add: (...names: string[]) => void;
		remove: (...names: string[]) => void;
		contains: (name: string) => boolean;
	};
	children: FakeEl[];
	parent: FakeEl | null;
	hidden: boolean;
	textContent: string;
	value: string;
	type: string;
	multiple: boolean;
	accept: string;
	placeholder: string;
	ariaLabel: string;
	title: string;
	disabled: boolean;
	focus: () => void;
	innerHTML: string;
	style: Record<string, string>;
	files?: File[];
	listeners: Map<string, Array<(e?: unknown) => void>>;
	setAttribute: (k: string, v: string) => void;
	addEventListener: (type: string, fn: (e?: unknown) => void) => void;
	append: (...nodes: FakeEl[]) => void;
	appendChild: (node: FakeEl) => FakeEl;
	insertBefore: (node: FakeEl, ref: FakeEl | null) => FakeEl;
	replaceChildren: (...nodes: FakeEl[]) => void;
	remove: () => void;
	trigger: (type: string, event?: unknown) => void;
	get childElementCount(): number;
	get firstChild(): FakeEl | null;
	findAll: (className: string) => FakeEl[];
	findOne: (className: string) => FakeEl | undefined;
};

function makeEl(tagName: string): FakeEl {
	const classItems = new Set<string>();
	const listeners = new Map<string, Array<(e?: unknown) => void>>();
	const el: FakeEl = {
		tagName,
		classList: {
			items: classItems,
			add: (...names: string[]) => names.forEach((n) => classItems.add(n)),
			remove: (...names: string[]) => names.forEach((n) => classItems.delete(n)),
			contains: (name: string) => classItems.has(name)
		},
		children: [],
		parent: null,
		hidden: false,
		textContent: '',
		value: '',
		type: '',
		multiple: false,
		accept: '',
		placeholder: '',
		ariaLabel: '',
		title: '',
		disabled: false,
		focus: () => {},
		innerHTML: '',
		style: {},
		listeners,
		setAttribute: () => {},
		addEventListener: (type: string, fn: (e?: unknown) => void) => {
			const list = listeners.get(type) ?? [];
			list.push(fn);
			listeners.set(type, list);
		},
		append: (...nodes: FakeEl[]) => {
			for (const n of nodes) el.appendChild(n);
		},
		appendChild: (node: FakeEl) => {
			node.parent = el;
			el.children.push(node);
			return node;
		},
		insertBefore: (node: FakeEl, ref: FakeEl | null) => {
			node.parent = el;
			const idx = ref ? el.children.indexOf(ref) : -1;
			if (idx === -1) el.children.push(node);
			else el.children.splice(idx, 0, node);
			return node;
		},
		replaceChildren: (...nodes: FakeEl[]) => {
			el.children = [];
			el.append(...nodes);
		},
		remove: () => {
			if (!el.parent) return;
			el.parent.children = el.parent.children.filter((c) => c !== el);
			el.parent = null;
		},
		trigger: (type: string, event?: unknown) => {
			for (const fn of listeners.get(type) ?? []) fn(event);
		},
		get childElementCount() {
			return el.children.length;
		},
		get firstChild() {
			return el.children[0] ?? null;
		},
		findAll: (className: string) => {
			const result: FakeEl[] = [];
			const walk = (node: FakeEl) => {
				if (node.classList.contains(className)) result.push(node);
				for (const child of node.children) walk(child);
			};
			walk(el);
			return result;
		},
		findOne: (className: string) => el.findAll(className)[0]
	};
	return el;
}

describe('GalleryTool', () => {
	beforeEach(() => {
		vi.stubGlobal('document', { createElement: (tag: string) => makeEl(tag) });
		vi.stubGlobal('URL', { createObjectURL: () => 'blob:preview', revokeObjectURL: vi.fn() });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('переключает пустое состояние и позволяет удалить картинку и менять подпись после загрузки', async () => {
		mocks.uploadToFile.mockResolvedValue({
			url: 'https://leonardo.osnova.io/uuid-1',
			uuid: 'uuid-1',
			isVideo: false
		});

		const dispatchChange = vi.fn();
		const tool = new GalleryTool({ data: {}, block: { dispatchChange } });
		const root = tool.render() as unknown as FakeEl;

		const empty = root.findOne('dtf-gallery-tool-empty')!;
		const grid = root.findOne('dtf-gallery-tool-grid')!;
		const add = root.findOne('dtf-gallery-tool-add')!;
		const count = root.findOne('dtf-gallery-tool-count')!;
		const input = root.children.find((c) => c.tagName === 'input')!;

		expect(empty.hidden).toBe(false);
		expect(grid.hidden).toBe(true);
		expect(add.hidden).toBe(true);
		expect(count.textContent).toBe('Пусто');

		input.files = [new File(['img'], 'photo.png', { type: 'image/png' })];
		input.trigger('change');
		await vi.waitFor(() => expect(tool.save().items).toHaveLength(1));

		expect(empty.hidden).toBe(true);
		expect(grid.hidden).toBe(false);
		expect(add.hidden).toBe(false);
		expect(count.textContent).toBe('1 файл');

		const caption = root.findOne('dtf-gallery-tool-caption')!;
		caption.value = 'Скриншот';
		caption.trigger('input');
		expect(tool.save().items[0].caption).toBe('Скриншот');

		const removeBtn = root.findOne('dtf-gallery-tool-remove')!;
		removeBtn.trigger('click');

		expect(tool.save().items).toHaveLength(0);
		expect(empty.hidden).toBe(false);
		expect(grid.hidden).toBe(true);
		expect(add.hidden).toBe(true);
		expect(count.textContent).toBe('Пусто');
		expect(dispatchChange).toHaveBeenCalled();
	});

	it('меняет порядок кадров кнопками «раньше» и «позже» и сообщает об изменении', () => {
		const item = (n: number) => ({ file: { url: `https://leonardo.osnova.io/${n}`, uuid: String(n), isVideo: false }, caption: `к${n}` });
		const dispatchChange = vi.fn();
		const tool = new GalleryTool({ data: { items: [item(1), item(2), item(3)] } as never, block: { dispatchChange } });
		const root = tool.render() as unknown as FakeEl;
		const buttons = () => root.findAll('dtf-gallery-tool-move').map((m) => m.children);
		const captions = () => tool.save().items.map((i) => i.caption);

		// На краях кнопка в сторону края отключена
		expect(buttons()[0][0].disabled).toBe(true);
		expect(buttons()[2][1].disabled).toBe(true);

		buttons()[0][1].trigger('click');
		expect(captions()).toEqual(['к2', 'к1', 'к3']);
		expect(dispatchChange).toHaveBeenCalledTimes(1);
		// DOM идёт в том же порядке, что и данные
		expect(root.findAll('dtf-gallery-tool-caption').map((c) => c.value)).toEqual(['к2', 'к1', 'к3']);

		buttons()[2][0].trigger('click');
		expect(captions()).toEqual(['к2', 'к3', 'к1']);
		expect(buttons()[2][1].disabled).toBe(true);
	});
});
