import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AppIconId } from './index';

const { isNative, isPluginAvailable, change } = vi.hoisted(() => ({
	isNative: vi.fn(() => false),
	isPluginAvailable: vi.fn(() => true),
	change: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('$lib/capacitor', () => ({ isNative }));
vi.mock('@capacitor/core', () => ({
	Capacitor: { isPluginAvailable },
	registerPlugin: (name: string) => name === 'AppIcon' ? { change } : {}
}));

interface MockElement {
	rel: string;
	type?: string;
	attrs: Record<string, string>;
	setAttribute(k: string, v: string): void;
	getAttribute(k: string): string | null;
}

function createMockElement(rel: string): MockElement {
	const attrs: Record<string, string> = { rel };
	return {
		rel,
		attrs,
		setAttribute(k: string, v: string) {
			attrs[k] = v;
		},
		getAttribute(k: string) {
			return attrs[k] ?? null;
		}
	};
}

describe('App Icons & PWA Manifest management', () => {
	let elements: MockElement[] = [];
	let icons: typeof import('./index');

	function createMockDocument(createElementOverride?: (tag: string) => unknown) {
		return {
			querySelector: (selector: string) => {
				const match = selector.match(/rel="([^"]+)"/);
				if (!match) return null;
				const rel = match[1];
				return elements.find((el) => el.rel === rel) || null;
			},
			createElement: (tag: string) => createElementOverride?.(tag) ?? createMockElement(''),
			head: {
				appendChild: (el: MockElement) => {
					elements.push(el);
					return el;
				}
			}
		};
	}

	beforeEach(async () => {
		vi.resetModules();
		isNative.mockReturnValue(false);
		isPluginAvailable.mockReturnValue(true);
		change.mockClear();
		elements = [];
		vi.stubGlobal('document', createMockDocument());
		icons = await import('./index');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('содержит 3 набора иконок: default, bluer, white', () => {
		expect(icons.APP_ICONS.map((i) => i.id)).toEqual(['default', 'bluer', 'white']);
	});

	it('getAppIcon возвращает правильные данные для каждого id', () => {
		expect(icons.getAppIcon('default').bgColor).toBe('#D9F5FF');
		expect(icons.getAppIcon('default').manifest).toBe('manifest.webmanifest');
		expect(icons.getAppIcon('bluer').bgColor).toBe('#BEE6FF');
		expect(icons.getAppIcon('white').bgColor).toBe('#FFFFFF');
		expect(icons.getAppIcon('unknown' as AppIconId).id).toBe('default');
	});

	it('applyAppIcon обновляет favicon, apple-touch-icon и manifest в DOM', () => {
		icons.applyAppIcon('bluer');

		const fav = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="icon"]');
		const apple = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="apple-touch-icon"]');
		const manifest = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="manifest"]');

		expect(fav?.getAttribute('href')).toContain('icons/fav-bluer.svg');
		expect(fav?.type).toBe('image/svg+xml');
		expect(apple?.getAttribute('href')).toContain('icons/app-bluer-180.png');
		expect(manifest?.getAttribute('href')).toContain('manifest-bluer.webmanifest');
	});

	it('applyAppIcon повторно переключает на white и обратно на default', () => {
		icons.applyAppIcon('white');

		const fav = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="icon"]');
		const manifest = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="manifest"]');

		expect(fav?.getAttribute('href')).toContain('icons/fav-white.svg');
		expect(manifest?.getAttribute('href')).toContain('manifest-white.webmanifest');

		icons.applyAppIcon('default');
		expect(fav?.getAttribute('href')).toContain('icons/fav-default.svg');
		expect(manifest?.getAttribute('href')).toContain('manifest.webmanifest');
	});

	it('isPwa возвращает false в стандартном браузере без standalone', () => {
		expect(icons.isPwa()).toBe(false);
	});

	it('applyAppIcon с custom icon обновляет DOM с data URI и выставляет правильный type', () => {
		const customUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
		icons.applyAppIcon('custom', customUri);

		const fav = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="icon"]');
		const apple = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="apple-touch-icon"]');
		const manifest = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="manifest"]');

		expect(fav?.getAttribute('href')).toBe(customUri);
		expect(fav?.type).toBe('image/png');
		expect(apple?.getAttribute('href')).toBe(customUri);
		const manifestHref = manifest?.getAttribute('href') ?? '';
		expect(manifestHref).toContain('data:application/manifest+json');
		const decoded = JSON.parse(decodeURIComponent(manifestHref.replace('data:application/manifest+json,', '')));
		expect(decoded.theme_color).toBe('#141414');
		expect(decoded.background_color).toBe('#141414');
	});

	it('применяет встроенную иконку в APK и восстанавливает стандартную при сохранённой пользовательской', async () => {
		isNative.mockReturnValue(true);
		icons.applyAppIcon('white');
		await icons.changeNativeAppIcon('white');
		icons.applyAppIcon('custom', 'data:image/png;base64,AAAA');
		icons.applyAppIcon('default');
		isPluginAvailable.mockReturnValue(false);
		icons.applyAppIcon('bluer');
		expect(change.mock.calls).toEqual([[{ name: 'white' }], [{ name: 'default' }]]);
	});

	it('рисует красную точку с вырезом, отменяет устаревший рендер и сохраняет точку при смене иконки', () => {
		const ops: string[] = [];
		const drawCtx = {
			drawImage: vi.fn(),
			beginPath: vi.fn(),
			arc: vi.fn(),
			fill: vi.fn(() => ops.push(drawCtx.globalCompositeOperation)),
			fillStyle: '',
			globalCompositeOperation: 'source-over'
		};
		const pendingImages: Array<{ onload?: () => void; src: string }> = [];

		vi.stubGlobal(
			'document',
			createMockDocument((tag) =>
				tag === 'canvas'
					? { width: 0, height: 0, getContext: () => drawCtx, toDataURL: () => 'data:image/png;base64,BADGED' }
					: undefined
			)
		);
		vi.stubGlobal(
			'Image',
			class {
				onload?: () => void;
				private _src = '';
				set src(v: string) {
					this._src = v;
					pendingImages.push(this);
				}
				get src() {
					return this._src;
				}
			}
		);

		icons.applyAppIcon('default');

		// Отмена: unread -> 1, но до onload сбрасывается в 0
		icons.setUnreadBadge(1);
		expect(pendingImages).toHaveLength(1);
		icons.setUnreadBadge(0);
		pendingImages[0].onload?.();

		const fav = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="icon"]');
		expect(fav?.getAttribute('href')).toContain('icons/fav-default.svg');
		expect(drawCtx.drawImage).not.toHaveBeenCalled();

		// Штатный рендер + прозрачный вырез под точкой; изменение счётчика 1 -> 2 не перезапускает рендер и не дёргает Capacitor
		icons.setUnreadBadge(1);
		icons.setUnreadBadge(2);
		expect(pendingImages).toHaveLength(2);
		pendingImages[1].onload?.();
		expect(drawCtx.drawImage).toHaveBeenCalledTimes(1);
		expect(drawCtx.arc).toHaveBeenCalledTimes(2);
		expect(ops).toEqual(['destination-out', 'source-over']);
		expect(drawCtx.fillStyle).toBe('#e62e3b');
		expect(fav?.type).toBe('image/png');
		expect(fav?.getAttribute('href')).toBe('data:image/png;base64,BADGED');
		expect(change).not.toHaveBeenCalled();

		// Смена иконки при активных непрочитанных сохраняет точку для новой иконки
		icons.applyAppIcon('bluer');
		expect(pendingImages).toHaveLength(3);
		expect(pendingImages[2].src).toContain('icons/fav-bluer.svg');
		pendingImages[2].onload?.();
		expect(fav?.type).toBe('image/png');

		// Повторный цикл 0 -> 1 для той же иконки берёт кэш без повторной загрузки Image
		icons.setUnreadBadge(0);
		expect(fav?.type).toBe('image/svg+xml');
		expect(fav?.getAttribute('href')).toContain('icons/fav-bluer.svg');
		icons.setUnreadBadge(1);
		expect(pendingImages).toHaveLength(3);
		expect(fav?.getAttribute('href')).toBe('data:image/png;base64,BADGED');

		// Сброс возвращает SVG
		icons.setUnreadBadge(0);
		expect(fav?.type).toBe('image/svg+xml');
		expect(fav?.getAttribute('href')).toContain('icons/fav-bluer.svg');
	});

	it('в PWA обновляет Badging API без точки на favicon, а в нативном приложении не трогает ни то, ни другое', async () => {
		const setAppBadge = vi.fn().mockResolvedValue(undefined);
		const clearAppBadge = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: q === '(display-mode: standalone)' }) });
		vi.stubGlobal('navigator', { setAppBadge, clearAppBadge });

		icons.applyAppIcon('default');
		icons.setUnreadBadge(3);
		icons.setUnreadBadge(5);
		const fav = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="icon"]');
		expect(fav?.getAttribute('href')).toContain('icons/fav-default.svg');
		expect(setAppBadge).toHaveBeenNthCalledWith(1, 3);
		expect(setAppBadge).toHaveBeenNthCalledWith(2, 5);

		icons.setUnreadBadge(0);
		expect(clearAppBadge).toHaveBeenCalledTimes(1);

		vi.unstubAllGlobals();
		vi.stubGlobal('document', createMockDocument());
		isNative.mockReturnValue(true);

		icons.applyAppIcon('bluer');
		icons.setUnreadBadge(5);
		const nativeFav = (globalThis.document as unknown as { querySelector: (s: string) => MockElement | null }).querySelector('link[rel="icon"]');
		expect(nativeFav?.getAttribute('href')).toContain('icons/fav-bluer.svg');
		expect(setAppBadge).toHaveBeenCalledTimes(2);
	});
});
