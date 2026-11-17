/*
 * Универсальный переход между страницами (Recede → Hold → Approach).
 * Старый экран уходит вглубь при ожидании сети (>80мс), при задержке >1.5с плавно размывается и «дышит»,
 * а при готовности нового экрана плавно передает ему фокус.
 * Для быстрых переходов (из кэша) экран не отдаляется, а сразу плавно сменяется (fastDepart + fastApproach).
 * Анимации задаются данными темы (ThemeMotion).
 */

import { activeTheme } from '$lib/themes/index.svelte';
import { fluent, play, playClipped, reducedMotion, type Anim } from '$lib/motion';
import { resumeLazyVideos } from '$lib/actions/lazyVideo';
import { nextPaint } from '$lib/ready';
import { untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';

export interface ClickOrigin {
	rect: DOMRect;
	point: { x: number; y: number };
}

const RECEDE_DELAY = 80; // Задержка перед отдалением старого экрана: быстрые переходы (из кэша) не дёргаются
const SLOW_DELAY = 1500; // Порог перехода в фазу Hold (живое размытие + спиннер)
const FAIL_SAFE_TIMEOUT = 12000; // Предохранитель от вечного зависания при сбое сети
const PEEK_FILL = 180; // Сколько индикатор панели доливается до конца, прежде чем страница выедет

/** Расчётный прогресс ожидания (честного у запроса нет): быстро набирает и замедляется, не доходя до 90% */
export const waitProgress = (ms: number) => 0.9 * (1 - Math.exp(-ms / 1500));

let active = $state(false);
let slow = $state(false);
let receded = false;
let outgoingId = $state<string | null>(null);
let incomingId = $state<string | null>(null);
let incomingHidden = $state(true);
let peeking = $state(false);
let progress = $state(0);

let currentOrigin: ClickOrigin | null = null;
let failSafeTimer: ReturnType<typeof setTimeout> | undefined;

let outgoingScreen: HTMLElement | null = null;
let restoreIncoming: (() => void) | null = null;
let unfreezeOutgoing: (() => void) | null = null;

let currentRecedeAnim: Animation | undefined;
let currentWaitAnim: Animation | undefined;
let currentBreatheAnim: Animation | undefined;
let currentDepartAnim: Animation | undefined;
let currentIncomingAnim: Animation | undefined;
let currentReturnAnim: Animation | undefined;
let currentPeekAnim: Animation | undefined;
let peekEl: HTMLElement | null = null;
let progressRaf = 0;

let transitionEpoch = 0;
let recedeTimer: ReturnType<typeof setTimeout> | undefined;
let slowTimer: ReturnType<typeof setTimeout> | undefined;
let hadHoldBlur = false;

function clearTimers(all = true) {
	if (all && failSafeTimer) {
		clearTimeout(failSafeTimer);
		failSafeTimer = undefined;
	}
	if (recedeTimer) {
		clearTimeout(recedeTimer);
		recedeTimer = undefined;
	}
	if (slowTimer) {
		clearTimeout(slowTimer);
		slowTimer = undefined;
	}
}

/** Проверить, поддерживает ли текущая тема анимацию перехода */
export function shouldTransition(): boolean {
	if (typeof window === 'undefined') return false;
	if (reducedMotion()) {
		console.warn('[reDTF] Переход между страницами пропущен: в системе активен prefers-reduced-motion');
		return false;
	}
	const m = activeTheme.motion;
	return Boolean(m?.recede && m?.approach);
}

/** Запомнить элемент и координаты клика */
export function markOrigin(e: MouseEvent) {
	if (typeof window === 'undefined') return;

	const target = e.currentTarget as HTMLElement | null;
	const rect = target ? target.getBoundingClientRect() : new DOMRect(e.clientX, e.clientY, 0, 0);

	currentOrigin = {
		rect,
		point: { x: e.clientX, y: e.clientY }
	};
}

/**
 * Нижняя граница общей шапки: зафиксированный экран не заходит под неё. Панели экранов шапкой не считаются, иначе экран
 * обрежется по панели соседа. Скрытая шапка (`display: none`) даёт 0
 */
export function headerBottomOf(): number {
	const headerEl = typeof document !== 'undefined' ? document.querySelector('header.header') : null;
	return headerEl ? Math.round(headerEl.getBoundingClientRect().bottom) : 0;
}

/** Временно зафиксировать экран по размерам окна. `headerBottom` задаёт нижнюю границу шапки (0 — заходить под шапку) */
export function freeze(screen: HTMLElement, rect: DOMRect, headerBottom: number): () => void {
	const top = Math.max(rect.top, headerBottom);
	const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
	const prev = {
		position: screen.style.position,
		top: screen.style.top,
		left: screen.style.left,
		width: screen.style.width,
		height: screen.style.height,
		overflow: screen.style.overflow,
		margin: screen.style.margin,
		zIndex: screen.style.zIndex,
		pointerEvents: screen.style.pointerEvents,
		transformOrigin: screen.style.transformOrigin,
		filter: screen.style.filter,
		opacity: screen.style.opacity,
		transform: screen.style.transform,
		willChange: screen.style.willChange
	};

	Object.assign(screen.style, {
		position: 'fixed',
		top: `${top}px`,
		left: `${rect.left}px`,
		width: `${rect.width}px`,
		height: `${winHeight - top}px`,
		overflow: 'hidden',
		margin: '0',
		zIndex: '10',
		pointerEvents: 'none',
		willChange: 'transform, opacity'
	});
	// Запись scrollTop заставляет браузер сразу пересчитать раскладку всей страницы: без сдвига её не трогаем
	if (top !== rect.top) screen.scrollTop = top - rect.top;

	return () => {
		Object.assign(screen.style, prev);
	};
}

/** Запустить переход от старого слоя к новому */
export function startTransition(fromId: string, toId: string, screenEl: HTMLElement) {
	// Страницу открыли поверх ещё едущей: прежний переход обрывается, а его старый экран прячется сразу. Иначе
	// он вернулся бы в поток до смены слоёв, сдвинул новый экран вниз и тот заморозился бы не на своём месте
	cleanup(active);

	if (!shouldTransition()) return;

	active = true;
	slow = false;
	receded = false;
	incomingHidden = true;
	outgoingId = fromId;
	incomingId = toId;
	outgoingScreen = screenEl;
	hadHoldBlur = false;
	if (typeof document !== 'undefined') document.documentElement.setAttribute('data-transitioning', '');

	const headerBottom = headerBottomOf();
	const rect = screenEl.getBoundingClientRect();
	const top = Math.max(rect.top, headerBottom);
	const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
	const visibleHeight = Math.max(100, winHeight - top);

	unfreezeOutgoing = freeze(screenEl, rect, headerBottom);

	// Оптический центр масштабирования по оси глубины Z
	screenEl.style.transformOrigin = `50% ${Math.round(visibleHeight * 0.4)}px`;

	// Предохранитель от зависания при упавшей сети
	failSafeTimer = setTimeout(() => {
		if (active) abortTransition();
	}, FAIL_SAFE_TIMEOUT);

	const motion = activeTheme.motion;

	// Фаза Recede: уход вглубь запускается, только если новый экран не успел открыться за RECEDE_DELAY.
	// Быстрые переходы (из кэша / предзагруженные) не отдаляются и сразу переходят к fastDepart + fastApproach.
	recedeTimer = setTimeout(() => {
		recedeTimer = undefined;
		if (!active || outgoingId !== fromId || !outgoingScreen) return;
		receded = true;
		if (motion?.recede) {
			currentRecedeAnim = play(outgoingScreen, motion.recede, 'forwards');
		}
		if (motion?.peek) startPeek();
	}, RECEDE_DELAY);

	// Таймер Hold: если загрузка дольше SLOW_DELAY
	slowTimer = setTimeout(() => {
		if (!active || outgoingId !== fromId) return;
		slow = true;
		hadHoldBlur = Boolean(motion?.wait);

		// Плавно нарастает размытие
		const waitAnim = motion?.wait;
		if (waitAnim && outgoingScreen) {
			currentWaitAnim = play(outgoingScreen, waitAnim, 'forwards');
			currentWaitAnim?.finished.then(() => {
				if (!active || outgoingId !== fromId || !outgoingScreen) return;
				// Дыхание на чистых transform и opacity
				const breatheAnim = motion?.breathe;
				if (breatheAnim) {
					currentBreatheAnim = play(outgoingScreen, breatheAnim);
				}
			}).catch(() => {});
		}
	}, SLOW_DELAY);
}

/** Показать панель будущей страницы (её рисует layout, пока `peeking`) и запустить расчётный прогресс */
function startPeek() {
	peeking = true;
	progress = 0;
	const start = performance.now();
	const step = (now: number) => {
		progress = waitProgress(now - start);
		progressRaf = requestAnimationFrame(step);
	};
	progressRaf = requestAnimationFrame(step);
}

function stopProgress() {
	if (!progressRaf) return;
	cancelAnimationFrame(progressRaf);
	progressRaf = 0;
}

/** Аттач обёртки панели: выдвигает её анимацией `peek` темы */
export const peekPanel: Attachment<HTMLElement> = (node) => {
	peekEl = node;
	currentPeekAnim = play(node, untrack(() => activeTheme.motion?.peek), 'forwards');
	return () => {
		if (peekEl === node) peekEl = null;
	};
};

/** Сообщить, что входящий слой готов к показу */
export async function incomingReady(layerId: string, incomingScreen: HTMLElement): Promise<void> {
	if (!active || incomingId !== layerId || !outgoingScreen || !activeTheme.motion) {
		return;
	}

	clearTimers(false);

	// Останавливаем дыхание
	if (currentBreatheAnim) {
		currentBreatheAnim.cancel();
		currentBreatheAnim = undefined;
	}

	const isFast = !receded;
	const motion = activeTheme.motion;
	const promises: Promise<unknown>[] = [];
	const epoch = transitionEpoch;

	// Панель ожидания: индикатор доливается до конца, затем страница выезжает с позиции панели вместе с ней
	let peekFrom: number | undefined;
	if (!isFast && peeking && peekEl) {
		stopProgress();
		progress = 1;
		await new Promise((r) => setTimeout(r, PEEK_FILL));
		if (epoch !== transitionEpoch || !peekEl) return;
		peekFrom = Math.round(peekEl.getBoundingClientRect().left);
	}

	// 1. Подготовка и запуск появления нового экрана
	let approachAnim = isFast ? (motion?.fastApproach ?? fluent.fastApproach) : motion?.approach;
	if (approachAnim && peekFrom !== undefined && peekEl) {
		approachAnim = { ...approachAnim, keyframes: [{ transform: `translateX(${peekFrom}px)` }, { transform: 'none' }] };
		currentPeekAnim?.cancel();
		currentPeekAnim = play(peekEl, approachAnim, 'forwards');
	}
	if (approachAnim) {
		const incomingRect = incomingScreen.getBoundingClientRect();
		const visibleTop = Math.max(0, incomingRect.top);
		const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
		const visibleHeight = Math.max(100, winHeight - visibleTop);
		const originY = Math.round(visibleHeight * 0.4);

		incomingScreen.style.zIndex = '30';
		incomingScreen.style.position = 'relative';
		incomingScreen.style.transformOrigin = `50% ${originY}px`;
		incomingScreen.style.willChange = 'transform, opacity';

		let keyframes: Keyframe[] = approachAnim.keyframes.map((kf) => ({ ...kf }));
		if (!isFast && hadHoldBlur && peekFrom === undefined) {
			keyframes = keyframes.map((kf, i, arr) => {
				const progress = i / (arr.length - 1);
				const blur = Math.round(14 * (1 - progress));
				return { ...kf, filter: `blur(${blur}px)` };
			});
		}

		const anim: Anim = {
			keyframes,
			duration: approachAnim.duration,
			easing: approachAnim.easing
		};

		currentIncomingAnim = playClipped(incomingScreen, anim, 'forwards');
		// Сбрасывает и cleanup: отклонённый позже `finished` затёр бы стили, которые экрану выставил следующий переход
		restoreIncoming = () => {
			restoreIncoming = null;
			for (const p of ['z-index', 'position', 'transform-origin', 'will-change', 'filter']) incomingScreen.style.removeProperty(p);
		};
		if (currentIncomingAnim) promises.push(currentIncomingAnim.finished.then(() => restoreIncoming?.(), () => {}));
	}

	// Делаем входящий экран видимым: он уже начал анимацию с 0-го кадра, исключая вспышку
	incomingHidden = false;
	const parentLayer = incomingScreen.closest('[data-layer]') as HTMLElement | null;
	if (parentLayer) {
		parentLayer.style.visibility = 'visible';
	}
	incomingScreen.style.visibility = 'visible';

	// 2. Анимация ухода старого экрана (одновременно с появлением нового)
	if (outgoingScreen) {
		if (isFast) {
			const fastDepartAnim = motion?.fastDepart ?? fluent.fastDepart;
			if (fastDepartAnim) {
				currentRecedeAnim?.cancel();
				currentRecedeAnim = undefined;

				currentDepartAnim = play(outgoingScreen, fastDepartAnim, 'forwards');
				if (currentDepartAnim) promises.push(currentDepartAnim.finished.catch(() => {}));
			}
		} else if (motion?.depart) {
			try {
				currentRecedeAnim?.commitStyles?.();
				currentWaitAnim?.commitStyles?.();
			} catch {}
			currentRecedeAnim?.cancel();
			currentWaitAnim?.cancel();

			currentDepartAnim = play(outgoingScreen, motion.depart, 'forwards');
			if (currentDepartAnim) promises.push(currentDepartAnim.finished.catch(() => {}));
		}
	}

	await Promise.all(promises);
	if (epoch !== transitionEpoch) return;

	// Завершение перехода
	cleanup(true);
}

/** Отмена перехода при нажатии «Назад» до завершения */
export function abortTransition() {
	if (!active || !outgoingScreen) return;

	const epoch = ++transitionEpoch;
	clearTimers();
	// Возврат начинается с того вида, до которого старый экран успел уйти, а не со скачка на место
	try {
		currentRecedeAnim?.commitStyles?.();
		currentWaitAnim?.commitStyles?.();
		currentBreatheAnim?.commitStyles?.();
	} catch {}
	currentBreatheAnim?.cancel();
	currentRecedeAnim?.cancel();
	currentWaitAnim?.cancel();
	currentDepartAnim?.cancel();
	currentIncomingAnim?.cancel();
	stopProgress();

	if (!receded) {
		cleanup();
		return;
	}

	// Панель ожидания уезжает обратно за край
	const peekBack = currentPeekAnim;
	if (peekBack) peekBack.reverse();

	// Возврат к нормальному виду старого экрана
	const anim = outgoingScreen.animate([
		{ transform: 'none', opacity: 1, filter: 'none' }
	], {
		duration: 250,
		easing: 'cubic-bezier(0.165, 0.84, 0.44, 1)'
	});
	currentReturnAnim = anim;

	Promise.allSettled([anim.finished, peekBack?.finished]).finally(() => {
		if (epoch !== transitionEpoch) return;
		anim.cancel();
		cleanup();
	});
}

function cleanup(hideOutgoing = false) {
	transitionEpoch++;
	clearTimers();
	currentRecedeAnim?.cancel();
	currentRecedeAnim = undefined;

	currentWaitAnim?.cancel();
	currentWaitAnim = undefined;

	currentBreatheAnim?.cancel();
	currentBreatheAnim = undefined;

	currentDepartAnim?.cancel();
	currentDepartAnim = undefined;

	currentIncomingAnim?.cancel();
	currentIncomingAnim = undefined;
	restoreIncoming?.();

	currentReturnAnim?.cancel();
	currentReturnAnim = undefined;

	stopProgress();
	currentPeekAnim?.cancel();
	currentPeekAnim = undefined;
	peeking = false;
	progress = 0;

	if (outgoingScreen) {
		if (hideOutgoing) {
			const parentLayer = outgoingScreen.closest('[data-layer]') as HTMLElement | null;
			parentLayer?.toggleAttribute('data-hidden', true);
		}
		outgoingScreen.style.removeProperty('filter');
		outgoingScreen.style.removeProperty('transform');
		outgoingScreen.style.removeProperty('opacity');
		outgoingScreen.style.removeProperty('transform-origin');
		outgoingScreen.style.removeProperty('will-change');
	}

	if (unfreezeOutgoing) {
		unfreezeOutgoing();
		unfreezeOutgoing = null;
	}
	if (typeof document !== 'undefined') {
		document.documentElement.removeAttribute('data-transitioning');
		// Видео стартуют кадром позже, чтобы не совпасть с монтированием комментариев
		nextPaint().then(resumeLazyVideos);
	}
	outgoingScreen = null;
	active = false;
	slow = false;
	receded = false;
	incomingHidden = true;
	outgoingId = null;
	incomingId = null;
	currentOrigin = null;
	hadHoldBlur = false;
}

export const pageTransition = {
	get active() {
		return active;
	},
	get slow() {
		return slow;
	},
	get outgoingId() {
		return outgoingId;
	},
	get incomingId() {
		return incomingId;
	},
	get incomingHidden() {
		return incomingHidden;
	},
	/** Панель будущей страницы выдвинута (тема задала `peek`): layout рисует её вместо спиннера */
	get peeking() {
		return peeking;
	},
	/** Расчётный прогресс ожидания для панели, 0…1; 1 — страница готова и сейчас выедет */
	get progress() {
		return progress;
	},
	isOutgoing(id: string) {
		return active && outgoingId === id;
	},
	isIncoming(id: string) {
		return active && incomingId === id;
	}
};
