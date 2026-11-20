import type { BackDriver, BackSide } from '$lib/capacitor/back';
import { glide, type Glide } from '$lib/swipe';
import { MOBILE_BREAKPOINT } from '$lib/themes/types';

export interface Size2D {
	x: number;
	y: number;
}

export interface SafeAreaInsets {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

export interface LightboxIcons {
	close?: string;
	zoom?: string;
	arrowPrev?: string;
	arrowNext?: string;
	download?: string;
	check?: string;
}

export const ZERO_INSETS: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

/** Читает системные безопасные отступы из вычисленного padding элемента */
export function readSafeAreaInsets(el?: HTMLElement | null): SafeAreaInsets {
	if (!el || typeof getComputedStyle !== 'function') return ZERO_INSETS;
	const style = getComputedStyle(el);
	return {
		top: parseFloat(style.paddingTop) || 0,
		bottom: parseFloat(style.paddingBottom) || 0,
		left: parseFloat(style.paddingLeft) || 0,
		right: parseFloat(style.paddingRight) || 0
	};
}

/**
 * Симметричные поля вокруг медиа в исходном состоянии (без приближения).
 * PhotoSwipe с нулевым `padding` центрирует кадр в окне и при приближении даёт занять 100% экрана,
 * поэтому отступы по умолчанию считаются здесь и задаются через `initialZoomLevel`.
 */
export function computeFramedMargins(viewport: Size2D, safeArea: SafeAreaInsets = ZERO_INSETS): Size2D {
	const mobile = viewport.x <= MOBILE_BREAKPOINT;
	// На десктопе боковое поле освобождает место под стрелки (16 + 44 + 12), сверху/снизу — под панель и подпись
	const baseX = mobile ? 16 : 72;
	const baseY = 68;
	const safeX = Math.max(0, safeArea.left, safeArea.right);
	const safeY = Math.max(0, safeArea.top, safeArea.bottom);
	return {
		x: Math.min(baseX + safeX, Math.floor(viewport.x * 0.14)),
		y: Math.min(baseY + safeY, Math.floor(viewport.y * 0.18))
	};
}

/**
 * Начальный масштаб медиа с отступами от краёв экрана:
 * - крупные и совпадающие по разрешению с экраном фото не упираются в края и верхнюю панель;
 * - маленькие фото не растягиваются выше 1:1;
 * - при приближении (клик, двойной тап, щипок) PhotoSwipe использует весь экран без полей.
 */
export function computeFramedZoom(
	elementSize: Size2D | null,
	panAreaSize: Size2D | null,
	fit: number,
	safeArea: SafeAreaInsets = ZERO_INSETS
): number {
	if (!elementSize || !panAreaSize || elementSize.x <= 0 || elementSize.y <= 0 || panAreaSize.x <= 0 || panAreaSize.y <= 0) {
		return fit;
	}
	const margins = computeFramedMargins(panAreaSize, safeArea);
	const availW = Math.max(1, panAreaSize.x - margins.x * 2);
	const availH = Math.max(1, panAreaSize.y - margins.y * 2);
	return Math.min(1, fit, availW / elementSize.x, availH / elementSize.y);
}

/** Извлекает смещение X из `translate3d(Xpx, ...)` без чтения layout (getBoundingClientRect) */
export function parseTranslateX(transform: string): number {
	const match = /translate3d\(\s*(-?[\d.]+)/.exec(transform);
	return match ? Number(match[1]) : 0;
}

/**
 * Мягкое отдаление и затухание слайда по мере ухода от центра (в долях ширины слайда).
 * Работает одинаково при свайпе пальцем на телефоне и при пружинном перелистывании на ПК.
 */
export function slideDepthStyle(offsetRatio: number): { scale: number; opacity: number } {
	const t = Math.min(1, Math.abs(offsetRatio));
	if (t < 0.002) return { scale: 1, opacity: 1 };
	return {
		scale: 1 - t * 0.06,
		opacity: 1 - t * 0.35
	};
}

/** Визуальное состояние просмотрщика во время системного жеста Android Predictive Back */
export function predictiveBackState(
	distance: number,
	side: BackSide,
	viewportWidth: number
): { scale: number; shiftX: number; bgOpacity: number } {
	const width = Math.max(1, viewportWidth);
	const clamped = Math.max(0, distance);
	const progress = Math.min(1, clamped / Math.max(160, width * 0.5));
	const eased = 1 - (1 - progress) * (1 - progress);
	return {
		scale: 1 - eased * 0.18,
		shiftX: side * Math.min(width * 0.12, clamped * 0.22),
		bgOpacity: 1 - eased * 0.72
	};
}

/** Пересчитывает масштаб и позицию кадра вокруг центра окна со сдвигом от края жеста */
export function predictiveBackZoomPan(
	startZoom: number,
	startPan: Size2D,
	viewport: Size2D,
	scale: number,
	shiftX: number
): { zoom: number; pan: Size2D } {
	const cx = viewport.x / 2;
	const cy = viewport.y / 2;
	return {
		zoom: startZoom * scale,
		pan: {
			x: cx + (startPan.x - cx) * scale + shiftX,
			y: cy + (startPan.y - cy) * scale
		}
	};
}

export interface LightboxBackTarget {
	readonly element?: HTMLElement | null;
	readonly opener?: { isOpen?: boolean; isClosing?: boolean };
	readonly isDestroying?: boolean;
	readonly animations?: { stopAllPan: () => void };
	readonly currSlide?: {
		currZoomLevel: number;
		pan: Size2D;
		applyCurrentZoomPan: () => void;
	};
	readonly mainScroll: { isShifted: () => boolean };
	readonly viewportSize: Size2D;
	applyBgOpacity: (opacity: number) => void;
	close: () => void;
}

/** Драйвер системного жеста Android Predictive Back для PhotoSwipe */
export function createLightboxBackDriver(
	getTarget: () => LightboxBackTarget | undefined,
	isEnabled: () => boolean
): { driver: BackDriver; stop: (keepPreview?: boolean) => void; finishFlight: () => void } {
	let state:
		| {
				side: BackSide;
				distance: number;
				flight?: Glide;
				startZoom: number;
				startPan: Size2D;
				startUiVisible: boolean;
				viewport: Size2D;
		  }
		| undefined;

	const apply = (d: number) => {
		const target = getTarget();
		if (!state || !target?.currSlide) return;
		state.distance = d;
		const { scale, shiftX, bgOpacity } = predictiveBackState(d, state.side, state.viewport.x);
		const { zoom, pan } = predictiveBackZoomPan(state.startZoom, state.startPan, state.viewport, scale, shiftX);
		target.currSlide.currZoomLevel = zoom;
		target.currSlide.pan.x = pan.x;
		target.currSlide.pan.y = pan.y;
		target.currSlide.applyCurrentZoomPan();
		target.applyBgOpacity(bgOpacity);
		target.element?.classList.toggle('pswp--back-preview', d > 0);
	};

	const stop = (keepPreview = false) => {
		if (state) {
			state.flight?.stop();
			state = undefined;
		}
		if (!keepPreview) getTarget()?.element?.classList.remove('pswp--back-preview');
	};

	const restoreUi = (wasVisible: boolean) => {
		const active = getTarget();
		active?.element?.classList.remove('pswp--back-preview');
		if (wasVisible && active && !active.isDestroying) {
			active.element?.classList.add('pswp--ui-visible');
		}
	};

	const finishFlight = () => {
		state?.flight?.finish();
	};

	const driver: BackDriver = {
		start(side) {
			const target = getTarget();
			if (
				!isEnabled() ||
				!target ||
				!target.opener?.isOpen ||
				target.opener.isClosing ||
				target.isDestroying ||
				!target.currSlide ||
				target.mainScroll.isShifted()
			) {
				return false;
			}
			if (state) {
				if (state.flight) {
					state.flight.finish();
				} else {
					const wasVisible = state.startUiVisible;
					apply(0);
					stop();
					restoreUi(wasVisible);
				}
			}
			target.animations?.stopAllPan();
			const slide = target.currSlide;
			state = {
				side,
				distance: 0,
				startZoom: slide.currZoomLevel,
				startPan: { x: slide.pan.x, y: slide.pan.y },
				startUiVisible: Boolean(target.element?.classList.contains('pswp--ui-visible')),
				viewport: { x: target.viewportSize.x || 1, y: target.viewportSize.y || 1 }
			};
			target.element?.classList.remove('pswp--ui-visible');
			return true;
		},
		move(d) {
			apply(Math.max(0, d));
		},
		end(commit) {
			const target = getTarget();
			if (!state || !target) return;
			const current = state;
			if (commit) {
				// pswp--back-preview снимется уже в destroy без рывка скругления,
				// а PhotoSwipe свернёт кадр прямо от текущей позиции в миниатюру
				state = undefined;
				target.close();
				return;
			}
			current.flight = glide(current.distance, 0, 0, apply, () => {
				if (state === current) state = undefined;
				restoreUi(current.startUiVisible);
			});
		}
	};

	return { driver, stop, finishFlight };
}
