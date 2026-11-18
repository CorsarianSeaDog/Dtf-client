import { flushSync } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { page } from '$app/state';
import { setBackDriver, type BackDriver, type BackSide } from './capacitor/back';
import { closeOverlay } from './navigation';
import { freeze, pageTransition } from './pageTransition.svelte';
import { createTension, haptics } from './haptics';
import { DISTANCE, glide, settle, swipe, translate, type Glide } from './swipe';
import { settings } from './storage/settings.svelte';
import { activeTheme } from './themes/index.svelte';
import { getCurrentDevice } from './themes/types';

/*
 * Свайп «назад» по странице-оверлею (пост, профиль, уведомления) в мобильной раскладке. Палец тянет страницу вправо,
 * под ней сразу виден слой, на который вернёмся (страница под ней или лента), на своей прокрутке. После отпускания
 * страница уезжает и оверлей закрывается — или возвращается на место. Закрытие без анимации темы: её роль играет сам жест.
 *
 * Жест идёт от двух источников: касания по странице (края экрана оставлены системе) и системный жест «Назад» из
 * нативной оболочки (`capacitor/back.ts`), который начинается как раз у края. Рисуют они одно и то же.
 *
 * Слой под страницей на время жеста зафиксирован по окну и прокручен внутри себя на ту позицию, на которую встанет окно
 * после закрытия. Закрытие «приземляется», когда layout сменил слои: он вызывает `land` до того, как прокрутит окно.
 */

/** Насколько слой под страницей сдвинут влево в начале жеста, доля ширины */
const PARALLAX = 0.3;
/** Затемнение слоя под страницей в начале жеста: к концу оно уходит */
const DIM = 0.1;
/** Сколько ждать смены слоёв после закрытия, прежде чем всё сбросить */
const LANDING_TIMEOUT = 1500;
/** Скорость доезда, px/мс, когда системный жест подтверждён: у него нет скорости пальца */
const COMMIT_SPEED = 0.5;

export interface SwipeBackOptions {
	/** Прокрутка, на которую слой встанет, когда страницу над ним закроют */
	scrollOf: (layer: string) => number;
}

// Слой, который показан под верхней страницей (жест идёт или закрытие ждёт смены слоёв)
let preview = $state<string | null>(null);
// Закрытая жестом страница: её уход не анимируется
let swiped: string | undefined;
// Жест закрыл страницу и ждёт, когда layout покажет слой под ней
let landing: { layer: string; timer: ReturnType<typeof setTimeout> } | undefined;
// Снять всё, что жест поставил странице и слою под ней
let restorePage: (() => void) | undefined;
let restoreUnder: (() => void) | undefined;

const screenOf = (layer: string) => document.querySelector(`[data-layer="${layer}"]`)?.firstElementChild as HTMLElement | null | undefined;

/** Верхняя страница и слой под ней, если жест сейчас возможен. Под модалкой страница не листается */
function layers() {
	const overlays = page.state.overlays ?? [];
	const top = overlays.at(-1);
	if (!activeTheme.gestures || getCurrentDevice() !== 'mobile' || pageTransition.active || landing || top?.presentation !== 'page') return;
	const below = overlays.at(-2);
	if (below && below.presentation !== 'page') return;
	return { top: top.id, under: below?.id ?? '__feed__' };
}

/** Пока идёт жест, на `:root` стоит `data-swiping`: темы по нему, например, не прячут панели экранов */
const swiping = (on: boolean) => document.documentElement.toggleAttribute('data-swiping', on);

/** Вернуть всё как до жеста. Слой под страницей сначала прячется: иначе на кадр он встанет в поток и толкнёт страницу */
function reset() {
	swiping(false);
	if (landing) clearTimeout(landing.timer);
	landing = undefined;
	flushSync(() => (preview = null));
	restorePage?.();
	restoreUnder?.();
	restorePage = restoreUnder = undefined;
}

export const swipeBack = {
	get preview() {
		return preview;
	},
	/** Закрыта ли эта страница жестом (её уход не анимируется) */
	swiped(layer: string | undefined) {
		return layer !== undefined && layer === swiped;
	},
	/**
	 * Layout показал слой `layer` и сейчас прокрутит окно. Если это приземление жеста, слой под страницей встаёт в поток.
	 * `true` — анимация появления не нужна: ею был сам жест
	 */
	land(layer: string): boolean {
		if (landing?.layer !== layer) return false;
		clearTimeout(landing.timer);
		landing = undefined;
		preview = null;
		swiping(false);
		// Закрытая страница уже скрыта и остаётся за краем экрана до размонтирования
		restoreUnder?.();
		restorePage = restoreUnder = undefined;
		return true;
	}
};

export function swipeBackGesture(options: SwipeBackOptions): Attachment<HTMLElement> {
	let top: HTMLElement | undefined;
	let under: HTMLElement | undefined;
	// Затемнение поверх слоя под страницей. Не filter: тот на каждом кадре требует от GPU отдельного прохода по всему слою
	let dim: HTMLElement | undefined;
	let width = 0;
	let from: { top: string; under: string } | undefined;
	// Куда уходит страница: палец ведёт её только вправо, а системный жест от правого края — влево
	let side: BackSide = 1;
	let position = 0;
	let flight: Glide | undefined;
	let touchFlight = false;
	let systemDragging = false;
	let touching = false;
	const tension = createTension('click');

	/** `x` — насколько страница ушла, по модулю */
	function move(x: number) {
		if (!top || !under || !dim) return;
		position = x = Math.min(width, Math.max(0, x));
		const p = Math.min(1, x / width);
		top.style.transform = translate(side * x);
		under.style.transform = translate(-side * PARALLAX * width * (1 - p));
		dim.style.opacity = `${DIM * (1 - p)}`;
	}

	/** Подготовить слои к жесту в сторону `dir`. Нужны `from` (жест возможен) и оба слоя в документе */
	function open(dir: BackSide) {
		if (!from) return false;
		const a = screenOf(from.top);
		const b = screenOf(from.under);
		if (!a || !b) return false;
		side = dir;
		top = a;
		under = b;
		width = innerWidth;

		// Сначала все чтения раскладки и стилей, потом записи: в кадре, где палец прошёл порог, иначе они пересчитываются по нескольку раз
		const rect = top.getBoundingClientRect();
		const margin = (el: Element) => parseFloat(getComputedStyle(el).marginTop) || 0;
		const bg = (el: Element) => getComputedStyle(el).backgroundColor;
		const transparent = (c: string) => c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
		// У тем между «островами» страницы промежутки: без фона в них был бы виден слой под ней. Короткая страница тянется до низа окна
		const fill = [top, document.body, document.documentElement].map(bg).find((c) => !transparent(c)) ?? '';
		// Слой под страницей встаёт туда, где окажется после закрытия: прокрутка окна сменится на его собственную,
		// а в потоке он займёт место страницы (с поправкой на свой отступ сверху).
		// Не обрезаем по шапке (minTop = 0): при прокрутке слой заходит под топбар и должен быть виден за его блюром
		const y = rect.top - margin(top) + margin(under) + scrollY - options.scrollOf(from.under);
		// Стили ставятся, пока слой скрыт, а прокрутка внутри — когда он показан: ей нужна раскладка
		const unfreeze = freeze(under, new DOMRect(rect.left, y, rect.width, innerHeight), 0);
		// Слой под страницей: страница поднимется над ним своим transform (порядок по DOM)
		under.style.zIndex = '';
		under.style.willChange = 'transform';
		flushSync(() => (preview = from!.under));
		swiping(true);
		under.scrollTop = parseFloat(under.style.top) - y;
		// Затемнение встаёт сразу за слоем: по порядку DOM оно выше слоя и ниже страницы
		const shade = document.createElement('div');
		Object.assign(shade.style, { position: 'fixed', inset: `${under.style.top} 0 0 0`, background: '#000', pointerEvents: 'none', willChange: 'opacity' });
		under.after(shade);
		dim = shade;
		restoreUnder = () => {
			unfreeze();
			shade.remove();
		};

		const style = top.style;
		const prev = { transform: style.transform, willChange: style.willChange, boxShadow: style.boxShadow, backgroundColor: style.backgroundColor, minHeight: style.minHeight };
		Object.assign(style, { willChange: 'transform', boxShadow: '0 0 24px rgba(0, 0, 0, 0.18)', backgroundColor: fill, minHeight: `${Math.max(0, innerHeight - rect.top)}px` });
		const screen = top;
		restorePage = () => Object.assign(screen.style, prev);
		tension.reset();
		// До первого движения слой уже стоит в начале параллакса
		move(0);
		return true;
	}

	/** Довести жест с сдвига `x` до закрытия или возврата. `v` — скорость доезда, px/мс. Возвращает функцию, которая завершает доезд сразу */
	function finish(x: number, close: boolean, v: number) {
		const layer = from?.under;
		const closed = from?.top;
		if (!top || !under || !dim || !layer || !restorePage) return;
		if (close && !tension.armed) haptics.tick();
		const end = close ? width : 0;
		flight?.stop();
		flight = glide(x, end, v, move, () => {
			if (!close) return reset();
			swiped = closed;
			landing = { layer, timer: setTimeout(reset, LANDING_TIMEOUT) };
			closeOverlay();
		});
		return flight.finish;
	}

	const touch = swipe({
		start(e) {
			if (systemDragging || (!touchFlight && flight?.active)) return false;
			from = layers();
			const target = e.target as Element;
			return Boolean(from && target.closest('[data-layer]')?.getAttribute('data-layer') === from.top);
		},
		begin: (dx) => touching = dx >= 0 && open(1),
		move(x) {
			const clamped = Math.max(0, x);
			move(clamped);
			tension.move(clamped, width * DISTANCE);
		},
		end(offset, v) {
			touching = false;
			const x = Math.min(width, Math.max(0, offset));
			touchFlight = true;
			return finish(x, v !== null && settle(x, v, width) === -1, v ?? 0);
		},
		grab() {
			if (!touchFlight || !flight?.active) return;
			const resume = flight.pause();
			touching = true;
			return {
				offset: position,
				resume() {
					touching = false;
					resume();
				}
			};
		},
		destroy() {
			flight?.stop();
			touching = systemDragging = touchFlight = false;
			reset();
		}
	});

	// Системный жест. Ход приходит чаще кадров, поэтому рисуем по кадру последнее положение
	let distance = 0;
	let frame = 0;
	const system: BackDriver = {
		start(dir) {
			if (!settings.value.predictiveBack || touching) return false;
			flight?.finish();
			touchFlight = false;
			from = layers();
			distance = 0;
			return systemDragging = open(dir);
		},
		move(d) {
			distance = Math.min(width, d);
			frame ||= requestAnimationFrame(() => {
				frame = 0;
				move(distance);
				tension.move(distance, width * DISTANCE);
			});
		},
		end(commit) {
			cancelAnimationFrame(frame);
			frame = 0;
			systemDragging = false;
			finish(distance, commit, commit ? COMMIT_SPEED : 0);
		}
	};

	return (node) => {
		setBackDriver(system);
		const stop = touch(node);
		return () => {
			setBackDriver(undefined);
			cancelAnimationFrame(frame);
			if (typeof stop === 'function') stop();
		};
	};
}
