import { describe, expect, it } from 'vitest';
import { searchableQuery } from './search';

describe('searchableQuery', () => {
	it('обрезает пробелы, а слишком короткий запрос считает пустым', () => {
		expect(searchableQuery('  кот ')).toBe('кот');
		expect(searchableQuery(' а ')).toBe('');
		expect(searchableQuery('')).toBe('');
	});
});
