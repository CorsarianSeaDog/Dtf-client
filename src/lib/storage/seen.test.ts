import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	const data: Record<string, string> = {};
	Object.defineProperty(globalThis, 'localStorage', {
		value: {
			getItem: (key: string) => data[key] ?? null,
			setItem: (key: string, value: string) => {
				data[key] = String(value);
			},
			removeItem: (key: string) => {
				delete data[key];
			},
			clear: () => {
				for (const key in data) delete data[key];
			}
		},
		writable: true
	});
});

import { clearSeen, flushSeen, markSeen, seenSnapshot, trackFullRead, trackInFeed, trackOpen, watchSeen } from './seen.svelte';
import { settings } from './settings.svelte';

const post = { id: 1, sourceId: 'dtf' };

describe('журнал прочитанного', () => {
	beforeEach(() => {
		settings.patch({ hideSeen: true });
		clearSeen();
	});

	it('пока скрытие выключено, ничего не запоминает', () => {
		settings.patch({ hideSeen: false });
		markSeen(post);
		expect(seenSnapshot().size).toBe(0);
	});

	it('отметка видна в снимке сразу, сохраняется пачкой и не дублируется', () => {
		markSeen(post);
		markSeen(post);
		expect(seenSnapshot()).toEqual(new Set(['dtf_1']));
		flushSeen();
		markSeen(post);
		expect(JSON.parse(localStorage.getItem('redtf:data:seen-posts')!).d).toEqual(['dtf_1']);
	});

	it('хранит не больше лимита, вытесняя старые', () => {
		for (let id = 1; id <= 5002; id++) markSeen({ id, sourceId: 'dtf' });
		flushSeen();
		const keys = seenSnapshot();
		expect(keys.size).toBe(5000);
		expect(keys.has('dtf_1')).toBe(false);
		expect(keys.has('dtf_5002')).toBe(true);
	});
});

describe('watchSeen', () => {
	let notify: (entries: { isIntersecting: boolean }[]) => void;
	const el = { checkVisibility: vi.fn(() => true) } as unknown as Element;

	beforeEach(() => {
		vi.useFakeTimers();
		settings.patch({ hideSeen: true, seenOpenSeconds: 3, seenFullRead: true, seenFeedSeconds: 2 });
		clearSeen();
		vi.stubGlobal('document', { visibilityState: 'visible' });
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				constructor(cb: typeof notify) {
					notify = cb;
				}
				observe = vi.fn();
				disconnect = vi.fn();
			}
		);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('засчитывает пост, пробывший в экране нужное время', () => {
		watchSeen(el, post, 3);
		notify([{ isIntersecting: true }]);
		vi.advanceTimersByTime(2999);
		expect(seenSnapshot().size).toBe(0);
		vi.advanceTimersByTime(1);
		expect(seenSnapshot().has('dtf_1')).toBe(true);
	});

	it('не засчитывает пост, который покинул экран раньше', () => {
		watchSeen(el, post, 3);
		notify([{ isIntersecting: true }]);
		vi.advanceTimersByTime(2000);
		notify([{ isIntersecting: false }]);
		vi.advanceTimersByTime(5000);
		expect(seenSnapshot().size).toBe(0);
	});

	it('ждёт, пока вкладка или слой снова станут видны', () => {
		const hidden = { checkVisibility: () => false } as unknown as Element;
		watchSeen(hidden, post, 1);
		notify([{ isIntersecting: true }]);
		vi.advanceTimersByTime(5000);
		expect(seenSnapshot().size).toBe(0);
		(hidden as unknown as { checkVisibility: () => boolean }).checkVisibility = () => true;
		vi.advanceTimersByTime(1000);
		expect(seenSnapshot().size).toBe(1);
	});

	it('не засчитывает слой, скрытый через content-visibility на самом элементе', () => {
		vi.stubGlobal('getComputedStyle', () => ({ contentVisibility: 'hidden' }));
		watchSeen(el, post, 1);
		notify([{ isIntersecting: true }]);
		vi.advanceTimersByTime(5000);
		expect(seenSnapshot().size).toBe(0);
	});

	it('открытие, конец поста и показ в ленте включаются настройками', () => {
		settings.patch({ seenOpenSeconds: 0, seenFullRead: false, seenFeedSeconds: 0 });
		expect(trackOpen(el, post)).toBeUndefined();
		expect(trackFullRead(el, post)).toBeUndefined();
		expect(trackInFeed(el, post)).toBeUndefined();
		settings.patch({ seenOpenSeconds: 3, seenFullRead: true, seenFeedSeconds: 2 });
		expect(trackOpen(el, post)).toBeTypeOf('function');
		expect(trackFullRead(el, post)).toBeTypeOf('function');
		expect(trackInFeed(el, post)).toBeTypeOf('function');
	});
});
