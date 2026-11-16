/*
 * Скрытие верхней панели при прокрутке. Решение — чистая функция, слушатель в одном экземпляре на окно:
 * состояние хранит атрибут на `:root`, сдвиг панели делает CSS.
 */

export interface BarScroll {
	hidden: boolean;
	/** Прокрутка на прошлом событии */
	y: number;
	/** Накопленный сдвиг в одну сторону: дрожание пальца не набирает порога */
	run: number;
}

/** Порог сдвига, после которого панель прячется или возвращается */
const THRESHOLD = 24;
/** У начала страницы панель всегда видна */
const TOP = 48;
/** Скачок больше этого — не жест, а смена слоя или якорь: панель показываем */
const JUMP = 600;

export const initialBarScroll = (y = 0): BarScroll => ({ hidden: false, y, run: 0 });

/** Новое состояние панели после прокрутки окна до `y`. `menuOpen` спрашивается, только когда панель пора прятать */
export function nextBarScroll(state: BarScroll, y: number, menuOpen = () => false): BarScroll {
	const delta = y - state.y;
	if (y <= TOP || Math.abs(delta) > JUMP) return initialBarScroll(y);
	const run = Math.sign(delta) === Math.sign(state.run) ? state.run + delta : delta;
	if (run > THRESHOLD && !menuOpen()) return { hidden: true, y, run };
	if (run < -THRESHOLD) return { hidden: false, y, run };
	return { hidden: state.hidden, y, run };
}

let watchers = 0;
let stop: (() => void) | undefined;

/** Включить слежение за прокруткой окна; слушатель один, сколько бы панелей ни просило. Возвращает выключатель */
export function watchBarScroll(): () => void {
	if (watchers++ === 0) {
		let state = initialBarScroll(scrollY);
		const root = document.documentElement;
		const onScroll = () => {
			// Меню панели (поиск, «⋯») открыто: панель остаётся на месте, пока его не закроют
			const next = nextBarScroll(state, scrollY, () => !!document.querySelector('.screen-bar [aria-expanded="true"]'));
			if (next.hidden !== state.hidden) root.toggleAttribute('data-bar-hidden', next.hidden);
			state = next;
		};
		addEventListener('scroll', onScroll, { passive: true });
		stop = () => {
			removeEventListener('scroll', onScroll);
			root.removeAttribute('data-bar-hidden');
		};
	}
	return () => {
		if (--watchers === 0) stop?.();
	};
}
