import type { Attachment } from 'svelte/attachments';

/**
 * На сколько прокрутить, чтобы отрезок [top, bottom] оказался в видимой зоне [min, max], как `block: 'nearest'`:
 * помещается — встаёт целиком ближайшим краем, длиннее зоны — закрывает её без пустоты. Уже на месте — 0.
 */
export function revealDelta(top: number, bottom: number, min: number, max: number): number {
	if (bottom - top <= max - min) return top < min ? top - min : bottom > max ? bottom - max : 0;
	return top > min ? top - min : bottom < max ? bottom - max : 0;
}

/**
 * Пока фокус внутри элемента, он держится в видимой части окна: между `scroll-margin-top` сверху и клавиатурой
 * (`visualViewport`) с `scroll-margin-bottom` снизу. Отступы задают фиксированные панели темы.
 * Прокрутка мгновенная и считается от текущей геометрии: сколько бы раз и в каком порядке ни пришли фокус,
 * открытие клавиатуры и рост элемента, итог один, и с собственной докруткой браузера к полю она не спорит.
 * Поле внутри фокусируется с `preventScroll`: двигать окно должен только этот обработчик.
 */
export const keepInView: Attachment<HTMLElement> = (node) => {
	const vv = window.visualViewport;
	let raf = 0;
	// Пользователь сам прокрутил страницу: поле больше не держим (адресная строка Chrome тоже меняет visualViewport),
	// пока он снова не вернётся к нему — фокус, касание или ввод
	let held = true;

	const reveal = () => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => {
			if (!held || !node.contains(document.activeElement)) return;
			const { top, bottom } = node.getBoundingClientRect();
			const style = getComputedStyle(node);
			const viewTop = vv?.offsetTop ?? 0;
			const min = viewTop + (parseFloat(style.scrollMarginTop) || 0);
			const max = viewTop + (vv?.height ?? innerHeight) - (parseFloat(style.scrollMarginBottom) || 0);
			const dy = revealDelta(top, bottom, min, max);
			if (Math.abs(dy) >= 1) scrollBy({ top: dy, behavior: 'instant' });
		});
	};

	const hold = () => {
		held = true;
		reveal();
	};
	const release = () => (held = false);

	// Рост самого элемента: вложения, новые строки, раскрытие
	const observer = new ResizeObserver(reveal);
	observer.observe(node);
	for (const type of ['focusin', 'pointerdown', 'input']) node.addEventListener(type, hold);
	for (const type of ['touchmove', 'wheel']) addEventListener(type, release, { passive: true });
	vv?.addEventListener('resize', reveal);
	// Фокус мог встать раньше, чем подключился обработчик
	reveal();

	return () => {
		cancelAnimationFrame(raf);
		observer.disconnect();
		for (const type of ['focusin', 'pointerdown', 'input']) node.removeEventListener(type, hold);
		for (const type of ['touchmove', 'wheel']) removeEventListener(type, release);
		vv?.removeEventListener('resize', reveal);
	};
};
