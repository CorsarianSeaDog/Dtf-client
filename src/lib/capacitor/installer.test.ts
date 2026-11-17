import { describe, it, expect } from 'vitest';
import { formatMegabytes, progressPercent } from './installer';

describe('installer', () => {
	it('считает проценты и не ломается без размера файла', () => {
		expect(progressPercent({ loaded: 25, total: 100 })).toBe(25);
		expect(progressPercent({ loaded: 150, total: 100 })).toBe(100);
		expect(progressPercent({ loaded: 25, total: 0 })).toBeNull();
	});

	it('форматирует мегабайты с запятой', () => {
		expect(formatMegabytes(12.4 * 1024 * 1024)).toBe('12,4 МБ');
	});
});
