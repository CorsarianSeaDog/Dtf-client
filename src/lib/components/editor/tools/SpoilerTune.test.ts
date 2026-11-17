import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SpoilerTune from './SpoilerTune';

// В vitest нет DOM: минимальная подмена элемента
function makeEl() {
	const classes = new Set<string>();
	const handlers: Array<() => void> = [];
	return {
		innerHTML: '',
		classList: {
			add: (c: string) => classes.add(c),
			contains: (c: string) => classes.has(c),
			toggle: (c: string, on?: boolean) => {
				if (on ?? !classes.has(c)) classes.add(c);
				else classes.delete(c);
			}
		},
		append: vi.fn(),
		addEventListener: (_: string, fn: () => void) => handlers.push(fn),
		click: () => handlers.forEach((fn) => fn())
	} as any;
}

describe('SpoilerTune', () => {
	beforeEach(() => vi.stubGlobal('document', { createElement: () => makeEl() }));
	afterEach(() => vi.unstubAllGlobals());

	it('помечает только блок, которому принадлежит настройка', () => {
		const make = (hidden: boolean) => new SpoilerTune({ api: {}, data: { hidden } });
		const marked = make(true).wrap(makeEl());
		const plain = make(false).wrap(makeEl());
		expect(marked.classList.contains('editor-block-is-spoiler')).toBe(true);
		expect(plain.classList.contains('editor-block-is-spoiler')).toBe(false);
	});

	it('клик по кнопке переключает класс на своём блоке', () => {
		const tune = new SpoilerTune({ api: {}, data: { hidden: false } });
		const block = tune.wrap(makeEl());
		(tune.render() as any).click();
		expect(block.classList.contains('editor-block-is-spoiler')).toBe(true);
		expect(tune.save()).toEqual({ hidden: true });
	});
});
