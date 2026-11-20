const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Space', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

function isEditable(target: EventTarget | null): boolean {
	if (!target || typeof target !== 'object') return false;
	const el = target as { tagName?: string; isContentEditable?: boolean };
	const tag = el.tagName?.toUpperCase();
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable);
}

/**
 * Вызывает `onScroll` один раз при первом пользовательском жесте прокрутки
 * (колесо, свайп/касание или клавиши прокрутки вне полей ввода). Возвращает снятие слушателей.
 */
export function watchUserScroll(
	onScroll: () => void,
	options?: { touch?: 'touchmove' | 'touchstart' }
): () => void {
	if (typeof window === 'undefined') return () => {};
	const touch = options?.touch ?? 'touchmove';
	let done = false;
	const stop = () => {
		if (done) return;
		done = true;
		window.removeEventListener('wheel', fire);
		window.removeEventListener(touch, fire);
		window.removeEventListener('keydown', onKeyDown);
	};
	const fire = () => {
		stop();
		onScroll();
	};
	const onKeyDown = (e: KeyboardEvent) => {
		if (!e.ctrlKey && !e.altKey && SCROLL_KEYS.has(e.code) && !isEditable(e.target)) fire();
	};
	window.addEventListener('wheel', fire, { passive: true });
	window.addEventListener(touch, fire, { passive: true });
	window.addEventListener('keydown', onKeyDown, { passive: true });
	return stop;
}
