import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { glide, rampUp, settle, spring } from './swipe';

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(performance.now()), 16));
	vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('доезд жестов', () => {
	it('после паузы доезжает точно в цель и завершает действие один раз', () => {
		const set = vi.fn();
		const done = vi.fn();
		const motion = glide(20, 400, 0.8, set, done);
		vi.advanceTimersByTime(32);
		const frames = set.mock.calls.length;
		const resume = motion.pause();
		vi.advanceTimersByTime(1000);
		expect(set).toHaveBeenCalledTimes(frames);
		resume();
		vi.runAllTimers();
		expect(set).toHaveBeenLastCalledWith(400);
		motion.finish();
		expect(done).toHaveBeenCalledTimes(1);
	});

	it('после остановки остаётся на нарисованном месте и не выполняет действие', () => {
		const set = vi.fn();
		const done = vi.fn();
		const motion = glide(20, 400, 0, set, done);
		vi.advanceTimersByTime(80);
		motion.stop();
		const held = set.mock.lastCall?.[0];
		expect(held).toBeGreaterThan(20);
		expect(held).toBeLessThan(400);
		set.mockClear();
		vi.runAllTimers();
		motion.finish();
		expect(set).not.toHaveBeenCalled();
		expect(done).not.toHaveBeenCalled();
	});

	it('принудительное завершение ставит цель и отменяет остальные кадры', () => {
		const set = vi.fn();
		const done = vi.fn();
		const motion = glide(20, 400, 0, set, done);
		motion.finish();
		vi.runAllTimers();
		expect(set.mock.calls).toEqual([[400]]);
		expect(done).toHaveBeenCalledTimes(1);
	});

});

describe('rampUp', () => {
	it('разгоняет страницу от нуля до пальца плавно и не выходит за границы', () => {
		expect(rampUp(-5)).toBe(0);
		expect(rampUp(0)).toBe(0);
		expect(rampUp(1000)).toBe(1);
		let prev = 0;
		for (let t = 0; t <= 200; t += 5) {
			const k = rampUp(t);
			expect(k).toBeGreaterThanOrEqual(prev);
			prev = k;
		}
		// В начале скорость почти нулевая: первые кадры страница почти не трогается
		expect(rampUp(8)).toBeLessThan(0.02);
	});
});

describe('spring', () => {
	it('стартует с места, доезжает до цели и не перелетает её даже от сильного броска', () => {
		const at = spring(-100, -400, -8);
		expect(at(0)).toBe(-100);
		for (let t = 0; t <= 600; t += 4) expect(at(t)).toBeGreaterThanOrEqual(-400);
		expect(Math.abs(at(400) + 400)).toBeLessThan(0.5);
	});
});

describe('settle', () => {
	const width = 400;

	it('медленный жест доезжает до соседа только после трети ширины', () => {
		expect(settle(100, 0, width)).toBe(0);
		expect(settle(200, 0, width)).toBe(-1);
		expect(settle(-200, 0, width)).toBe(1);
	});

	it('бросок решает сам: по ходу открывает соседа, против хода возвращает', () => {
		expect(settle(30, 0.8, width)).toBe(-1);
		expect(settle(-30, -0.8, width)).toBe(1);
		expect(settle(300, -0.8, width)).toBe(0);
	});

	it('без сдвига остаётся на месте', () => {
		expect(settle(0, 2, width)).toBe(0);
	});
});
