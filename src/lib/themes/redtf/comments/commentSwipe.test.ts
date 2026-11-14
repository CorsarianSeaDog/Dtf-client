import { describe, expect, it } from 'vitest';
import { ARM, DISARM, STEP, isArmed, nudgeAt, slotAt } from './commentSwipe';

describe('slotAt', () => {
	it('действия идут вниз от ответа по шагу, вверх — остаётся ответ', () => {
		expect(slotAt(0, 0, 2)).toBe(0);
		expect(slotAt(STEP, 0, 2)).toBe(1);
		expect(slotAt(STEP * 2, 0, 2)).toBe(2);
		expect(slotAt(-STEP * 2, 1, 2)).toBe(0);
	});

	it('у границы шага действие не переключается туда-обратно', () => {
		expect(slotAt(STEP * 0.55, 0, 2)).toBe(0);
		expect(slotAt(STEP * 0.45, 1, 2)).toBe(1);
		expect(slotAt(STEP * 0.8, 0, 2)).toBe(1);
	});

	it('за краем колонки остаётся крайнее действие', () => {
		expect(slotAt(STEP * 5, 0, 2)).toBe(2);
		expect(slotAt(STEP * 3, 0, 0)).toBe(0);
	});

	it('корректно переключает действия при движении вниз и обратно вверх', () => {
		let current = 0;
		// Движение вниз
		current = slotAt(STEP, current, 2);
		expect(current).toBe(1);
		current = slotAt(STEP * 2, current, 2);
		expect(current).toBe(2);

		// Движение вверх
		current = slotAt(STEP, current, 2);
		expect(current).toBe(1);
		current = slotAt(0, current, 2);
		expect(current).toBe(0);
	});
});

describe('isArmed', () => {
	it('готовность включается на пороге, а снимается только с запасом', () => {
		expect(isArmed(ARM - 1, false)).toBe(false);
		expect(isArmed(ARM, false)).toBe(true);
		expect(isArmed(ARM - DISARM / 2, true)).toBe(true);
		expect(isArmed(ARM - DISARM - 1, true)).toBe(false);
	});
});

describe('nudgeAt', () => {
	it('выделение тянется к пальцу и упирается, не доходя до соседнего действия', () => {
		expect(nudgeAt(STEP, 1)).toBe(0);
		expect(nudgeAt(STEP + 10, 1)).toBeGreaterThan(0);
		expect(nudgeAt(STEP - 10, 1)).toBeLessThan(0);
		expect(nudgeAt(STEP * 10, 1)).toBeLessThanOrEqual(3);
	});
});
