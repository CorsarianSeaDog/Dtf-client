import { describe, it, expect, vi } from 'vitest';
import { backHandlers, getBackDriver, pushBackDriver, type BackDriver } from './back';

function setup(start = true) {
	const driver: BackDriver = { start: vi.fn(() => start), move: vi.fn(), end: vi.fn() };
	const fallback = vi.fn();
	// Экран с плотностью 2: 100 физических пикселей — это 50 css-пикселей
	return { driver, fallback, h: backHandlers(() => driver, fallback, () => 2) };
}

describe('системный жест «Назад»', () => {
	it('у левого края ведёт страницу вправо, у правого влево, и закрывает по отпусканию', () => {
		const left = setup();
		left.h.started({ edge: 'left', touchX: 10 });
		left.h.progressed({ edge: 'left', touchX: 110 });
		left.h.invoked();
		expect(left.driver.start).toHaveBeenCalledWith(1);
		expect(left.driver.move).toHaveBeenLastCalledWith(50);
		expect(left.driver.end).toHaveBeenCalledWith(true);
		expect(left.fallback).not.toHaveBeenCalled();

		const right = setup();
		right.h.started({ edge: 'right', touchX: 1000 });
		right.h.progressed({ edge: 'right', touchX: 900 });
		expect(right.driver.start).toHaveBeenCalledWith(-1);
		expect(right.driver.move).toHaveBeenLastCalledWith(50);
	});

	it('палец назад за точку касания не даёт отрицательного сдвига, отмена возвращает страницу', () => {
		const { driver, h } = setup();
		h.started({ edge: 'left', touchX: 100 });
		h.progressed({ edge: 'left', touchX: 60 });
		h.cancelled();
		expect(driver.move).toHaveBeenLastCalledWith(0);
		expect(driver.end).toHaveBeenCalledWith(false);
	});

	it('без хода (нечего рисовать или нет события старта) закрывает сразу', () => {
		const idle = setup(false);
		idle.h.started({ edge: 'left', touchX: 0 });
		idle.h.progressed({ edge: 'left', touchX: 50 });
		idle.h.invoked();
		expect(idle.driver.move).not.toHaveBeenCalled();
		expect(idle.fallback).toHaveBeenCalledTimes(1);

		const button = setup();
		button.h.invoked();
		expect(button.fallback).toHaveBeenCalledTimes(1);
	});

	it('pushBackDriver складывает драйверы в стек и возвращает предыдущий при снятии', () => {
		const base: BackDriver = { start: vi.fn(() => true), move: vi.fn(), end: vi.fn() };
		const overlay: BackDriver = { start: vi.fn(() => true), move: vi.fn(), end: vi.fn() };
		const releaseBase = pushBackDriver(base);
		try {
			expect(getBackDriver()).toBe(base);
			const releaseOverlay = pushBackDriver(overlay);
			expect(getBackDriver()).toBe(overlay);
			releaseOverlay();
			expect(getBackDriver()).toBe(base);
		} finally {
			releaseBase();
		}
		expect(getBackDriver()).toBeUndefined();
	});

	it('схлопывает частые progressed в один кадр и сбрасывает или применяет хвост в конце жеста', () => {
		const driver: BackDriver = { start: vi.fn(() => true), move: vi.fn(), end: vi.fn() };
		let queued: (() => void) | undefined;
		const cancel = vi.fn(() => (queued = undefined));
		const h = backHandlers(
			() => driver,
			vi.fn(),
			() => 2,
			(cb) => {
				queued = cb;
				return cancel;
			}
		);

		h.started({ edge: 'left', touchX: 0 });
		h.progressed({ edge: 'left', touchX: 40 });
		h.progressed({ edge: 'left', touchX: 120 });
		expect(driver.move).not.toHaveBeenCalled();

		queued?.();
		expect(driver.move).toHaveBeenCalledTimes(1);
		expect(driver.move).toHaveBeenLastCalledWith(60);

		h.progressed({ edge: 'left', touchX: 200 });
		h.invoked();
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(driver.move).toHaveBeenLastCalledWith(100);
		expect(driver.end).toHaveBeenLastCalledWith(true);

		h.started({ edge: 'left', touchX: 0 });
		h.progressed({ edge: 'left', touchX: 80 });
		h.cancelled();
		expect(cancel).toHaveBeenCalledTimes(2);
		expect(driver.move).toHaveBeenCalledTimes(2);
		expect(driver.end).toHaveBeenLastCalledWith(false);
	});
});
