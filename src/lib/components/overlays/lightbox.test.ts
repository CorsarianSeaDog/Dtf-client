import { describe, it, expect, vi } from 'vitest';
import {
	computeFramedMargins,
	computeFramedZoom,
	createLightboxBackDriver,
	parseTranslateX,
	predictiveBackState,
	predictiveBackZoomPan,
	slideDepthStyle,
	type LightboxBackTarget
} from './lightbox';

describe('lightbox framing', () => {
	it('оставляет отступы на десктопе, когда разрешение фото совпадает с экраном', () => {
		const viewport = { x: 1920, y: 1080 };
		const zoom = computeFramedZoom({ x: 1920, y: 1080 }, viewport, 1);

		expect(zoom).toBeLessThan(1);
		expect(Math.round(1920 * zoom)).toBeLessThanOrEqual(viewport.x - 144);
		expect(Math.round(1080 * zoom)).toBeLessThanOrEqual(viewport.y - 136);
	});

	it('учитывает безопасные зоны и оставляет поля на телефоне для скриншота в размер экрана', () => {
		const viewport = { x: 390, y: 844 };
		const safeArea = { top: 36, bottom: 20, left: 0, right: 0 };
		const zoom = computeFramedZoom({ x: 390, y: 844 }, viewport, 1, safeArea);

		expect(zoom).toBeLessThan(1);
		const width = 390 * zoom;
		const height = 844 * zoom;
		expect(viewport.x - width).toBeGreaterThanOrEqual(32);
		expect(viewport.y - height).toBeGreaterThanOrEqual((68 + 36) * 2 - 1);
	});

	it('не растягивает маленькие изображения выше оригинального размера 1:1', () => {
		const zoom = computeFramedZoom({ x: 240, y: 180 }, { x: 1440, y: 900 }, 1);
		expect(zoom).toBe(1);
	});

	it('ограничивает поля на низком альбомном экране, чтобы кадр не схлопывался', () => {
		const margins = computeFramedMargins({ x: 844, y: 320 }, { top: 0, bottom: 0, left: 32, right: 32 });
		expect(margins.y).toBeLessThanOrEqual(Math.floor(320 * 0.18));
		expect(margins.x).toBeLessThanOrEqual(Math.floor(844 * 0.14));
	});

	it('возвращает fit при некорректных размерах', () => {
		expect(computeFramedZoom(null, { x: 1000, y: 800 }, 0.5)).toBe(0.5);
		expect(computeFramedZoom({ x: 0, y: 100 }, { x: 1000, y: 800 }, 0.5)).toBe(0.5);
	});

	it('читает смещение X из translate3d PhotoSwipe', () => {
		expect(parseTranslateX('translate3d(-1280px,0px,0)')).toBe(-1280);
		expect(parseTranslateX('translate3d(420.5px, 0px, 0)')).toBe(420.5);
		expect(parseTranslateX('')).toBe(0);
	});

	it('считает глубину и прозрачность слайда при перелистывании', () => {
		expect(slideDepthStyle(0)).toEqual({ scale: 1, opacity: 1 });
		expect(slideDepthStyle(0.001)).toEqual({ scale: 1, opacity: 1 });

		const mid = slideDepthStyle(0.5);
		expect(mid.scale).toBeCloseTo(0.97, 3);
		expect(mid.opacity).toBeCloseTo(0.825, 3);

		const edge = slideDepthStyle(-1);
		expect(edge.scale).toBeCloseTo(0.94, 3);
		expect(edge.opacity).toBeCloseTo(0.65, 3);

		const far = slideDepthStyle(2);
		expect(far.scale).toBeCloseTo(0.94, 3);
		expect(far.opacity).toBeCloseTo(0.65, 3);
	});

	it('считает отклик predictive back для левого и правого края экрана', () => {
		expect(predictiveBackState(0, 1, 400)).toEqual({ scale: 1, shiftX: 0, bgOpacity: 1 });

		const left = predictiveBackState(100, 1, 400);
		expect(left.scale).toBeLessThan(1);
		expect(left.scale).toBeGreaterThan(0.82);
		expect(left.shiftX).toBeGreaterThan(0);
		expect(left.bgOpacity).toBeLessThan(1);

		const right = predictiveBackState(300, -1, 400);
		expect(right.scale).toBeCloseTo(0.82, 4);
		expect(right.shiftX).toBe(-48);
		expect(right.bgOpacity).toBeCloseTo(0.28, 4);
	});

	it('масштабирует кадр при predictive back вокруг центра экрана без смещения по вертикали', () => {
		const viewport = { x: 400, y: 800 };
		// Центрированный кадр 300x200 -> pan = (50, 300)
		const result = predictiveBackZoomPan(1, { x: 50, y: 300 }, viewport, 0.8, 20);
		expect(result.zoom).toBe(0.8);
		// После масштабирования до 240x160 центр по X сдвинут на +20 -> x = 80 + 20 = 100, центр по Y остался на 400 -> y = 320
		expect(result.pan).toEqual({ x: 100, y: 320 });
	});

	it('драйвер predictive back сохраняет preview-класс до stop при коммите, останавливает pan-анимации и сбрасывает кадр при повторном start', () => {
		const classes = new Set<string>(['pswp--ui-visible']);
		const stopAllPan = vi.fn();
		const target: LightboxBackTarget = {
			element: {
				classList: {
					contains: (c: string) => classes.has(c),
					add: (c: string) => { classes.add(c); },
					remove: (c: string) => { classes.delete(c); },
					toggle: (c: string, force?: boolean) => (force ? (classes.add(c), true) : (classes.delete(c), false))
				}
			} as unknown as HTMLElement,
			opener: { isOpen: true, isClosing: false },
			isDestroying: false,
			animations: { stopAllPan },
			currSlide: {
				currZoomLevel: 1,
				pan: { x: 50, y: 300 },
				applyCurrentZoomPan: vi.fn()
			},
			mainScroll: { isShifted: () => false },
			viewportSize: { x: 400, y: 800 },
			applyBgOpacity: vi.fn(),
			close: vi.fn()
		};

		const back = createLightboxBackDriver(() => target, () => true);
		expect(back.driver.start(1)).toBe(true);
		expect(stopAllPan).toHaveBeenCalledTimes(1);
		expect(classes.has('pswp--ui-visible')).toBe(false);

		back.driver.move(100);
		expect(target.currSlide!.currZoomLevel).toBeLessThan(1);
		expect(classes.has('pswp--back-preview')).toBe(true);

		// Повторный start после прерванного жеста без end откатывает кадр к исходному масштабу 1
		expect(back.driver.start(1)).toBe(true);
		expect(target.currSlide!.currZoomLevel).toBe(1);
		expect(target.currSlide!.pan).toEqual({ x: 50, y: 300 });

		back.driver.move(120);
		back.driver.end(true);
		expect(target.close).toHaveBeenCalledTimes(1);
		// Класс остаётся до destroy (stop), чтобы не дёргать border-radius перед анимацией закрытия
		expect(classes.has('pswp--back-preview')).toBe(true);
		back.stop();
		expect(classes.has('pswp--back-preview')).toBe(false);
	});
});
