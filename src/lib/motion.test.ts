import { describe, it, expect, vi, afterEach } from 'vitest';
import { playClipped } from './motion';

describe('playClipped', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('обрезает элемент по низу окна на время анимации и возвращает стили', async () => {
		vi.stubGlobal('innerHeight', 800);
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		let finish!: () => void;
		const attrs = new Set<string>();
		const el = {
			style: { maxHeight: '', overflow: 'auto' },
			getBoundingClientRect: () => ({ top: 60 }),
			setAttribute: (k: string) => attrs.add(k),
			removeAttribute: (k: string) => attrs.delete(k),
			animate: () => ({ finished: new Promise<void>((r) => (finish = r)), cancel() {} })
		} as unknown as HTMLElement;

		const anim = playClipped(el, { keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 100, easing: 'linear' });
		expect(el.style.maxHeight).toBe('814px');
		expect(el.style.overflow).toBe('clip');
		expect(attrs.has('data-animating')).toBe(true);

		finish();
		await anim?.finished;
		await Promise.resolve();
		expect(el.style.maxHeight).toBe('');
		expect(el.style.overflow).toBe('auto');
		expect(attrs.has('data-animating')).toBe(false);
	});

	it('при отмене возвращает стили сразу, а не после отклонения finished', () => {
		vi.stubGlobal('innerHeight', 800);
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		const el = {
			style: { maxHeight: '', overflow: 'auto' },
			getBoundingClientRect: () => ({ top: 60 }),
			setAttribute() {},
			removeAttribute() {},
			animate: () => ({ finished: new Promise<void>(() => {}), cancel() {} })
		} as unknown as HTMLElement;

		playClipped(el, { keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 100, easing: 'linear' })?.cancel();
		expect(el.style.overflow).toBe('auto');
		expect(el.style.maxHeight).toBe('');
	});
});
