/*
 * Боковая панель на смартфоне: шапка стоит, а содержимое страницы уезжает вправо, и из-под него поднимаются пункты панели.
 * Нижняя строка на это время уходит вниз. Всё задаётся одним положением от 0 до 1: его ведут палец или доезд,
 * поэтому кнопка меню и свайп выглядят одинаково. Пишутся только transform и opacity: двигает композитор.
 */

/** Насколько содержимое панели отстаёт от ленты в начале, доля его ширины */
const LAG = 0.35;
/** Масштаб содержимого панели в начале: оно поднимается из глубины */
const DEPTH = 0.9;
export function pushDrawer(panel: HTMLElement, items: HTMLElement) {
	let p = 0;
	// Что сдвигается вместе с панелью. Узлы берутся на старте: страницы и строка под ними пересоздаются
	let content: HTMLElement | null = null;
	let bar: HTMLElement | null = null;
	// Размеры не меняются, пока идёт жест или доезд: читаются один раз на старте, иначе каждый кадр заставлял бы браузер пересчитывать раскладку
	let width = 0;
	let barShift = 0;

	return (next: number) => {
		if (p === next) return;
		if (!p) {
			content = document.getElementById('content');
			bar = document.querySelector<HTMLElement>('.mobile-bar-container');
			width = panel.offsetWidth;
			barShift = (bar?.offsetHeight ?? 0) + 24;
			panel.style.visibility = 'visible';
			// Лента ложится поверх панели своим фоном, без тени: граница — только разница фонов
			if (content) Object.assign(content.style, { position: 'relative', zIndex: '2', background: 'var(--bg-main)', willChange: 'transform' });
			if (bar) bar.style.willChange = 'transform';
		}
		p = next;
		if (!p) {
			for (const el of [content, bar]) if (el) Object.assign(el.style, { position: '', zIndex: '', background: '', willChange: '', transform: '' });
			panel.style.visibility = items.style.transform = items.style.opacity = '';
			content = bar = null;
			return;
		}
		if (content) content.style.transform = `translate3d(${p * width}px, 0, 0)`;
		if (bar) bar.style.transform = `translate3d(0, ${p * barShift}px, 0)`;
		items.style.transform = `translate3d(${-(1 - p) * LAG * 100}%, 0, 0) scale(${DEPTH + (1 - DEPTH) * p})`;
		items.style.opacity = `${Math.max(0, p * 1.5 - 0.5)}`;
	};
}
