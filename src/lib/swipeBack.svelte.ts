import { flushSync } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { page } from '$app/state';
import { pushBackDriver, type BackDriver, type BackSide } from './capacitor/back';
import { ease, reducedMotion, type BackPreview, type BackPreviewKind, type Timing } from './motion';
import { closeOverlay } from './navigation';
import { freeze, headerBottomOf, pageTransition } from './pageTransition.svelte';
import { createTension, haptics } from './haptics';
import { DISTANCE, gesturesAllowed, glide, settle, swipe, translate, type Glide } from './swipe';
import { settings } from './storage/settings.svelte';
import { activeTheme } from './themes/index.svelte';
import { MOBILE_BREAKPOINT } from './themes/types';

/*
 * Жест «назад» для страниц-оверлеев (пост, профиль, уведомления и др.):
 * 1) Свайп пальцем по странице — только в мобильной раскладке тем с `gestures`, ведёт слой 1:1 за пальцем.
 * 2) Системный жест от края (Android Predictive Back, `capacitor/back.ts`) — на любой ширине экрана (смартфоны,
 *    планшеты, сенсорные десктопы), если у темы задан `motion.backPreview`. При ведении пальца превью лишь
 *    частично приоткрывает предыдущий слой в стиле выбранного перехода (`slide`, `material`, `zoom`) и
 *    доигрывает уход после отпускания.
 *
 * Слой под страницей на время жеста зафиксирован по окну и прокручен внутри себя на ту позицию, на которую встанет окно
 * после закрытия. Закрытие «приземляется», когда layout сменил слои: он вызывает `land` до того, как прокрутит окно.
 */

/** Насколько слой под страницей сдвинут влево в начале свайпа по странице, доля ширины */
const PARALLAX = 0.3;
/** Затемнение слоя под страницей в начале свайпа по странице: к концу оно уходит */
const DIM = 0.1;
/** Сколько ждать смены слоёв после закрытия, прежде чем всё сбросить */
const LANDING_TIMEOUT = 1500;

export interface SwipeBackOptions {
	/** Прокрутка, на которую слой встанет, когда страницу над ним закроют */
	scrollOf: (layer: string) => number;
}

export interface PredictiveFrame {
	progress: number;
	top: { shiftX: number; scale: number; opacity: number; radius: number; blur: number };
	under: { shiftX: number; shiftY: number; scale: number; opacity: number; dim: number };
}

export interface CommitAnimSpec {
	keyframes: Keyframe[];
	options: Timing;
}

/** Расстояние хода пальца, на котором превью предиктивного жеста выходит к полному значению (не уводит экран целиком) */
export const predictiveBackSpan = (viewportWidth: number): number =>
	Math.min(360, Math.max(220, Math.max(1, viewportWidth) * 0.65));

/** Кадр частичного превью при ведении системного жеста «Назад» для разных видов переходов */
export function predictiveBackFrame(
	kind: BackPreviewKind,
	distance: number,
	side: BackSide,
	viewportWidth: number,
	blur = false
): PredictiveFrame {
	const width = Math.max(1, viewportWidth);
	const raw = Math.min(1, Math.max(0, distance) / predictiveBackSpan(width));
	const p = 1 - (1 - raw) * Math.sqrt(1 - raw);

	if (kind === 'slide') {
		const maxShift = Math.min(width * 0.24, 140);
		const maxParallax = Math.min(width * 0.16, 80);
		return {
			progress: p,
			top: { shiftX: side * maxShift * p, scale: 1, opacity: 1, radius: 14 * p, blur: 0 },
			under: { shiftX: -side * maxParallax * (1 - p * 0.55), shiftY: 0, scale: 1, opacity: 1, dim: 0.14 * (1 - p * 0.55) }
		};
	}

	if (kind === 'material') {
		const maxShift = Math.min(width * 0.04, 16);
		return {
			progress: p,
			top: { shiftX: side * maxShift * p, scale: 1 - 0.1 * p, opacity: 1, radius: 24 * p, blur: 0 },
			under: { shiftX: -side * 20 * (1 - p * 0.5), shiftY: 0, scale: 1, opacity: 1, dim: 0.16 * (1 - p * 0.5) }
		};
	}

	// На широких экранах «Глубина» работает только по оси Z, без сдвига вбок
	const shiftX = width > MOBILE_BREAKPOINT ? 0 : side * Math.min(width * 0.04, 18) * p;
	return {
		progress: p,
		top: { shiftX, scale: 1 + (blur ? 0.032 : 0.022) * p, opacity: 1 - 0.36 * p, radius: 0, blur: blur ? 4.5 * p : 0 },
		under: { shiftX: 0, shiftY: 24 * (1 - p * 0.65), scale: 0.975 + 0.015 * p, opacity: 0.55 * p, dim: 0 }
	};
}

const layerTransform = (x: number, y = 0, scale = 1) =>
	scale === 1 && y === 0 ? translate(x) : `translate3d(${x}px, ${y}px, 0) scale(${scale})`;

/** Ключевые кадры финального ухода страницы от показанного кадра превью после отпускания */
export function predictiveCommitKeyframes(
	preview: BackPreview,
	frame: PredictiveFrame,
	side: BackSide,
	viewportWidth: number
): { top: CommitAnimSpec; under: CommitAnimSpec; dim?: CommitAnimSpec } {
	const width = Math.max(1, viewportWidth);
	const { kind, commit, blur } = preview;

	if (kind === 'slide') {
		return {
			top: {
				keyframes: [
					{ transform: layerTransform(frame.top.shiftX, 0, frame.top.scale), borderRadius: `${frame.top.radius}px` },
					{ transform: translate(side * (width + 28)), borderRadius: `${frame.top.radius}px` }
				],
				options: commit
			},
			under: {
				keyframes: [{ transform: layerTransform(frame.under.shiftX, frame.under.shiftY, frame.under.scale) }, { transform: 'translate3d(0px, 0, 0)' }],
				options: commit
			},
			dim: {
				keyframes: [{ opacity: frame.under.dim }, { opacity: 0 }],
				options: commit
			}
		};
	}

	if (kind === 'material') {
		return {
			top: {
				keyframes: [
					{ transform: `translate3d(${frame.top.shiftX}px, 0, 0) scale(${frame.top.scale})`, opacity: 1 },
					{ transform: `translate3d(${frame.top.shiftX + side * 14}px, 0, 0) scale(${frame.top.scale * 0.97})`, opacity: 0, offset: 0.45 },
					{ transform: `translate3d(${frame.top.shiftX + side * 28}px, 0, 0) scale(${frame.top.scale * 0.95})`, opacity: 0 }
				],
				options: commit
			},
			under: {
				keyframes: [{ transform: layerTransform(frame.under.shiftX, frame.under.shiftY, frame.under.scale) }, { transform: 'translate3d(0px, 0, 0)' }],
				options: commit
			},
			dim: {
				keyframes: [{ opacity: frame.under.dim }, { opacity: 0 }],
				options: commit
			}
		};
	}

	const endScale = blur ? 1.06 : 1.04;
	const endShift = width > MOBILE_BREAKPOINT ? 0 : side * Math.min(width * 0.06, 28);
	const startTop: Keyframe = { transform: `translate3d(${frame.top.shiftX}px, 0, 0) scale(${frame.top.scale})`, opacity: frame.top.opacity };
	const endTop: Keyframe = { transform: `translate3d(${endShift}px, 0, 0) scale(${endScale})`, opacity: 0 };
	if (blur) {
		startTop.filter = `blur(${frame.top.blur.toFixed(2)}px)`;
		endTop.filter = 'blur(12px)';
	}

	return {
		top: { keyframes: [startTop, endTop], options: commit },
		under: {
			keyframes: [
				{ transform: layerTransform(frame.under.shiftX, frame.under.shiftY, frame.under.scale), opacity: frame.under.opacity },
				{ transform: 'translate3d(0px, 0px, 0) scale(1)', opacity: 1 }
			],
			options: { duration: Math.round(commit.duration * 1.15), easing: ease.out }
		}
	};
}

// Слой, который показан под верхней страницей (жест идёт или закрытие ждёт смены слоёв)
let preview = $state<string | null>(null);
// Закрытая жестом страница: её уход не анимируется
let swiped: string | undefined;
// Жест закрыл страницу и ждёт, когда layout покажет слой под ней
let landing: { layer: string; timer: ReturnType<typeof setTimeout> } | undefined;
// Снять всё, что жест поставил верхней странице и слою под ней
let restoreTop: (() => void) | undefined;
let restoreUnder: (() => void) | undefined;
let activeCommit: { top?: Animation; under: Animation[]; finish?: () => void } | undefined;

const PREDICTIVE_SHADOW: Record<BackPreviewKind, string> = {
	slide: '0 0 24px rgba(0, 0, 0, 0.18)',
	material: '0 8px 32px rgba(0, 0, 0, 0.22)',
	zoom: ''
};

const screenOf = (layer: string) => document.querySelector(`[data-layer="${layer}"]`)?.firstElementChild as HTMLElement | null | undefined;

function backgroundFillOf(el: Element) {
	const bg = (node: Element) => getComputedStyle(node).backgroundColor;
	const transparent = (c: string) => c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
	return [el, document.body, document.documentElement].map(bg).find((c) => !transparent(c)) ?? '';
}

function createDim(under: HTMLElement, box: Partial<CSSStyleDeclaration>) {
	const shade = document.createElement('div');
	Object.assign(shade.style, { position: 'fixed', background: '#000', pointerEvents: 'none', willChange: 'opacity', ...box });
	under.after(shade);
	return shade;
}

function animateWithFill(el: HTMLElement, spec: CommitAnimSpec): Animation | undefined {
	if (reducedMotion() || typeof el.animate !== 'function') return undefined;
	return el.animate(spec.keyframes, { ...spec.options, fill: 'forwards' });
}

function cancelCommits() {
	if (!activeCommit) return;
	const { top, under } = activeCommit;
	activeCommit = undefined;
	top?.cancel();
	for (const anim of under) anim.cancel();
}

function startLanding(closed: string, layer: string) {
	swiped = closed;
	landing = { layer, timer: setTimeout(reset, LANDING_TIMEOUT) };
	closeOverlay();
}

/** Верхняя страница и слой под ней, если жест сейчас возможен. Под модалкой страница не листается */
function layers(mobile: boolean) {
	const overlays = page.state.overlays ?? [];
	const top = overlays.at(-1);
	if (pageTransition.active || landing || top?.presentation !== 'page') return;
	if (mobile ? !gesturesAllowed(true) : !activeTheme.motion?.backPreview || reducedMotion()) return;
	const below = overlays.at(-2);
	if (below && below.presentation !== 'page') return;
	return { top: top.id, under: below?.id ?? '__feed__' };
}

/** Пока идёт жест, на `:root` стоит `data-swiping`: темы по нему, например, не прячут панели экранов */
const swiping = (on: boolean) => document.documentElement.toggleAttribute('data-swiping', on);

/** Вернуть всё как до жеста. Слой под страницей сначала прячется: иначе на кадр он встанет в поток и толкнёт страницу */
function reset(sync = true) {
	cancelCommits();
	swiped = undefined;
	swiping(false);
	if (landing) clearTimeout(landing.timer);
	landing = undefined;
	if (preview !== null) {
		if (sync) flushSync(() => (preview = null));
		else preview = null;
	}
	restoreTop?.();
	restoreUnder?.();
	restoreTop = restoreUnder = undefined;
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
		for (const anim of activeCommit?.under ?? []) anim.cancel();
		activeCommit = undefined;
		restoreUnder?.();
		restoreTop = restoreUnder = undefined;
		return true;
	}
};

export function swipeBackGesture(options: SwipeBackOptions): Attachment<HTMLElement> {
	let top: HTMLElement | undefined;
	let under: HTMLElement | undefined;
	// Затемнение поверх слоя под страницей. Не filter: тот на каждом кадре требует от GPU отдельного прохода по всему слою
	let dim: HTMLElement | undefined;
	let activePreview: BackPreview | undefined;
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

	/** `x` — насколько страница ушла, по модулю (для свайпа пальцем по странице) */
	function move(x: number) {
		if (!top || !under || !dim) return;
		position = x = Math.min(width, Math.max(0, x));
		const p = Math.min(1, x / width);
		top.style.transform = translate(side * x);
		under.style.transform = translate(-side * PARALLAX * width * (1 - p));
		dim.style.opacity = `${DIM * (1 - p)}`;
	}

	/** Подготовить слои к свайпу пальцем по странице в сторону `dir` */
	function open(dir: BackSide) {
		if (!from) return false;
		const a = screenOf(from.top);
		const b = screenOf(from.under);
		if (!a || !b) return false;
		swiped = undefined;
		side = dir;
		top = a;
		under = b;
		activePreview = undefined;
		width = innerWidth;

		// Сначала все чтения раскладки и стилей, потом записи: в кадре, где палец прошёл порог, иначе они пересчитываются по нескольку раз
		const rect = top.getBoundingClientRect();
		const margin = (el: Element) => parseFloat(getComputedStyle(el).marginTop) || 0;
		const fill = backgroundFillOf(top);
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
		const shade = createDim(under, { inset: `${under.style.top} 0 0 0` });
		dim = shade;
		restoreUnder = () => {
			unfreeze();
			shade.remove();
		};

		const style = top.style;
		const prev = { transform: style.transform, willChange: style.willChange, boxShadow: style.boxShadow, backgroundColor: style.backgroundColor, minHeight: style.minHeight };
		Object.assign(style, { willChange: 'transform', boxShadow: '0 0 24px rgba(0, 0, 0, 0.18)', backgroundColor: fill, minHeight: `${Math.max(0, innerHeight - rect.top)}px` });
		const screen = top;
		restoreTop = () => Object.assign(screen.style, prev);
		tension.reset();
		// До первого движения слой уже стоит в начале параллакса
		move(0);
		return true;
	}

	/** Довести свайп по странице с сдвига `x` до закрытия или возврата. `v` — скорость доезда, px/мс */
	function finish(x: number, close: boolean, v: number) {
		const layer = from?.under;
		const closed = from?.top;
		if (!top || !under || !dim || !layer || !closed || !restoreTop) return;
		if (close && !tension.armed) haptics.tick();
		const end = close ? width : 0;
		flight?.stop();
		flight = glide(x, end, v, move, () => (close ? startLanding(closed, layer) : reset()));
		return flight.finish;
	}

	function applyPredictive(d: number) {
		if (!top || !under || !activePreview) return;
		position = Math.min(predictiveBackSpan(width), Math.max(0, d));
		const frame = predictiveBackFrame(activePreview.kind, position, side, width, Boolean(activePreview.blur));
		const { top: t, under: u } = frame;

		top.style.transform = layerTransform(t.shiftX, 0, t.scale);
		top.style.opacity = t.opacity < 1 ? `${t.opacity}` : '';
		top.style.filter = t.blur > 0.05 ? `blur(${t.blur.toFixed(2)}px)` : '';
		top.style.borderRadius = t.radius > 0.1 ? `${t.radius.toFixed(1)}px` : '';

		under.style.transform = layerTransform(u.shiftX, u.shiftY, u.scale);
		under.style.opacity = u.opacity < 1 ? `${u.opacity}` : '';
		if (dim) dim.style.opacity = `${u.dim}`;
	}

	function openPredictive(dir: BackSide) {
		const previewSpec = activeTheme.motion?.backPreview;
		if (!from || !previewSpec) return false;
		const a = screenOf(from.top);
		const b = screenOf(from.under);
		if (!a || !b) return false;

		swiped = undefined;
		side = dir;
		top = a;
		under = b;
		activePreview = previewSpec;
		width = innerWidth;
		position = 0;

		const topRect = top.getBoundingClientRect();
		const headerBottom = headerBottomOf();
		const savedTopScroll = scrollY;
		const holder = top.parentElement?.parentElement as HTMLElement | null;
		const holderHeight = holder?.offsetHeight ?? 0;
		const prevMinHeight = holder?.style.minHeight;
		const fill = previewSpec.kind === 'zoom' ? '' : backgroundFillOf(top);
		const origin = previewSpec.kind === 'zoom' ? `50% ${Math.round(Math.max(100, innerHeight - headerBottom) * 0.4)}px` : '50% 50%';

		if (holder && holderHeight > 0) holder.style.minHeight = `${holderHeight}px`;

		const topStyle = top.style;
		const prevTopExtra = {
			backgroundColor: topStyle.backgroundColor,
			boxShadow: topStyle.boxShadow,
			borderRadius: topStyle.borderRadius
		};
		const unfreezeTop = freeze(top, topRect, headerBottom);
		topStyle.zIndex = '20';
		topStyle.transformOrigin = origin;
		topStyle.willChange = previewSpec.kind === 'zoom' && previewSpec.blur ? 'transform, opacity, filter' : 'transform, opacity';
		if (PREDICTIVE_SHADOW[previewSpec.kind]) {
			topStyle.backgroundColor = fill;
			topStyle.boxShadow = PREDICTIVE_SHADOW[previewSpec.kind];
		}

		const prevUnderVisibility = under.style.visibility;
		under.style.visibility = 'hidden';
		flushSync(() => (preview = from!.under));
		const underRect = under.getBoundingClientRect();
		const underY = underRect.top + scrollY - options.scrollOf(from.under);
		under.style.visibility = prevUnderVisibility;

		const unfreezeUnder = freeze(under, new DOMRect(underRect.left, underY, underRect.width, innerHeight), headerBottom);
		under.style.zIndex = '10';
		under.style.transformOrigin = origin;
		under.style.willChange = 'transform, opacity';
		const targetUnderScroll = Math.max(0, parseFloat(under.style.top) - underY);
		if (under.scrollTop !== targetUnderScroll) under.scrollTop = targetUnderScroll;

		const shade = previewSpec.kind === 'zoom'
			? undefined
			: createDim(under, { top: under.style.top, left: under.style.left, width: under.style.width, height: under.style.height, zIndex: '15' });
		dim = shade;

		const frozenTop = top;
		restoreTop = () => {
			unfreezeTop();
			Object.assign(frozenTop.style, prevTopExtra);
			if (Math.abs(scrollY - savedTopScroll) > 1) {
				window.scrollTo({ top: savedTopScroll, left: 0, behavior: 'instant' });
			}
		};
		restoreUnder = () => {
			unfreezeUnder();
			shade?.remove();
			if (holder && holderHeight > 0) holder.style.minHeight = prevMinHeight!;
		};

		swiping(true);
		applyPredictive(0);
		return true;
	}

	function finishPredictive(commit: boolean) {
		const layer = from?.under;
		const closed = from?.top;
		const previewSpec = activePreview;
		if (!top || !under || !layer || !closed || !previewSpec || !restoreTop) return;

		if (!commit) {
			flight?.stop();
			flight = glide(position, 0, 0, applyPredictive, () => {
				activePreview = undefined;
				top = under = dim = undefined;
				reset();
			});
			return;
		}

		haptics.tick();
		const frame = predictiveBackFrame(previewSpec.kind, position, side, width, Boolean(previewSpec.blur));
		const spec = predictiveCommitKeyframes(previewSpec, frame, side, width);
		cancelCommits();

		const topAnim = animateWithFill(top, spec.top);
		const underAnims = [
			animateWithFill(under, spec.under),
			dim && spec.dim ? animateWithFill(dim, spec.dim) : undefined
		].filter((a): a is Animation => Boolean(a));
		const allAnims = topAnim ? [topAnim, ...underAnims] : underAnims;

		activePreview = undefined;
		top = under = dim = undefined;

		let done = false;
		const current: NonNullable<typeof activeCommit> = { top: topAnim, under: underAnims };
		activeCommit = current;

		const complete = () => {
			if (done || activeCommit !== current) return;
			done = true;
			current.finish = undefined;
			startLanding(closed, layer);
		};
		current.finish = () => {
			for (const anim of allAnims) {
				try {
					anim.finish();
				} catch {}
			}
			complete();
		};
		if (allAnims.length === 0) complete();
		else Promise.allSettled(allAnims.map((a) => a.finished)).then(complete);
	}

	function cleanupGesture(sync = false) {
		flight?.stop();
		touching = systemDragging = touchFlight = false;
		activePreview = undefined;
		top = under = dim = undefined;
		reset(sync);
	}

	const touch = swipe({
		mobile: true,
		start(e) {
			if (systemDragging || activeCommit?.finish || (!touchFlight && flight?.active)) return false;
			from = layers(true);
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
		destroy: () => cleanupGesture(false)
	});

	// Системный жест: события уже схлопнуты по кадру в `capacitor/back.ts`
	const system: BackDriver = {
		start(dir) {
			if (!settings.value.predictiveBack || touching) return false;
			flight?.finish();
			touchFlight = false;
			activeCommit?.finish?.();
			if (systemDragging) reset();
			from = layers(false);
			return systemDragging = openPredictive(dir);
		},
		move: applyPredictive,
		end(commit) {
			systemDragging = false;
			finishPredictive(commit);
		}
	};

	return (node) => {
		const releaseBack = pushBackDriver(system);
		const stop = activeTheme.gestures ? touch(node) : undefined;
		return () => {
			releaseBack();
			if (typeof stop === 'function') stop();
			else cleanupGesture(false);
		};
	};
}
