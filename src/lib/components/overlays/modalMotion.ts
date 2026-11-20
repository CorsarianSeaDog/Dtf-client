import { backdropIn, backdropOut, play, playChildren, reducedMotion } from '$lib/motion';
import { activeTheme } from '$lib/themes/index.svelte';

/*
 * Движение модальных окон, общее для оверлеев навигации (ModalShell) и локальных диалогов (Dialog, Popup).
 * Анимации окна берутся из motion активной темы; тема без motion их не проигрывает.
 */

/** Подложка затемняется */
export function backdropShow(backdrop: Element) {
	play(backdrop, backdropIn);
}

/** Подложка плавно светлеет */
export function backdropHide(backdrop: Element, duration?: number) {
	play(backdrop, duration ? { ...backdropOut, duration } : backdropOut, 'forwards');
}

/** Окно появляется. С `data-sheet` на подложке играет выезд шторки снизу (`sheetIn`). Обёртки display: contents не анимируются */
export function modalShow(parent: Element) {
	const anim = parent.hasAttribute?.('data-sheet') ? activeTheme.motion?.sheetIn : activeTheme.motion?.modalIn;
	playChildren(parent, anim);
}

// Svelte вызывает функцию перехода не один раз, а уход должен стартовать однажды
const leaving = new WeakSet<Element>();
// Шторка, уже уехавшая свайпом вниз, не должна проигрывать уход повторно при размонтировании
const dismissed = new WeakSet<Element>();

/** Помечает оверлей как уже закрытый жестом, чтобы `modalHide` вернул `duration: 0` */
export function skipHide(node: Element) {
	dismissed.add(node);
}

/**
 * Svelte-переход ухода (`out:modalHide|global`): подложка и само окно плавно исчезают.
 * С `data-sheet` играет `sheetOut`, без нужного поля у темы окно закрывается сразу (`duration: 0`).
 */
export function modalHide(node: Element) {
	const anim = node.hasAttribute?.('data-sheet') ? activeTheme.motion?.sheetOut : activeTheme.motion?.modalOut;
	if (!anim || reducedMotion() || dismissed.has(node)) return { duration: 0 };
	if (!leaving.has(node)) {
		leaving.add(node);
		if ('style' in node && (node as HTMLElement).style) {
			const s = (node as HTMLElement).style;
			s.pointerEvents = 'none';
			s.overflow = 'hidden';
		}
		backdropHide(node, anim.duration);
		playChildren(node, anim, 'forwards');
	}
	return { duration: anim.duration };
}
