import { describe, it, expect } from 'vitest';
import { computeFramedMargins, computeFramedZoom, parseTranslateX, slideDepthStyle } from './lightbox';

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
});
