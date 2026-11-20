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
