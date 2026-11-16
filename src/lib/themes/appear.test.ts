import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { appear, disappear } from './appear';
import { activeTheme } from './index.svelte';

describe('appear', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('возвращает стабильную ссылку на обработчик для одного ключа', () => {
		expect(appear('feedIn')).toBe(appear('feedIn'));
	});

	it('анимирует элемент при первом вызове и игнорирует повторные', () => {
		const animate = vi.fn();
		const el = { animate } as unknown as Element;

		const handler = appear('feedIn');
		handler(el);
		expect(animate).toHaveBeenCalledTimes(1);

		// Повторный вызов на том же элементе (например, при обновлении компонента или открытии модалки)
		handler(el);
		expect(animate).toHaveBeenCalledTimes(1);
	});

	it('анимирует новый элемент ровно один раз', () => {
		const animate1 = vi.fn();
		const el1 = { animate: animate1 } as unknown as Element;
		const animate2 = vi.fn();
		const el2 = { animate: animate2 } as unknown as Element;

		const handler = appear('feedIn');
		handler(el1);
		handler(el2);

		expect(animate1).toHaveBeenCalledTimes(1);
		expect(animate2).toHaveBeenCalledTimes(1);
	});
});

describe('disappear', () => {
	afterEach(() => {
		activeTheme.set('redtf');
		vi.unstubAllGlobals();
	});

	type Leave = () => { duration: number; tick?: (t: number) => void };

	it('проигрывает уход темы при каждом закрытии и снимает его, если уход прервали', () => {
		activeTheme.set('redtf');
		const cancel = vi.fn();
		const animate = vi.fn(() => ({ cancel }));
		const el = { animate, style: {} as CSSStyleDeclaration } as unknown as HTMLElement;

		const leave = disappear(el, 'popoverOut') as Leave;
		const config = leave();
		expect(config.duration).toBe(activeTheme.motion!.popoverOut!.duration);
		expect(animate).toHaveBeenCalledTimes(1);
		expect(el.style.pointerEvents).toBe('none');

		// Svelte прервал уход: tick(1) после хода анимации
		config.tick!(0.5);
		config.tick!(1);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(el.style.pointerEvents).toBe('');

		leave();
		expect(animate).toHaveBeenCalledTimes(2);
	});

	it('возвращает duration: 0, если у темы нет анимации', () => {
		activeTheme.set('dtf2022');
		const el = { animate: vi.fn(), style: {} as CSSStyleDeclaration } as unknown as Element;

		expect((disappear(el, 'popoverOut') as Leave)()).toEqual({ duration: 0 });
		expect((el as unknown as { animate: ReturnType<typeof vi.fn> }).animate).not.toHaveBeenCalled();
	});
});
