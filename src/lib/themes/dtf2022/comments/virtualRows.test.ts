import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommentRow } from './flatten';
import { VirtualRows, windowRange } from './virtualRows.svelte';

describe('windowRange', () => {
	// Строки высотой 100, 50, 200, 100: верх каждой и вся высота
	const offsets = [0, 100, 150, 350, 450];

	it('берёт строки, которые пересекают отрезок, включая частично видимые', () => {
		expect(windowRange(offsets, 120, 160)).toEqual([1, 3]);
		expect(windowRange(offsets, 0, 100)).toEqual([0, 2]);
		expect(windowRange(offsets, 360, 400)).toEqual([3, 4]);
	});

	it('обрезает отрезок за краями списка', () => {
		expect(windowRange(offsets, -500, 2000)).toEqual([0, 4]);
		expect(windowRange(offsets, 500, 900)).toEqual([4, 4]);
		expect(windowRange([0], 0, 100)).toEqual([0, 0]);
	});
});

describe('VirtualRows heights and scroll anchor', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	function setupVirtual({ scrollY = 200, listTop = -150, childTops = { '1': -20, '2': 40 } } = {}) {
		const listeners = new Map<string, Set<EventListener>>();
		const scrollBy = vi.fn();
		vi.stubGlobal('addEventListener', (type: string, fn: EventListener) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		});
		vi.stubGlobal('removeEventListener', (type: string, fn: EventListener) => {
			listeners.get(type)?.delete(fn);
		});
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			cb(0);
			return 0;
		});
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		vi.stubGlobal('innerHeight', 800);
		const win = { scrollY, scrollBy };
		vi.stubGlobal('window', win);

		let currentTop = { ...childTops };
		const children = Object.keys(currentTop).map((key) => ({
			id: `comment-${key}`,
			getBoundingClientRect: () => ({
				top: currentTop[key as keyof typeof currentTop],
				bottom: currentTop[key as keyof typeof currentTop] + 80
			})
		}));
		const list = {
			parentElement: null,
			children,
			checkVisibility: () => true,
			getBoundingClientRect: () => ({ top: listTop })
		} as unknown as HTMLElement;

		const rows: CommentRow[] = [
			{ key: '1', level: 0, lines: [], owners: [], comment: {} as CommentRow['comment'] },
			{ key: '2', level: 0, lines: [], owners: [], comment: {} as CommentRow['comment'] }
		];
		const vr = new VirtualRows(() => rows, () => null);
		const detach = vr.attach(list);
		return { vr, listeners, scrollBy, win, setChildTop: (k: string, v: number) => { currentTop[k as keyof typeof currentTop] = v; }, detach };
	}

	it('экспортирует и восстанавливает валидные высоты строк', () => {
		const vr = new VirtualRows(() => [], () => null);
		vr.restoreHeights([
			['1', 120],
			['bad', -5],
			['nan', Number.NaN],
			['2', 240]
		]);
		expect(vr.exportHeights()).toEqual([
			['1', 120],
			['2', 240]
		]);
	});

	it('пропускает захват якоря у верха страницы и во время touch-жеста', () => {
		const atTop = setupVirtual({ scrollY: 0, listTop: 100 });
		expect(atTop.vr.captureAnchor()).toBeNull();
		atTop.detach();

		const touched = setupVirtual({ scrollY: 200, listTop: -150 });
		for (const fn of touched.listeners.get('touchstart') ?? []) fn(new Event('touchstart'));
		expect(touched.vr.captureAnchor()).toBeNull();
		for (const fn of touched.listeners.get('touchend') ?? []) fn(new Event('touchend'));
		expect(touched.vr.captureAnchor()).toEqual({ key: '1', top: -20 });
		touched.detach();
	});

	it('компенсирует сдвиг скролла только при |delta| > 1', () => {
		const ctx = setupVirtual({ scrollY: 300, listTop: -120, childTops: { '1': -10, '2': 90 } });
		const anchor = ctx.vr.captureAnchor();
		expect(anchor).toEqual({ key: '1', top: -10 });

		ctx.setChildTop('1', -9.5);
		ctx.vr.restoreAnchor(anchor);
		expect(ctx.scrollBy).not.toHaveBeenCalled();

		ctx.setChildTop('1', 42);
		ctx.vr.restoreAnchor(anchor);
		expect(ctx.scrollBy).toHaveBeenCalledWith({ top: 52, behavior: 'instant' });
		ctx.detach();
	});

	it('пропускает якорь и компенсацию во время инерционной прокрутки до scrollend или таймаута', async () => {
		vi.useFakeTimers();
		const ctx = setupVirtual({ scrollY: 300, listTop: -120, childTops: { '1': -10, '2': 90 } });
		const anchor = ctx.vr.captureAnchor();
		expect(anchor).toEqual({ key: '1', top: -10 });

		// Событие scroll (инерция после touchend) блокирует захват и компенсацию
		for (const fn of ctx.listeners.get('scroll') ?? []) fn(new Event('scroll'));
		expect(ctx.vr.captureAnchor()).toBeNull();
		ctx.setChildTop('1', 40);
		ctx.vr.restoreAnchor(anchor);
		expect(ctx.scrollBy).not.toHaveBeenCalled();

		// После scrollend компенсация снова работает
		for (const fn of ctx.listeners.get('scrollend') ?? []) fn(new Event('scrollend'));
		expect(ctx.vr.captureAnchor()).toEqual({ key: '1', top: 40 });

		// И по таймауту без scrollend инерция также считается завершённой
		for (const fn of ctx.listeners.get('scroll') ?? []) fn(new Event('scroll'));
		expect(ctx.vr.captureAnchor()).toBeNull();
		await vi.advanceTimersByTimeAsync(170);
		expect(ctx.vr.captureAnchor()).toEqual({ key: '1', top: 40 });
		ctx.detach();
	});
});
