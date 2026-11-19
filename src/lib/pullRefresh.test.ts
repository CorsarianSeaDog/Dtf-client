import { describe, expect, it, vi } from 'vitest';
import { providePuller, pullRefresh, THRESHOLD, resist, unresist } from './pullRefresh';
import { activeTheme } from './themes/index.svelte';

describe('resist', () => {
	it('порог достижим обычным ходом пальца, а дальше страница тянется всё туже', () => {
		expect(resist(-50)).toBe(0);
		const reach = [...Array(400).keys()].find((d) => resist(d) >= THRESHOLD)!;
		expect(reach).toBeGreaterThan(100);
		expect(reach).toBeLessThan(180);
		expect(resist(400) - resist(300)).toBeLessThan(resist(100) - resist(0));
		expect(resist(10_000)).toBeLessThan(260);
	});

	it('подхват посреди доезда ставит палец туда, где страница сейчас', () => {
		for (const y of [0, 20, 56, 120]) expect(resist(unresist(y))).toBeCloseTo(y);
	});

	it('субпиксельные значения скролла укладываются в верх страницы', () => {
		for (const y of [0, 0.25, 0.4, 0.5, 0.8, 1, -2]) {
			expect(y <= 1).toBe(true);
		}
		expect(1.5 <= 1).toBe(false);
		expect(2 <= 1).toBe(false);
	});
});

it('отдаёт жест браузеру при нативной прокрутке, а следующее вытягивание можно вернуть вверх', () => {
	const surface = Object.assign(new EventTarget(), { innerWidth: 390 });
	vi.stubGlobal('window', surface);
	vi.stubGlobal('Element', class {});
	vi.stubGlobal('scrollY', 0);
	vi.stubGlobal('requestAnimationFrame', () => 1);
	vi.stubGlobal('cancelAnimationFrame', vi.fn());
	vi.spyOn(activeTheme, 'gestures', 'get').mockReturnValue(true);
	const drag = vi.fn(), close = vi.fn(), refresh = vi.fn(async () => {});
	const stop = providePuller({ grab: () => 0, drag, close, hold: vi.fn() });
	const detach = pullRefresh({ enabled: () => true, refresh })(surface as unknown as HTMLElement);
	function send(type: string, y: number, cancelable = true) {
		const finger = { identifier: 1, clientX: 100, clientY: y };
		const event = Object.assign(new Event(type, { cancelable }), {
			touches: type === 'touchend' ? [] : [finger], changedTouches: [finger]
		});
		surface.dispatchEvent(event);
		return event.defaultPrevented;
	}
	try {
		send('touchstart', 100);
		send('touchmove', 120, false);
		expect(send('touchmove', 300)).toBe(false);
		send('touchend', 300);
		expect(drag).not.toHaveBeenCalled();

		send('touchstart', 100);
		send('touchmove', 120);
		send('touchmove', 300);
		send('touchmove', 290, false);
		expect(close).toHaveBeenCalledOnce();
		send('touchend', 290);

		send('touchstart', 100);
		expect(send('touchmove', 120)).toBe(true);
		expect(send('touchmove', 300)).toBe(true);
		expect(send('touchmove', 100)).toBe(true);
		send('touchend', 100);
		expect(drag).toHaveBeenLastCalledWith(0, false);
		expect(refresh).not.toHaveBeenCalled();
	} finally {
		if (typeof detach === 'function') detach();
		stop();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});
