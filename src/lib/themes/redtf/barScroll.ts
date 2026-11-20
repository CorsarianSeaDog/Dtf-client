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

/**
 * Прокрутка верхней панелью: с прокрученной страницы — в начало с запоминанием точки,
 * с начала страницы — обратно на запомненную точку. Точка сбрасывается при возврате,
 * смене экрана или когда пользователь перематывает вниз через неё.
 */
export function createTopToggle(onActive?: (active: boolean) => void) {
	let saved = 0;
	let armed = false;
	const clear = () => {
		if (saved === 0) return;
		saved = 0;
		armed = false;
		onActive?.(false);
	};
	return {
		/** Нажатие на панель при текущем `y`: куда прокрутить (`0`, сохранённая точка или `undefined`) */
		tap(y: number): number | undefined {
			if (saved > 0 && (!armed || y < saved)) {
				const target = saved;
				clear();
				return target;
			}
			if (y > 1) {
				const wasActive = saved > 0;
				saved = y;
				armed = false;
				if (!wasActive) onActive?.(true);
				return 0;
			}
		},
		/** Прокрутка окна: сбрасывает точку, только если пользователь ушёл выше и затем пересёк её вниз */
		scroll(y: number) {
			if (saved === 0) return;
			if (!armed) {
				if (y < saved) armed = true;
				else if (y > saved + THRESHOLD) clear();
			} else if (y >= saved) {
				clear();
			}
		},
		reset: clear
	};
}

let stopTopWatch: (() => void) | undefined;

/** Общий для всех панелей переключатель верха; следит за прокруткой, только пока есть точка возврата */
export const topToggle = createTopToggle((active) => {
	if (typeof window === 'undefined') return;
	if (!active) {
		stopTopWatch?.();
		return;
	}
	if (stopTopWatch) return;
	const onScroll = () => topToggle.scroll(scrollY);
	addEventListener('scroll', onScroll, { passive: true });
	stopTopWatch = () => {
		removeEventListener('scroll', onScroll);
		stopTopWatch = undefined;
	};
});

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
