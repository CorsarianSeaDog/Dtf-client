import { describe, it, expect } from 'vitest';
import { parseShortcut } from './shortcuts';

describe('parseShortcut', () => {
	it('распознаёт сокращения с пробелом, в том числе неразрывным', () => {
		expect(parseShortcut('## ')).toEqual({ tool: 'header', data: { level: 2 } });
		expect(parseShortcut('### ')).toEqual({ tool: 'header', data: { level: 3 } });
		expect(parseShortcut('- ')).toEqual({ tool: 'list', data: { style: 'unordered' } });
		expect(parseShortcut('1. ')).toEqual({ tool: 'list', data: { style: 'ordered' } });
		expect(parseShortcut('> ')).toEqual({ tool: 'quote', data: {} });
	});

	it('не трогает обычный текст', () => {
		expect(parseShortcut('')).toBeNull();
		expect(parseShortcut(' ')).toBeNull();
		expect(parseShortcut('##')).toBeNull();
		expect(parseShortcut('#### ')).toBeNull();
		expect(parseShortcut('текст ')).toBeNull();
		expect(parseShortcut('- два слова ')).toBeNull();
		expect(parseShortcut('2. ')).toBeNull();
	});
});
