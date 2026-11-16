import { tick } from 'svelte';
import { ease, reducedMotion } from '$lib/motion';

/*
 * Плавное сворачивание и разворачивание ветки (FLIP). Уходящие строки сначала гаснут, потом список меняется,
 * и строки, что остались, переезжают со старого места на новое, а новые проявляются, когда соседи их освободили.
 * Работает с тем, что сейчас в DOM: строки, вошедшие снизу в окно списка (решение 0015) при сворачивании, едут вместе с соседями,
 * а если соседей в окне не было (ветка длиннее окна) — из-за нижнего края окна.
 */

const MOVE = { duration: 300, easing: ease.smooth };
const OUT: Keyframe[] = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(0.98)' }];
const IN: Keyframe[] = [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }];

const rowsOf = (list: HTMLElement) => ([...list.children] as HTMLElement[]).filter((node) => !!node.id);

/** Меняет список (`change`) с анимацией: `leaving` — строки, которые исчезнут */
export async function reflow(list: HTMLElement | undefined, change: () => void, leaving: (node: HTMLElement) => boolean = () => false) {
	if (!list || reducedMotion()) return change();
	const out = rowsOf(list).filter(leaving);
	if (out.length) {
		const fades = out.map((node) => node.animate(OUT, { duration: 150, easing: ease.out, fill: 'forwards' }));
		await Promise.all(fades.map((anim) => anim.finished.catch(() => {})));
	}
	const gone = new Set(out);
	const before = new Map<string, number>();
	for (const node of rowsOf(list)) {
		if (!gone.has(node)) before.set(node.id, node.getBoundingClientRect().top);
	}
	// Низ последней строки в DOM: из-за него приедут строки, которых в окне списка ещё не было
	const tail = rowsOf(list).at(-1)?.getBoundingClientRect().bottom ?? 0;
	const h0 = list.offsetHeight;
	// Браузер не должен якорить прокрутку на строках ниже ветки и зажимать скролл у низа страницы до замера FLIP
	list.style.overflowAnchor = 'none';
	list.style.minHeight = `${h0}px`;
	change();
	await tick();
	const rows = rowsOf(list);
	for (const node of rows) node.getAnimations?.().forEach((anim) => anim.cancel());
	let lastDy = 0;
	const moves: [HTMLElement, number][] = [];
	const enters: HTMLElement[] = [];
	for (const node of rows) {
		const old = before.get(node.id);
		if (old === undefined) {
			if (out.length) {
				// Ветка уходила за низ окна списка: соседей снизу в DOM не было, сдвиг считаем от его края
				if (Math.abs(lastDy) <= 0.5) lastDy = tail - node.getBoundingClientRect().top;
				if (Math.abs(lastDy) > 0.5) moves.push([node, lastDy]);
			} else {
				enters.push(node);
			}
			continue;
		}
		const dy = old - node.getBoundingClientRect().top;
		lastDy = dy;
		if (Math.abs(dy) > 0.5) moves.push([node, dy]);
	}
	list.style.removeProperty('min-height');
	list.style.removeProperty('overflow-anchor');
	list.getAnimations?.().forEach((anim) => anim.cancel());
	const h1 = list.offsetHeight;
	const viewport = typeof innerHeight === 'number' ? innerHeight : 0;
	if (Math.abs(h0 - h1) > 0.5 && list.getBoundingClientRect().bottom <= viewport + Math.max(0, h0 - h1)) {
		list.animate({ height: [`${h0}px`, `${h1}px`] }, MOVE);
	}
	for (const node of enters) node.animate(IN, { duration: 240, delay: 90, easing: ease.out, fill: 'backwards' });
	for (const [node, dy] of moves) node.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], MOVE);
}
