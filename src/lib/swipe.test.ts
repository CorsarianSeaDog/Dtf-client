import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { glide, progressSwipe, rampUp, settle, spring, swipe } from './swipe';
import { drawerSwipe, provideDrawer } from './drawerSwipe';
import { feedSwipe } from './feedSwipe';
import { activeTheme } from './themes/index.svelte';

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

	it('прогресс открывается броском и закрывается движением в другую сторону', () => {
		const set = vi.fn();
		const commit = vi.fn();
		const gesture = progressSwipe({ width: () => 400, set, commit });
		gesture.begin();
		gesture.move(30);
		gesture.end(30, 0.8);
		vi.runAllTimers();
		expect(set).toHaveBeenLastCalledWith(1);
		expect(commit).toHaveBeenLastCalledWith(1);
		gesture.begin();
		gesture.move(-200);
		gesture.end(-200, 0);
		vi.runAllTimers();
		expect(set).toHaveBeenLastCalledWith(0);
		expect(commit).toHaveBeenLastCalledWith(0);
	});

	it('отмена возвращает к исходному концу, а уничтожение не выполняет отложенное действие', () => {
		const set = vi.fn();
		const commit = vi.fn();
		const gesture = progressSwipe({ width: () => 400, set, commit });
		gesture.animate(1);
		vi.runAllTimers();
		gesture.begin();
		gesture.move(-300);
		gesture.end(-300, null);
		vi.runAllTimers();
		expect(set).toHaveBeenLastCalledWith(1);
		commit.mockClear();
		gesture.animate(0);
		const { resume } = gesture.grab()!;
		gesture.destroy();
		resume();
		vi.runAllTimers();
		expect(set).toHaveBeenLastCalledWith(0);
		expect(commit).not.toHaveBeenCalled();
	});

	it('новая цель кнопки отменяет прежний подхваченный доезд', () => {
		const set = vi.fn();
		const commit = vi.fn();
		const gesture = progressSwipe({ width: () => 400, set, commit });
		gesture.animate(1);
		vi.advanceTimersByTime(80);
		const { resume } = gesture.grab()!;
		gesture.animate(0);
		resume();
		vi.runAllTimers();
		expect(set).toHaveBeenLastCalledWith(0);
		expect(commit.mock.calls).toEqual([[0]]);
	});

	it('уменьшенное движение сразу ставит конечный прогресс без кадров', () => {
		vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
		const set = vi.fn();
		const commit = vi.fn();
		const gesture = progressSwipe({ width: () => 400, set, commit });
		gesture.animate(1);
		expect(set).toHaveBeenLastCalledWith(1);
		expect(commit.mock.calls).toEqual([[1]]);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('swipe', () => {
	const pointer = (type: string, x = 100, pointerType = 'touch') => Object.assign(new Event(type), {
		pointerType, pointerId: 1, isPrimary: true, clientX: x, clientY: 100
	});
	const node = () => Object.assign(new EventTarget(), { closest: vi.fn((): Element | null => null) }) as unknown as HTMLElement;
	const hooks = () => ({
		start: vi.fn(() => true), begin: vi.fn(() => true), move: vi.fn(), end: vi.fn(),
		grab: vi.fn(), destroy: vi.fn()
	});
	beforeEach(() => {
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		vi.stubGlobal('innerWidth', 1200);
		vi.spyOn(activeTheme, 'gestures', 'get').mockReturnValue(true);
	});

	it('поля ввода, край экрана и запрет потребителя не подхватывают доезд', () => {
		const el = node(), h = hooks();
		const detach = swipe(h)(el);
		vi.mocked(el.closest).mockReturnValue({} as Element);
		el.dispatchEvent(pointer('pointerdown'));
		expect(h.start).not.toHaveBeenCalled();
		expect(h.grab).not.toHaveBeenCalled();
		vi.mocked(el.closest).mockReturnValue(null);
		el.dispatchEvent(pointer('pointerdown', 1));
		expect(h.grab).not.toHaveBeenCalled();
		h.start.mockReturnValue(false);
		el.dispatchEvent(pointer('pointerdown'));
		expect(h.grab).not.toHaveBeenCalled();
		if (typeof detach === 'function') detach();
	});

	it('короткое касание панели или ленты удерживает доезд кнопки и сохраняет его цель', () => {
		vi.stubGlobal('window', { innerWidth: 390 });
		const set = vi.fn();
		const commit = vi.fn();
		const menu = provideDrawer({ width: () => 300, set, commit });
		const panel = node();
		const track = Object.assign(node(), { style: {} });
		const detachPanel = drawerSwipe(() => false)(panel);
		const detachTrack = feedSwipe({
			enabled: () => true, current: () => 'new', slot: () => null, scrollOf: () => 0, commit: vi.fn()
		})(track);

		try {
			for (const [open, surface] of [[true, panel], [false, track]] as const) {
				menu.animate(open);
				vi.advanceTimersByTime(32);
				const held = set.mock.lastCall?.[0];
				expect(held).toBeGreaterThan(0);
				expect(held).toBeLessThan(1);
				surface.dispatchEvent(pointer('pointerdown'));
				if (!open && typeof detachPanel === 'function') detachPanel();
				vi.runAllTimers();
				expect(set).toHaveBeenLastCalledWith(held);
				surface.dispatchEvent(pointer('pointerup'));
				vi.runAllTimers();
				expect(set).toHaveBeenLastCalledWith(Number(open));
			}
			expect(commit.mock.calls).toEqual([[true], [false]]);
		} finally {
			if (typeof detachTrack === 'function') detachTrack();
			menu.destroy();
		}
	});

	it('горизонтальное движение подхватывает панель без скачка и заново выбирает цель', () => {
		const el = node();
		const set = vi.fn();
		const commit = vi.fn();
		const gesture = progressSwipe({ width: () => 400, set, commit });
		const detach = swipe({ ...gesture, start: () => true })(el);
		gesture.begin();
		gesture.move(180);
		const oldFinish = gesture.end(180, 0);
		vi.advanceTimersByTime(32);
		const held = set.mock.lastCall?.[0];
		el.dispatchEvent(pointer('pointerdown', 300));
		oldFinish();
		expect(commit).not.toHaveBeenCalled();
		el.dispatchEvent(pointer('pointermove', 285));
		vi.advanceTimersByTime(16);
		expect(set).toHaveBeenLastCalledWith(held);
		el.dispatchEvent(pointer('pointermove', 90));
		el.dispatchEvent(pointer('pointerup', 90));
		vi.runAllTimers();
		oldFinish();
		expect(set).toHaveBeenLastCalledWith(0);
		expect(commit.mock.calls).toEqual([[0]]);
		if (typeof detach === 'function') detach();
	});

	it('без подхвата завершает прежний доезд до подготовки следующего жеста', () => {
		const el = node();
		let selected = false;
		const finish = vi.fn(() => selected = false);
		const detach = swipe({
			start: () => selected = true,
			begin: () => true,
			move: () => {},
			end: () => finish
		})(el);
		el.dispatchEvent(pointer('pointerdown'));
		el.dispatchEvent(pointer('pointermove', 200));
		el.dispatchEvent(pointer('pointerup', 200));
		el.dispatchEvent(pointer('pointerdown'));
		expect(finish).toHaveBeenCalledOnce();
		expect(selected).toBe(true);
		if (typeof detach === 'function') detach();
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
