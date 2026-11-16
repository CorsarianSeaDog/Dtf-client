import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { abortTransition, freeze, incomingReady, pageTransition, shouldTransition, startTransition } from './pageTransition.svelte';
import { fluent } from './motion';
import { activeTheme } from './themes/index.svelte';

describe('pageTransition', () => {
	it('shouldTransition возвращает false в среде без window (SSR / node)', () => {
		expect(shouldTransition()).toBe(false);
	});

	it('shouldTransition возвращает false для темы dtf2022 без motion', () => {
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		activeTheme.set('dtf2022');
		expect(activeTheme.motion).toBeUndefined();
		expect(shouldTransition()).toBe(false);
		vi.unstubAllGlobals();
	});

	it('shouldTransition возвращает true для темы redtf с motion', () => {
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		activeTheme.set('redtf');
		expect(activeTheme.motion).toBeDefined();
		expect(shouldTransition()).toBe(true);
		vi.unstubAllGlobals();
	});

	it('fluent содержит определения fastDepart и fastApproach', () => {
		expect(fluent.fastDepart).toBeDefined();
		expect(fluent.fastDepart?.duration).toBe(300);
		expect(fluent.fastApproach).toBeDefined();
		expect(fluent.fastApproach?.duration).toBe(400);
	});

	it('isOutgoing и isIncoming возвращают false по умолчанию', () => {
		expect(pageTransition.active).toBe(false);
		expect(pageTransition.slow).toBe(false);
		expect(pageTransition.isOutgoing('layer-1')).toBe(false);
		expect(pageTransition.isIncoming('layer-2')).toBe(false);
	});

	it('freeze корректно фиксирует элемент и восстанавливает стили при unfreeze', () => {
		const mockScreen = {
			style: {} as Record<string, string>,
			scrollTop: 0
		} as unknown as HTMLElement;

		const rect = { top: -2944, left: 100, width: 600 } as DOMRect;
		const unfreeze = freeze(mockScreen, rect);

		expect(mockScreen.style.position).toBe('fixed');
		expect(mockScreen.style.top).toBe('0px');
		expect(mockScreen.scrollTop).toBe(2944);

		unfreeze();
		expect(mockScreen.style.position).toBeUndefined();
	});

	it('freeze с headerBottom = 0 позиционирует элемент с top = 0px для показа контента за блюром шапки', () => {
		const mockScreen = {
			style: {} as Record<string, string>,
			scrollTop: 0
		} as unknown as HTMLElement;

		const rect = { top: -450, left: 0, width: 400 } as DOMRect;
		const unfreeze = freeze(mockScreen, rect, 0);

		expect(mockScreen.style.top).toBe('0px');
		expect(mockScreen.scrollTop).toBe(450);

		unfreeze();
	});

	it('freeze с ненулевым headerBottom ограничивает top снизу границей шапки', () => {
		const mockScreen = {
			style: {} as Record<string, string>,
			scrollTop: 0
		} as unknown as HTMLElement;

		const rect = { top: -450, left: 0, width: 400 } as DOMRect;
		const unfreeze = freeze(mockScreen, rect, 60);

		expect(mockScreen.style.top).toBe('60px');
		expect(mockScreen.scrollTop).toBe(510);

		unfreeze();
	});

	describe('отложенный recede (80 мс)', () => {
		function makeScreen(withLayer = false, deferred = false) {
			const style = Object.assign({} as Record<string, string>, {
				removeProperty: vi.fn((prop: string) => {
					delete style[prop];
				})
			});
			const layer = withLayer ? { style: {} as Record<string, string>, toggleAttribute: vi.fn() } : null;
			const resolvers: (() => void)[] = [];
			const animate = vi.fn(() => {
				let resolve!: () => void;
				const finished = deferred
					? new Promise<void>((r) => {
							resolve = r;
							resolvers.push(r);
						})
					: Promise.resolve();
				return {
					finished,
					cancel: vi.fn(() => resolve?.()),
					commitStyles: vi.fn()
				};
			});
			return {
				style,
				scrollTop: 0,
				getBoundingClientRect: () => ({ top: 0, left: 0, width: 390, height: 844 }) as DOMRect,
				closest: () => layer,
				setAttribute: vi.fn(),
				removeAttribute: vi.fn(),
				animate,
				layer,
				resolveAnims: () => resolvers.splice(0).forEach((r) => r())
			} as unknown as HTMLElement & {
				animate: ReturnType<typeof vi.fn>;
				layer: { style: Record<string, string>; toggleAttribute: ReturnType<typeof vi.fn> } | null;
				resolveAnims: () => void;
			};
		}

		beforeEach(() => {
			vi.useFakeTimers();
			vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), innerHeight: 844 });
			vi.stubGlobal('innerHeight', 844);
			vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
				cb(0);
				return 1;
			});
			vi.stubGlobal('document', {
				querySelector: () => null,
				querySelectorAll: () => [],
				documentElement: { dataset: {}, setAttribute: vi.fn(), removeAttribute: vi.fn() }
			});
			activeTheme.set('redtf');
		});

		afterEach(() => {
			vi.useRealTimers();
			vi.unstubAllGlobals();
		});

		it('при готовности быстрее 80 мс не запускает recede и сразу играет fastApproach + fastDepart', async () => {
			const outgoing = makeScreen();
			const incoming = makeScreen();

			startTransition('__feed__', 'layer-1', outgoing);
			expect(outgoing.animate).not.toHaveBeenCalled();

			await incomingReady('layer-1', incoming);

			expect(outgoing.animate).toHaveBeenCalledWith(fluent.fastDepart!.keyframes, expect.objectContaining({ duration: fluent.fastDepart!.duration }));
			expect(incoming.animate).toHaveBeenCalledWith(
				activeTheme.motion!.fastApproach!.keyframes,
				expect.objectContaining({ duration: activeTheme.motion!.fastApproach!.duration })
			);
			expect(pageTransition.active).toBe(false);
		});

		it('при задержке больше 80 мс запускает recede, а затем approach + depart', async () => {
			const outgoing = makeScreen();
			const incoming = makeScreen();

			startTransition('__feed__', 'layer-2', outgoing);
			expect(outgoing.animate).not.toHaveBeenCalled();

			vi.advanceTimersByTime(80);
			expect(outgoing.animate).toHaveBeenCalledWith(fluent.recede!.keyframes, expect.objectContaining({ duration: fluent.recede!.duration }));

			await incomingReady('layer-2', incoming);

			expect(outgoing.animate).toHaveBeenCalledWith(fluent.depart!.keyframes, expect.objectContaining({ duration: fluent.depart!.duration }));
			expect(incoming.animate).toHaveBeenCalledWith(fluent.approach!.keyframes, expect.objectContaining({ duration: fluent.approach!.duration }));
			expect(pageTransition.active).toBe(false);
		});

		it('abortTransition до 80 мс завершает переход без return-анимации и не ставит data-hidden на уходящий слой', () => {
			const outgoing = makeScreen(true);

			startTransition('__feed__', 'layer-3', outgoing);
			abortTransition();

			expect(outgoing.animate).not.toHaveBeenCalled();
			expect(outgoing.layer!.toggleAttribute).not.toHaveBeenCalledWith('data-hidden', true);
			expect(pageTransition.active).toBe(false);
		});

		it('abortTransition во время approach после recede не даёт incomingReady скрыть слой до конца возврата', async () => {
			const outgoing = makeScreen(true, true);
			const incoming = makeScreen(true, true);

			startTransition('__feed__', 'layer-4', outgoing);
			vi.advanceTimersByTime(80);

			const readyPromise = incomingReady('layer-4', incoming);
			// Имитируем «Назад» пока идут анимации approach + depart
			abortTransition();

			// Отменённые анимации разрешают Promise.all в incomingReady, но cleanup(true) не должен сработать раньше returnAnim
			await readyPromise;
			expect(pageTransition.active).toBe(true);
			expect(outgoing.layer!.toggleAttribute).not.toHaveBeenCalledWith('data-hidden', true);

			// Завершается returnAnim
			outgoing.resolveAnims();
			await Promise.resolve();
			await Promise.resolve();

			expect(pageTransition.active).toBe(false);
			expect(outgoing.layer!.toggleAttribute).not.toHaveBeenCalledWith('data-hidden', true);
		});

		it('новый startTransition во время прошлого incomingReady не сбрасывается его завершением', async () => {
			const outgoing = makeScreen(true, true);
			const incoming1 = makeScreen(true, true);
			const outgoing2 = makeScreen(true, true);

			startTransition('__feed__', 'layer-5', outgoing);
			const readyPromise = incomingReady('layer-5', incoming1);

			startTransition('__feed__', 'layer-6', outgoing2);
			await readyPromise;

			expect(pageTransition.active).toBe(true);
			expect(pageTransition.incomingId).toBe('layer-6');
			abortTransition();
		});
	});
});
