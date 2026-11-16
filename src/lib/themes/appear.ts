import { untrack } from 'svelte';
import { play, reducedMotion, type AnimKey } from '$lib/motion';
import { activeTheme } from './index.svelte';

const played = new WeakSet<Element>();
const handlers = new Map<AnimKey, (el: Element) => void>();

/**
 * Аттач `{@attach appear('contentIn')}`: проигрывает анимацию активной темы при появлении элемента.
 * Тема без такой анимации ничего не делает. Смена темы анимацию не перезапускает.
 */
export const appear = (key: AnimKey) => {
	let fn = handlers.get(key);
	if (!fn) {
		fn = (el: Element) => {
			if (played.has(el)) return;
			played.add(el);
			void untrack(() => play(el, activeTheme.motion?.[key]));
		};
		handlers.set(key, fn);
	}
	return fn;
};

/**
 * Svelte-переход ухода `out:disappear|global={'popoverOut'}`: проигрывает анимацию активной темы перед размонтированием.
 * Без анимации у темы или при reduced motion завершается сразу (`duration: 0`).
 * Возвращает функцию, а не объект: объект Svelte запомнил бы и при следующем уходе анимацию не запустил.
 */
export function disappear(node: Element, key: AnimKey) {
	const el = node as HTMLElement;
	return () => {
		const anim = activeTheme.motion?.[key];
		if (!anim || reducedMotion()) return { duration: 0 };
		el.style.pointerEvents = 'none';
		const animation = play(el, anim, 'forwards');
		let moved = false;
		return {
			duration: anim.duration,
			// Уход прервали (узел снова показан): Svelte возвращает его в начало вызовом tick(1, 0), снимаем и нашу анимацию.
			// ponytail: прерывание раньше первого кадра ухода не ловится, по времени его не успеть сделать
			tick: (t: number) => {
				if (t < 1) moved = true;
				else if (moved) {
					animation?.cancel();
					el.style.pointerEvents = '';
				}
			}
		};
	};
}
