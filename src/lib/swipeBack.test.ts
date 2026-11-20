import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	closeOverlay: vi.fn(),
	overlays: [] as { id: string; type: string; presentation: 'page' | 'modal' | 'fullscreen' }[]
}));

vi.mock('svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('svelte')>()),
	flushSync: (fn?: () => void) => fn?.()
}));

vi.mock('$app/state', () => ({
	page: {
		get state() {
			return { overlays: mocks.overlays };
		}
	}
}));

vi.mock('./navigation', () => ({
	closeOverlay: mocks.closeOverlay
}));

import { getBackDriver } from './capacitor/back';
import { ease } from './motion';
import { settings } from './storage/settings.svelte';
import { predictiveBackFrame, predictiveBackSpan, predictiveCommitKeyframes, swipeBack, swipeBackGesture } from './swipeBack.svelte';
import { activeTheme } from './themes/index.svelte';

function makeStyle() {
	const bag: Record<string, string> = {};
	return Object.assign(bag, {
		removeProperty(prop: string) {
			delete bag[prop];
			delete bag[prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())];
		}
	});
}

function makeAnimation(deferred = true) {
	let resolve!: () => void;
	const finished = deferred ? new Promise<void>((r) => (resolve = r)) : Promise.resolve();
	const anim = {
		finished,
		cancel: vi.fn(() => resolve?.()),
		finish: vi.fn(() => resolve?.())
	};
	return { anim, resolve: () => resolve?.() };
}

function makeScreen(rect: { top: number; left: number; width: number; height: number }, parentElement: HTMLElement | null) {
	const animations: ReturnType<typeof makeAnimation>[] = [];
	const style = makeStyle();
	const el = {
		style,
		scrollTop: 0,
		parentElement,
		getBoundingClientRect: () => rect as DOMRect,
		after: vi.fn(),
		animate: vi.fn(() => {
			const created = makeAnimation(true);
			animations.push(created);
			return created.anim;
		})
	} as unknown as HTMLElement;
	return { el, style, animations };
}

describe('predictiveBack math', () => {
	it('ограничивает дистанцию превью на узких и широких экранах', () => {
		expect(predictiveBackSpan(200)).toBe(220);
		expect(predictiveBackSpan(390)).toBeCloseTo(253.5, 5);
		expect(predictiveBackSpan(1280)).toBe(360);
	});

	it.each(['slide', 'material', 'zoom'] as const)('%s: в начале нулевой сдвиг, умеренный отклик, на большом ходе не уводит страницу до конца', (kind) => {
		const zero = predictiveBackFrame(kind, 0, 1, 390, true);
		expect(zero.progress).toBe(0);
		expect(zero.top.shiftX).toBe(0);
		expect(zero.top.scale).toBe(1);
		expect(zero.top.opacity).toBe(1);
		expect(zero.top.radius).toBe(0);
		expect(zero.top.blur).toBe(0);
		if (kind === 'zoom') expect(zero.under.opacity).toBe(0);

		const early = predictiveBackFrame(kind, 60, 1, 390, true);
		expect(early.progress).toBeGreaterThan(0);
		expect(early.progress).toBeLessThan(0.4);

		const max = predictiveBackFrame(kind, 2000, 1, 390, true);
		expect(max.progress).toBe(1);
		expect(Math.abs(max.top.shiftX)).toBeLessThan(390 * 0.3);
		expect(max.top.scale).toBeGreaterThanOrEqual(0.88);
		expect(max.top.opacity).toBeGreaterThan(0.5);

		const rightEdge = predictiveBackFrame(kind, 120, -1, 390, true);
		const leftEdge = predictiveBackFrame(kind, 120, 1, 390, true);
		expect(rightEdge.top.shiftX).toBeCloseTo(-leftEdge.top.shiftX, 5);
		expect(rightEdge.under.shiftX).toBeCloseTo(-leftEdge.under.shiftX, 5);
	});

	it('material: карточка со скруглением не вылезает за противоположный край экрана', () => {
		for (const width of [360, 390, 768, 1280]) {
			const frame = predictiveBackFrame('material', 500, 1, width);
			expect(width * (1 - frame.top.scale) / 2).toBeGreaterThanOrEqual(Math.abs(frame.top.shiftX));
			expect(frame.top.radius).toBeCloseTo(24, 5);
		}
	});

	it('zoom: на больших экранах без сдвига вбок, размытие только при blur = true, dim = 0', () => {
		for (const width of [720, 1280]) {
			for (const side of [1, -1] as const) {
				const frame = predictiveBackFrame('zoom', 180, side, width, true);
				expect(Object.is(frame.top.shiftX, 0)).toBe(true);
				expect(Object.is(frame.under.shiftX, 0)).toBe(true);
			}
		}

		const mobileLeft = predictiveBackFrame('zoom', 180, 1, 390, true);
		const mobileRight = predictiveBackFrame('zoom', 180, -1, 390, true);
		expect(mobileLeft.top.shiftX).toBeGreaterThan(0);
		expect(mobileRight.top.shiftX).toBeCloseTo(-mobileLeft.top.shiftX, 5);

		const noBlur = predictiveBackFrame('zoom', 180, 1, 1280, false);
		expect(noBlur.top.blur).toBe(0);
		expect(noBlur.under.dim).toBe(0);
		expect(noBlur.under.opacity).toBeGreaterThan(0);
		expect(noBlur.under.opacity).toBeLessThan(1);

		const withBlur = predictiveBackFrame('zoom', 180, 1, 1280, true);
		expect(withBlur.top.blur).toBeGreaterThan(0);
		expect(withBlur.top.scale).toBeGreaterThan(noBlur.top.scale);
	});

	it('predictiveCommitKeyframes строит завершение для slide, material и zoom', () => {
		const commit = { duration: 300, easing: ease.out };

		const slideFrame = predictiveBackFrame('slide', 120, 1, 390, true);
		const slideSpec = predictiveCommitKeyframes({ kind: 'slide', commit }, slideFrame, 1, 390);
		expect(slideSpec.top.keyframes.at(-1)?.transform).toBe(`translate3d(${390 + 28}px, 0, 0)`);
		expect(slideSpec.under.keyframes.at(-1)?.transform).toBe('translate3d(0px, 0, 0)');
		expect(slideSpec.dim?.keyframes.at(-1)?.opacity).toBe(0);

		const matFrame = predictiveBackFrame('material', 120, -1, 390);
		const matSpec = predictiveCommitKeyframes({ kind: 'material', commit }, matFrame, -1, 390);
		expect(matSpec.top.keyframes[1]).toMatchObject({ opacity: 0, offset: 0.45 });
		expect(matSpec.under.keyframes.at(-1)?.transform).toBe('translate3d(0px, 0, 0)');
		expect(matSpec.dim?.keyframes.at(-1)?.opacity).toBe(0);

		const matZeroSpec = predictiveCommitKeyframes({ kind: 'material', commit }, predictiveBackFrame('material', 0, 1, 390), 1, 390);
		expect(matZeroSpec.top.keyframes[0].transform).toBe('translate3d(0px, 0, 0) scale(1)');

		const zoomFrame = predictiveBackFrame('zoom', 120, 1, 1280, true);
		const zoomBlurSpec = predictiveCommitKeyframes({ kind: 'zoom', commit, blur: true }, zoomFrame, 1, 1280);
		expect(zoomBlurSpec.top.keyframes[0].transform).toMatch(/^translate3d\(0px, 0, 0\) scale\(/);
		expect(zoomBlurSpec.top.keyframes[1].transform).toBe('translate3d(0px, 0, 0) scale(1.06)');
		expect(zoomBlurSpec.top.keyframes[0].filter).toMatch(/^blur\(/);
		expect(zoomBlurSpec.top.keyframes[1].filter).toBe('blur(12px)');
		expect(zoomBlurSpec.under.keyframes[1]).toEqual({ transform: 'translate3d(0px, 0px, 0) scale(1)', opacity: 1 });
		expect(zoomBlurSpec.dim).toBeUndefined();

		const zoomPlainSpec = predictiveCommitKeyframes({ kind: 'zoom', commit, blur: false }, zoomFrame, 1, 1280);
		expect(zoomPlainSpec.top.keyframes[0].filter).toBeUndefined();
		expect(zoomPlainSpec.top.keyframes[1].filter).toBeUndefined();

		const zoomMobileFrame = predictiveBackFrame('zoom', 120, -1, 390, false);
		const zoomMobileSpec = predictiveCommitKeyframes({ kind: 'zoom', commit, blur: false }, zoomMobileFrame, -1, 390);
		expect(zoomMobileSpec.top.keyframes[1].transform).toBe(`translate3d(${-Math.min(390 * 0.06, 28)}px, 0, 0) scale(1.04)`);
	});
});

describe('swipeBackGesture (predictive back на широком экране)', () => {
	let detach: (() => void) | undefined;
	let reduced = false;
	let rootAttrs = new Set<string>();
	let appListeners: Record<string, ((e: any) => void)[]>;
	let holder: HTMLElement;
	let topScreen: ReturnType<typeof makeScreen>;
	let underScreen: ReturnType<typeof makeScreen>;
	let scrollToMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		reduced = false;
		rootAttrs = new Set();
		appListeners = {};
		mocks.closeOverlay.mockReset();
		mocks.overlays = [{ id: 'post-1', type: 'post', presentation: 'page' }];

		holder = { offsetHeight: 1600, style: makeStyle() } as unknown as HTMLElement;
		const topLayer = { parentElement: holder } as unknown as HTMLElement;
		const underLayer = { parentElement: holder } as unknown as HTMLElement;
		topScreen = makeScreen({ top: -60, left: 320, width: 640, height: 1400 }, topLayer);
		underScreen = makeScreen({ top: -60, left: 260, width: 760, height: 2400 }, underLayer);

		scrollToMock = vi.fn();
		vi.stubGlobal('DOMRect', class {
			constructor(public left = 0, public top = 0, public width = 0, public height = 0) {}
		});
		vi.stubGlobal('innerWidth', 1280);
		vi.stubGlobal('innerHeight', 800);
		vi.stubGlobal('scrollY', 120);
		vi.stubGlobal('scrollTo', scrollToMock);
		vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(performance.now()), 16));
		vi.stubGlobal('cancelAnimationFrame', clearTimeout);
		vi.stubGlobal('window', {
			matchMedia: (q: string) => ({ matches: reduced && q.includes('prefers-reduced-motion') }),
			scrollTo: scrollToMock
		});
		vi.stubGlobal('getComputedStyle', () => ({ backgroundColor: 'rgb(242, 242, 242)', marginTop: '0px' }));
		vi.stubGlobal('document', {
			body: {},
			documentElement: {
				dataset: {},
				toggleAttribute: (name: string, force?: boolean) => (force ? (rootAttrs.add(name), true) : (rootAttrs.delete(name), false))
			},
			querySelector: (selector: string) => {
				if (selector === 'header.header') return { getBoundingClientRect: () => ({ bottom: 60 }) };
				if (selector === '[data-layer="post-1"]') return { firstElementChild: topScreen.el };
				if (selector === '[data-layer="__feed__"]') return { firstElementChild: underScreen.el };
				return null;
			},
			createElement: () => ({ style: makeStyle(), remove: vi.fn() })
		});

		activeTheme.set('redtf');
		settings.patch({ predictiveBack: true });

		const appNode = {
			addEventListener: (type: string, fn: (e: any) => void) => {
				(appListeners[type] ??= []).push(fn);
			},
			removeEventListener: vi.fn(),
			closest: () => null
		} as unknown as HTMLElement;

		const attach = swipeBackGesture({ scrollOf: () => 40 });
		const cleanup = attach(appNode);
		detach = typeof cleanup === 'function' ? cleanup : undefined;
	});

	afterEach(() => {
		detach?.();
		detach = undefined;
		settings.patch({ predictiveBack: false });
		activeTheme.set('redtf');
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('работает на широком экране через системный драйвер, не пуская touch-свайп по странице', () => {
		const driver = getBackDriver();
		expect(driver).toBeDefined();

		// Обычный свайп пальцем по странице на 1280px не начинается
		for (const fn of appListeners.pointerdown ?? []) {
			fn({ pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 200, clientY: 200, target: { closest: () => ({ getAttribute: () => 'post-1' }) } });
		}
		for (const fn of appListeners.pointermove ?? []) {
			fn({ pointerId: 1, clientX: 320, clientY: 200, timeStamp: 16 });
		}
		expect(swipeBack.preview).toBeNull();

		// Системный предиктивный жест на широком экране работает
		expect(driver!.start(1)).toBe(true);
		expect(swipeBack.preview).toBe('__feed__');
		expect(rootAttrs.has('data-swiping')).toBe(true);
		expect(holder.style.minHeight).toBe('1600px');
		expect(underScreen.el.scrollTop).toBe(40);
		expect(Number(underScreen.style.opacity)).toBe(0);

		driver!.move(100);
		expect(topScreen.style.transform).toContain('translate3d(0px, 0px, 0) scale(');
		expect(Number(topScreen.style.opacity)).toBeLessThan(1);
		expect(Number(underScreen.style.opacity)).toBeGreaterThan(0);

		// Отмена возвращает всё на место и восстанавливает стили
		driver!.end(false);
		vi.runAllTimers();
		expect(swipeBack.preview).toBeNull();
		expect(rootAttrs.has('data-swiping')).toBe(false);
		expect(holder.style.minHeight).toBeUndefined();
		expect(topScreen.style.position).toBeUndefined();
		expect(underScreen.style.position).toBeUndefined();
	});

	it('при подтверждении доигрывает анимацию ухода и приземляет закрытие через closeOverlay + land', async () => {
		const driver = getBackDriver()!;
		expect(driver.start(-1)).toBe(true);
		driver.move(140);
		driver.end(true);

		expect(topScreen.el.animate).toHaveBeenCalledTimes(1);
		expect(underScreen.el.animate).toHaveBeenCalledTimes(1);
		expect(mocks.closeOverlay).not.toHaveBeenCalled();

		topScreen.animations[0].resolve();
		underScreen.animations[0].resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(swipeBack.swiped('post-1')).toBe(true);
		expect(mocks.closeOverlay).toHaveBeenCalledTimes(1);

		expect(swipeBack.land('__feed__')).toBe(true);
		expect(underScreen.animations[0].anim.cancel).toHaveBeenCalledTimes(1);
		expect(topScreen.animations[0].anim.cancel).not.toHaveBeenCalled();
		expect(swipeBack.preview).toBeNull();
		expect(holder.style.minHeight).toBeUndefined();
		expect(underScreen.style.position).toBeUndefined();
	});

	it('отказывает при prefers-reduced-motion и в теме без backPreview (dtf2022)', () => {
		const driver = getBackDriver()!;
		reduced = true;
		expect(driver.start(1)).toBe(false);

		reduced = false;
		activeTheme.set('dtf2022');
		expect(driver.start(1)).toBe(false);
		expect(swipeBack.preview).toBeNull();
	});
});
