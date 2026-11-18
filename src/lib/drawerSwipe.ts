import type { Attachment } from 'svelte/attachments';
import { progressSwipe, swipe } from './swipe';

/*
 * Боковая панель, которую выдвигают пальцем: свайп вправо по первой ленте открывает её, свайп влево по открытой закрывает.
 * Только в мобильной раскладке тем с жестами. Как панель выглядит и что при этом двигается, решает тема: модуль ведёт
 * только положение от 0 (закрыта) до 1 (открыта).
 */

export interface Drawer {
	/** Ход пальца от закрытой панели до открытой */
	width: () => number;
	/** Нарисовать положение `p` без собственной анимации */
	set: (p: number) => void;
	/** Доехали до открытой или закрытой панели */
	commit: (open: boolean) => void;
}

let drawer: ReturnType<typeof progressSwipe> | undefined;

/** Тема сообщает, что рисовать; кнопка меню и жесты получают один контроллер доезда */
export function provideDrawer(d: Drawer) {
	const pull = progressSwipe({ ...d, commit: (p) => d.commit(p === 1) });
	drawer = pull;
	return {
		animate: (open: boolean) => pull.animate(open ? 1 : 0),
		destroy() {
			if (drawer === pull) drawer = undefined;
			pull.destroy();
		}
	};
}

/** Узел берёт общий контроллер только на время своего жеста */
export function drawerInput() {
	let pull: typeof drawer;

	function end(offset: number, velocity: number | null) {
		const current = pull;
		pull = undefined;
		if (current === drawer) return current?.end(offset, velocity);
	}

	return {
		get engaged() { return !!pull; },
		begin() {
			pull = drawer;
			return pull?.begin() ?? false;
		},
		grab() {
			const current = drawer;
			const held = current?.grab();
			pull = held ? current : undefined;
			return held;
		},
		move(offset: number) {
			// После смены раскладки или темы контроллер жеста уже мог исчезнуть.
			if (pull === drawer) pull?.move(offset);
		},
		end,
		destroy(dragging: boolean) {
			if (dragging) end(0, null);
		}
	};
}

/** Закрытие свайпом влево по открытой панели */
export function drawerSwipe(isOpen: () => boolean): Attachment<HTMLElement> {
	return (node) => {
		const { begin, grab, move, end, destroy } = drawerInput();
		return swipe({
			start: () => !!drawer && (isOpen() || drawer.active),
			begin: (dx) => dx < 0 && begin(),
			grab, move, end, destroy
		})(node);
	};
}
