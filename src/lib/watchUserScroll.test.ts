import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchUserScroll } from './watchUserScroll';

function stubWindow() {
	const listeners = new Map<string, Set<EventListener>>();
	vi.stubGlobal('window', {
		addEventListener: (type: string, fn: EventListener) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		},
		removeEventListener: (type: string, fn: EventListener) => {
			listeners.get(type)?.delete(fn);
		}
	});
	return {
		emit: (type: string, event: Record<string, unknown> = {}) => {
			for (const fn of [...(listeners.get(type) ?? [])]) fn(event as unknown as Event);
		},
		count: (type: string) => listeners.get(type)?.size ?? 0
	};
}

describe('watchUserScroll', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('срабатывает один раз на скролл-клавишу вне полей ввода и игнорирует обычные клавиши, ввод текста и Ctrl/Alt', () => {
		const win = stubWindow();
		const onScroll = vi.fn();
		watchUserScroll(onScroll);

		win.emit('keydown', { code: 'KeyA', target: null });
		win.emit('keydown', { code: 'Space', target: { tagName: 'TEXTAREA' } });
		win.emit('keydown', { code: 'ArrowDown', target: { isContentEditable: true } });
		win.emit('keydown', { code: 'Space', ctrlKey: true, target: { tagName: 'BODY' } });
		win.emit('keydown', { code: 'ArrowDown', altKey: true, target: { tagName: 'BODY' } });
		expect(onScroll).not.toHaveBeenCalled();
		expect(win.count('keydown')).toBe(1);

		win.emit('keydown', { code: 'PageDown', target: { tagName: 'BODY' } });
		expect(onScroll).toHaveBeenCalledTimes(1);
		expect(win.count('wheel')).toBe(0);
		expect(win.count('touchmove')).toBe(0);
		expect(win.count('keydown')).toBe(0);
	});

	it('поддерживает touch: touchstart для мгновенной остановки программной прокрутки', () => {
		const win = stubWindow();
		const onScroll = vi.fn();
		watchUserScroll(onScroll, { touch: 'touchstart' });

		expect(win.count('touchstart')).toBe(1);
		expect(win.count('touchmove')).toBe(0);
		win.emit('touchstart');
		expect(onScroll).toHaveBeenCalledTimes(1);
		expect(win.count('touchstart')).toBe(0);
	});
});
