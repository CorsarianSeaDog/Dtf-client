import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchVisible } from './watchVisible';

describe('watchVisible', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('после добавления перезапускает наблюдение, даже если узел так и не покинул зону', async () => {
		let notify: (entries: { isIntersecting: boolean }[]) => void = () => {};
		const observe = vi.fn();
		const unobserve = vi.fn();
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				constructor(cb: typeof notify) {
					notify = cb;
				}
				observe = observe;
				unobserve = unobserve;
				disconnect = vi.fn();
			}
		);

		let more = true;
		const load = vi.fn(() => Promise.resolve(more));
		const stop = watchVisible({} as Element, load);
		expect(observe).toHaveBeenCalledTimes(1);

		notify([{ isIntersecting: true }]);
		notify([{ isIntersecting: true }]); // пока идёт загрузка, повторно не зовёт
		expect(load).toHaveBeenCalledTimes(1);
		await Promise.resolve();
		await Promise.resolve();
		expect(unobserve).toHaveBeenCalledTimes(1);
		expect(observe).toHaveBeenCalledTimes(2);

		more = false;
		notify([{ isIntersecting: true }]);
		await Promise.resolve();
		await Promise.resolve();
		expect(load).toHaveBeenCalledTimes(2);
		expect(observe).toHaveBeenCalledTimes(2);

		notify([{ isIntersecting: false }]);
		expect(load).toHaveBeenCalledTimes(2);
		stop();
	});
});
