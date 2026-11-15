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

/** Окно появляется. Обёртки display: contents анимировать нельзя, поэтому играем на их детях */
export function modalShow(parent: Element) {
	playChildren(parent, activeTheme.motion?.modalIn);
}

// Svelte вызывает функцию перехода не один раз, а уход должен стартовать однажды
const leaving = new WeakSet<Element>();

/**
 * Svelte-переход ухода (`out:modalHide|global`): подложка и само окно плавно исчезают.
 * Без `modalOut` у темы окно закрывается сразу (`duration: 0`).
 */
export function modalHide(node: Element) {
	const anim = activeTheme.motion?.modalOut;
	if (!anim || reducedMotion()) return { duration: 0 };
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
