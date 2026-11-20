import type { Attachment } from 'svelte/attachments';
import { haptics } from '$lib/haptics';

/** Пункт контекстного меню: кнопка-действие или ссылка */
export interface ContextMenuItem {
	id: string;
	label: string;
	/** Имя символа из SVG-спрайта (без `#`) */
	icon?: string;
	danger?: boolean;
	disabled?: boolean;
	href?: string;
	target?: string;
	rel?: string;
	/** Визуальный разделитель перед пунктом (не рисуется, если пункт первый) */
	separatorBefore?: boolean;
	action?: () => void | Promise<void>;
}

/** Данные, которые строит обработчик контекстного меню в момент открытия */
export interface ContextMenuPayload {
	items: ContextMenuItem[];
	title?: string;
	label?: string;
}

export type ContextMenuMode = 'popover' | 'sheet';

export interface ContextMenuState {
	id: number;
	x: number;
	y: number;
	mode: ContextMenuMode;
	items: ContextMenuItem[];
	title?: string;
	label: string;
	fromKeyboard: boolean;
	returnFocusTo: HTMLElement | null;
}

export interface ContextMenuOptions {
	build: (event?: Event) => ContextMenuPayload | null | undefined;
	/** Открывать ли нижнюю шторку долгим нажатием на тач-экране (по умолчанию true) */
	longPress?: boolean;
	/** Перехватывать ли меню при наличии выделенного текста внутри элемента */
	allowOnSelection?: boolean;
}

export type ContextMenuInput = ((event?: Event) => ContextMenuPayload | null | undefined) | ContextMenuOptions;

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

// Координация вложенных `{@attach contextMenu}` при касании без stopPropagation
const claimedTouch = new WeakSet<Event>();

/**
 * Вычисляет координаты всплывающего меню внутри окна с переворотом у правого и нижнего краёв.
 */
export function clampMenuPosition(
	x: number,
	y: number,
	menuWidth: number,
	menuHeight: number,
	viewportWidth: number,
	viewportHeight: number,
	margin = 8
): { left: number; top: number; flipX: boolean; flipY: boolean } {
	const flipX = x + menuWidth > viewportWidth - margin && (x - menuWidth >= margin || x > viewportWidth / 2);
	const flipY = y + menuHeight > viewportHeight - margin && (y - menuHeight >= margin || y > viewportHeight / 2);

	const rawLeft = flipX ? x - menuWidth : x;
	const rawTop = flipY ? y - menuHeight : y;

	const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
	const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);

	return {
		left: Math.min(Math.max(margin, rawLeft), maxLeft),
		top: Math.min(Math.max(margin, rawTop), maxTop),
		flipX,
		flipY
	};
}

let active = $state.raw<ContextMenuState | null>(null);
let nextId = 0;

/** Единое состояние открытого контекстного меню для всего приложения */
export const contextMenuState = {
	get current() {
		return active;
	},
	open({
		x,
		y,
		mode,
		payload,
		fromKeyboard = false,
		returnFocusTo
	}: {
		x: number;
		y: number;
		mode: ContextMenuMode;
		payload: ContextMenuPayload;
		fromKeyboard?: boolean;
		returnFocusTo?: HTMLElement | null;
	}): boolean {
		if (!payload.items.length) return false;
		nextId += 1;
		const fallbackFocus =
			typeof document !== 'undefined' && typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		active = {
			id: nextId,
			x,
			y,
			mode,
			items: payload.items,
			title: payload.title,
			label: payload.label || payload.title || 'Контекстное меню',
			fromKeyboard,
			returnFocusTo: returnFocusTo !== undefined ? returnFocusTo : fallbackFocus
		};
		return true;
	},
	close(expectedId?: number) {
		if (expectedId !== undefined && active?.id !== expectedId) return;
		active = null;
	}
};

function isEditableTarget(target: EventTarget | null): boolean {
	if (!target) return false;
	const el = typeof (target as Element).closest === 'function' ? (target as Element) : (target as Node).parentElement;
	return Boolean(el?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]'));
}

function hasSelectionInside(el: HTMLElement): boolean {
	const selection = typeof window !== 'undefined' && window.getSelection?.();
	return Boolean(selection && !selection.isCollapsed && selection.rangeCount && selection.toString()
		&& selection.getRangeAt(0).intersectsNode(el));
}

/**
 * Svelte 5 attachment `{@attach contextMenu(...)}`:
 * на десктопе и с клавиатуры открывает меню у курсора/элемента,
 * на тач-экранах открывает нижнюю шторку по долгому нажатию (450 мс).
 * `Shift + ПКМ` и выделенный текст отдаются нативному меню браузера.
 */
export function contextMenu(input: ContextMenuInput): Attachment<HTMLElement> {
	const opts: ContextMenuOptions = typeof input === 'function' ? { build: input } : input;
	const longPress = opts.longPress ?? true;
	const allowOnSelection = opts.allowOnSelection ?? false;

	return (node: HTMLElement) => {
		let touchTimer: ReturnType<typeof setTimeout> | undefined;
		let touchStart: { x: number; y: number } | undefined;
		let held = false;

		if (longPress) node.setAttribute('data-context-menu', '');

		function cancelTouch() {
			clearTimeout(touchTimer);
			touchTimer = undefined;
			touchStart = undefined;
		}

		function openSheet(e: MouseEvent) {
			cancelTouch();
			if (!allowOnSelection && hasSelectionInside(node)) return false;
			const payload = opts.build(e);
			if (!payload?.items.length) return false;
			held = true;
			contextMenuState.open({ x: e.clientX, y: e.clientY, mode: 'sheet', payload, returnFocusTo: node });
			haptics.click();
			return true;
		}

		function onTouchEnd(e: TouchEvent) {
			// touchend приходит исходному элементу даже под шторкой. Его отмена убирает
			// синтетический клик, который иначе может попасть уже в подложку или кнопку.
			if (held) e.preventDefault();
		}

		function onPointerDown(e: PointerEvent) {
			held = false;
			if (!longPress || e.pointerType !== 'touch' || claimedTouch.has(e)) return;
			cancelTouch();
			if (e.isPrimary === false || isEditableTarget(e.target)) return;
			claimedTouch.add(e);
			touchStart = { x: e.clientX, y: e.clientY };
			touchTimer = setTimeout(() => openSheet(e), LONG_PRESS_MS);
		}

		function onPointerMove(e: PointerEvent) {
			if (!touchStart || e.pointerType !== 'touch') return;
			if (Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) > MOVE_TOLERANCE_PX) {
				cancelTouch();
			}
		}

		function onContextMenu(e: MouseEvent) {
			// Вложенный элемент (или ReactionPopup) уже перехватил меню; не останавливаем всплытие, чтобы внешние слушатели могли закрыть свои поповеры
			if (e.defaultPrevented) return;

			const pointerType = (e as PointerEvent).pointerType;
			const isTouch = pointerType === 'touch' || Boolean(touchTimer);
			const isKeyboard = !isTouch && (pointerType === '' || (e.button === 0 && e.clientX === 0 && e.clientY === 0));
			if ((e.shiftKey && !isKeyboard) || isEditableTarget(e.target)) return;

			// Отложенный contextmenu того же удержания (в старых WebView без pointerType).
			if (held && !isKeyboard) {
				e.preventDefault();
				return;
			}
			if (isTouch) {
				if (longPress && openSheet(e)) e.preventDefault();
				return;
			}
			if (!allowOnSelection && hasSelectionInside(node)) return;

			const payload = opts.build(e);
			if (!payload?.items.length) return;
			e.preventDefault();

			let x = e.clientX ?? 0;
			let y = e.clientY ?? 0;
			if (isKeyboard) {
				const rect = node.getBoundingClientRect();
				x = rect.left + Math.min(rect.width / 2, 24);
				y = rect.bottom;
			}

			contextMenuState.open({
				x,
				y,
				mode: 'popover',
				payload,
				fromKeyboard: isKeyboard,
				returnFocusTo: isKeyboard ? node : undefined
			});
		}

		node.addEventListener('pointerdown', onPointerDown);
		node.addEventListener('pointermove', onPointerMove);
		if (longPress) node.addEventListener('touchend', onTouchEnd, { passive: false });
		node.addEventListener('pointerup', cancelTouch);
		node.addEventListener('pointercancel', cancelTouch);
		node.addEventListener('contextmenu', onContextMenu);

		return () => {
			cancelTouch();
			if (longPress) node.removeEventListener('touchend', onTouchEnd);
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', cancelTouch);
			node.removeEventListener('pointercancel', cancelTouch);
			node.removeEventListener('contextmenu', onContextMenu);
			if (longPress) node.removeAttribute('data-context-menu');
		};
	};
}
