import { tick } from 'svelte';
import { ease, reducedMotion } from '$lib/motion';

/*
 * Плавное сворачивание и разворачивание ветки (FLIP). Уходящие строки сначала гаснут, потом список меняется,
 * и строки, что остались, переезжают со старого места на новое, а новые проявляются, когда соседи их освободили.
 * Работает с тем, что сейчас в DOM: строки вне окна списка (решение 0015) просто встают на место.
 */

const MOVE = { duration: 300, easing: ease.smooth };
const OUT: Keyframe[] = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(0.98)' }];
const IN: Keyframe[] = [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }];

const rowsOf = (list: HTMLElement) => [...list.children].filter((node): node is HTMLElement => node instanceof HTMLElement && !!node.id);

/** Меняет список (`change`) с анимацией: `leaving` — строки, которые исчезнут */
export async function reflow(list: HTMLElement | undefined, change: () => void, leaving: (node: HTMLElement) => boolean = () => false) {
	if (!list || reducedMotion()) return change();
	const before = new Map(rowsOf(list).map((node) => [node.id, node.getBoundingClientRect().top]));
	const out = rowsOf(list).filter(leaving);
	if (out.length) {
		const fades = out.map((node) => node.animate(OUT, { duration: 150, easing: ease.out, fill: 'forwards' }));
		await Promise.all(fades.map((anim) => anim.finished.catch(() => {})));
	}
	change();
	await tick();
	// Строка, что всё же осталась (список успели поменять иначе), не должна остаться погашенной
	for (const node of out) if (node.isConnected) node.getAnimations().forEach((anim) => anim.cancel());
	for (const node of rowsOf(list)) {
		const old = before.get(node.id);
		if (old === undefined) {
			node.animate(IN, { duration: 240, delay: 90, easing: ease.out, fill: 'backwards' });
			continue;
		}
		const dy = old - node.getBoundingClientRect().top;
		if (Math.abs(dy) > 0.5) node.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], MOVE);
	}
}
