import { describe, expect, it } from 'vitest';
import { windowRange } from './virtualRows.svelte';

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
