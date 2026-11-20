import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clampMenuPosition, contextMenu, contextMenuState } from './contextMenu.svelte';
import { haptics } from '$lib/haptics';

vi.mock('$lib/haptics', () => ({
	haptics: {
		click: vi.fn(),
		double: vi.fn(),
		error: vi.fn()
	}
}));

function createMockElement(rect = { left: 20, top: 40, width: 120, height: 36, right: 140, bottom: 76 }) {
	const attrs = new Map<string, string>();
	return Object.assign(new EventTarget(), {
		setAttribute: (name: string, value: string) => attrs.set(name, value),
		removeAttribute: (name: string) => attrs.delete(name),
		getAttribute: (name: string) => attrs.get(name) ?? null,
		getBoundingClientRect: () => rect
	}) as unknown as HTMLElement;
}

function makeEvent({ type, ...props }: { type: string } & Record<string, unknown>) {
	return Object.assign(new Event(type, { bubbles: true, cancelable: true }), props);
}

describe('clampMenuPosition', () => {
	it('оставляет обычную позицию без переворота, если меню помещается в окно', () => {
		expect(clampMenuPosition(100, 120, 200, 150, 1280, 720)).toEqual({
			left: 100,
			top: 120,
			flipX: false,
			flipY: false
		});
	});

	it('переворачивает меню влево и вверх у правого и нижнего краёв экрана', () => {
		expect(clampMenuPosition(1200, 680, 200, 160, 1280, 720)).toEqual({
			left: 1000,
			top: 520,
			flipX: true,
			flipY: true
		});
	});

	it('зажимает координаты в границах узкого экрана с учётом отступа', () => {
		expect(clampMenuPosition(2, 4, 240, 200, 220, 180, 8)).toEqual({
			left: 8,
			top: 8,
			flipX: false,
			flipY: false
		});

		expect(clampMenuPosition(210, 170, 240, 200, 220, 180, 8)).toEqual({
			left: 8,
			top: 8,
			flipX: true,
			flipY: true
		});
	});
});

describe('contextMenuState', () => {
	beforeEach(() => {
		contextMenuState.close();
	});

	it('управляет открытием и закрытием меню, игнорируя пустой список пунктов', () => {
		expect(contextMenuState.current).toBeNull();

		const emptyOpened = contextMenuState.open({
			x: 10,
			y: 20,
			mode: 'popover',
			payload: { items: [] }
		});
		expect(emptyOpened).toBe(false);
		expect(contextMenuState.current).toBeNull();

		const opened = contextMenuState.open({
			x: 50,
			y: 60,
			mode: 'popover',
			payload: {
				title: 'Подсайт',
				items: [{ id: 'unpin', label: 'Открепить' }]
			}
		});
		expect(opened).toBe(true);
		expect(contextMenuState.current).toMatchObject({
			x: 50,
			y: 60,
			mode: 'popover',
			title: 'Подсайт',
			label: 'Подсайт',
			fromKeyboard: false
		});

		contextMenuState.close();
		expect(contextMenuState.current).toBeNull();
	});

	it('игнорирует закрытие по устаревшему id после открытия нового меню', () => {
		contextMenuState.open({
			x: 10,
			y: 10,
			mode: 'popover',
			payload: { items: [{ id: 'first', label: 'Первый' }] }
		});
		const firstId = contextMenuState.current!.id;

		contextMenuState.open({
			x: 20,
			y: 20,
			mode: 'popover',
			payload: { items: [{ id: 'second', label: 'Второй' }] }
		});
		const secondId = contextMenuState.current!.id;
		expect(secondId).toBeGreaterThan(firstId);

		contextMenuState.close(firstId);
		expect(contextMenuState.current?.id).toBe(secondId);

		contextMenuState.close(secondId);
		expect(contextMenuState.current).toBeNull();
	});
});

describe('contextMenu attachment', () => {
	let node: HTMLElement;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		contextMenuState.close();
		node = createMockElement();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('открывает popover по ПКМ мышью и отменяет нативное меню', () => {
		const cleanup = contextMenu(() => ({
			label: 'Меню элемента',
			items: [{ id: 'copy', label: 'Копировать' }]
		}))(node) as () => void;

		const event = makeEvent({
			type: 'contextmenu',
			pointerType: 'mouse',
			button: 2,
			clientX: 150,
			clientY: 220
		});
		node.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(contextMenuState.current).toMatchObject({
			x: 150,
			y: 220,
			mode: 'popover',
			fromKeyboard: false,
			label: 'Меню элемента'
		});

		cleanup();
		expect(node.getAttribute('data-context-menu')).toBeNull();
	});

	it('отдаёт браузеру Shift + ПКМ без перехвата', () => {
		const cleanup = contextMenu(() => ({
			items: [{ id: 'copy', label: 'Копировать' }]
		}))(node) as () => void;

		const event = makeEvent({
			type: 'contextmenu',
			pointerType: 'mouse',
			button: 2,
			shiftKey: true,
			clientX: 100,
			clientY: 120
		});
		node.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
		expect(contextMenuState.current).toBeNull();

		cleanup();
	});

	it('открывает popover с клавиатуры с флагом fromKeyboard и координатами элемента', () => {
		const cleanup = contextMenu(() => ({
			items: [{ id: 'open', label: 'Открыть' }]
		}))(node) as () => void;

		// Вариант 1: PointerEvent с пустым pointerType (в том числе Shift+F10)
		const keyPointerEvent = makeEvent({
			type: 'contextmenu',
			pointerType: '',
			shiftKey: true,
			button: 0,
			clientX: 0,
			clientY: 0
		});
		node.dispatchEvent(keyPointerEvent);

		expect(keyPointerEvent.defaultPrevented).toBe(true);
		expect(contextMenuState.current).toMatchObject({
			x: 44, // rect.left (20) + min(120 / 2, 24)
			y: 76, // rect.bottom
			mode: 'popover',
			fromKeyboard: true
		});

		contextMenuState.close();

		// Вариант 2: MouseEvent без pointerType с нулевыми координатами и button=0
		const keyMouseEvent = makeEvent({
			type: 'contextmenu',
			button: 0,
			clientX: 0,
			clientY: 0
		});
		node.dispatchEvent(keyMouseEvent);

		expect(keyMouseEvent.defaultPrevented).toBe(true);
		expect(contextMenuState.current?.fromKeyboard).toBe(true);

		cleanup();
	});

	it('при вложенных обработчиках внутренний перехватывает событие, а внешний игнорирует defaultPrevented', () => {
		const outer = createMockElement();
		const inner = createMockElement();

		const cleanOuter = contextMenu(() => ({
			items: [{ id: 'outer', label: 'Внешний' }]
		}))(outer) as () => void;
		const cleanInner = contextMenu(() => ({
			items: [{ id: 'inner', label: 'Внутренний' }]
		}))(inner) as () => void;

		const event = makeEvent({
			type: 'contextmenu',
			pointerType: 'mouse',
			button: 2,
			clientX: 80,
			clientY: 90
		});

		inner.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(contextMenuState.current?.items[0].id).toBe('inner');

		outer.dispatchEvent(event);
		expect(contextMenuState.current?.items[0].id).toBe('inner');

		cleanInner();
		cleanOuter();
	});

	it('пропускает перехват, если внутри элемента есть выделенный текст', () => {
		vi.stubGlobal('window', {
			getSelection: () => ({
				isCollapsed: false,
				rangeCount: 1,
				toString: () => 'выделенный текст',
				getRangeAt: () => ({
					intersectsNode: (element: HTMLElement) => element === node
				})
			})
		});

		const cleanup = contextMenu(() => ({
			items: [{ id: 'copy', label: 'Копировать' }]
		}))(node) as () => void;

		const event = makeEvent({
			type: 'contextmenu',
			pointerType: 'mouse',
			button: 2,
			clientX: 50,
			clientY: 50
		});
		node.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
		expect(contextMenuState.current).toBeNull();

		cleanup();
	});

	it.each([0, 1500])('после удержания и ещё %i мс гасит клик отпускания и повторное меню', (delay) => {
		const cleanup = contextMenu(() => ({
			title: 'GIF',
			items: [{ id: 'save', label: 'Сохранить' }]
		}))(node) as () => void;

		expect(node.getAttribute('data-context-menu')).toBe('');

		node.dispatchEvent(
			makeEvent({
				type: 'pointerdown',
				pointerType: 'touch',
				clientX: 100,
				clientY: 100
			})
		);

		expect(contextMenuState.current).toBeNull();
		vi.advanceTimersByTime(450);

		expect(contextMenuState.current).toMatchObject({
			mode: 'sheet',
			title: 'GIF',
			fromKeyboard: false
		});
		expect(haptics.click).toHaveBeenCalledTimes(1);
		const openedId = contextMenuState.current!.id;

		vi.advanceTimersByTime(delay);
		node.dispatchEvent(makeEvent({ type: 'pointerup', pointerType: 'touch' }));
		const release = makeEvent({ type: 'touchend' });
		node.dispatchEvent(release);
		expect(release.defaultPrevented).toBe(true);

		// Отложенный contextmenu от браузера после удержания подавляется без повторного открытия
		const delayedCtx = makeEvent({ type: 'contextmenu', pointerType: 'touch', clientX: 100, clientY: 100 });
		node.dispatchEvent(delayedCtx);
		expect(delayedCtx.defaultPrevented).toBe(true);
		expect(contextMenuState.current?.id).toBe(openedId);
		expect(haptics.click).toHaveBeenCalledTimes(1);

		node.dispatchEvent(makeEvent({ type: 'pointerdown', pointerType: 'touch' }));
		node.dispatchEvent(makeEvent({ type: 'pointerup', pointerType: 'touch' }));
		const tap = makeEvent({ type: 'touchend' });
		node.dispatchEvent(tap);
		expect(tap.defaultPrevented).toBe(false);

		cleanup();
	});

	it('нативный contextmenu опережает таймер удержания и открывает шторку один раз', () => {
		const cleanup = contextMenu(() => ({ items: [{ id: 'save', label: 'Сохранить' }] }))(node);
		node.dispatchEvent(makeEvent({ type: 'pointerdown', pointerType: 'touch', clientX: 10, clientY: 20 }));
		const nativeMenu = makeEvent({ type: 'contextmenu', pointerType: 'touch', clientX: 10, clientY: 20 });
		node.dispatchEvent(nativeMenu);
		expect(nativeMenu.defaultPrevented).toBe(true);
		expect(contextMenuState.current?.mode).toBe('sheet');
		vi.advanceTimersByTime(1000);
		expect(haptics.click).toHaveBeenCalledTimes(1);
		const release = makeEvent({ type: 'touchend' });
		node.dispatchEvent(release);
		expect(release.defaultPrevented).toBe(true);
		cleanup?.();
	});

	it('отменяет long-press при сдвиге пальца более чем на 10px и при раннем pointerup', () => {
		const cleanup = contextMenu(() => ({
			items: [{ id: 'save', label: 'Сохранить' }]
		}))(node) as () => void;

		// Сдвиг > 10px
		node.dispatchEvent(makeEvent({ type: 'pointerdown', pointerType: 'touch', clientX: 100, clientY: 100 }));
		node.dispatchEvent(makeEvent({ type: 'pointermove', pointerType: 'touch', clientX: 100, clientY: 115 }));
		vi.advanceTimersByTime(450);
		expect(contextMenuState.current).toBeNull();

		// Быстрый тап (pointerup до 450 мс)
		node.dispatchEvent(makeEvent({ type: 'pointerdown', pointerType: 'touch', clientX: 100, clientY: 100 }));
		vi.advanceTimersByTime(200);
		node.dispatchEvent(makeEvent({ type: 'pointerup', pointerType: 'touch', clientX: 100, clientY: 100 }));
		vi.advanceTimersByTime(300);
		expect(contextMenuState.current).toBeNull();

		cleanup();
	});
});
