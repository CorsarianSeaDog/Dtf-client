import { afterEach, expect, test, vi } from 'vitest';
import { keepInView } from './keepInView';

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test.each(['WebView', 'браузер'])('%s: один сдвиг после открытия клавиатуры и нативной прокрутки', (platform) => {
	vi.useFakeTimers();
	const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 800 });
	const win = Object.assign(new EventTarget(), { visualViewport: viewport, innerHeight: 800 });
	const input = Object.assign(new EventTarget(), { isContentEditable: true, offsetHeight: 24 });
	let top = 500;
	const editor = Object.assign(new EventTarget(), {
		offsetHeight: 100,
		contains: (el: unknown) => el === input,
		style: { setProperty: vi.fn() },
		getBoundingClientRect: () => ({ top, bottom: top + 100, height: 100 })
	});
	const scroll = vi.fn(({ top: delta }: ScrollToOptions) => { top -= delta ?? 0; });
	vi.stubGlobal('window', win);
	vi.stubGlobal('HTMLElement', EventTarget);
	vi.stubGlobal('document', { activeElement: input });
	vi.stubGlobal('getComputedStyle', () => ({ scrollMarginTop: '60px', scrollMarginBottom: '20px' }));
	vi.stubGlobal('matchMedia', () => ({ matches: true }));
	vi.stubGlobal('scrollBy', scroll);

	const detach = keepInView(editor as unknown as HTMLElement);
	// Медленный запуск клавиатуры: пока форма видна, страница стоит.
	vi.advanceTimersByTime(600);
	if (platform === 'WebView') win.dispatchEvent(new Event('keyboardWillShow'));
	for (const height of [700, 550, 390, 400]) {
		viewport.height = height;
		if (platform === 'WebView') win.innerHeight = height;
		viewport.dispatchEvent(new Event('resize'));
		vi.advanceTimersByTime(80);
	}
	if (platform === 'WebView') {
		vi.advanceTimersByTime(600);
		win.dispatchEvent(new Event('keyboardDidShow'));
	}
	// Уже после последнего resize браузер сдвинул форму под шапку.
	top = 35;
	win.dispatchEvent(new Event('scroll'));
	vi.advanceTimersByTime(200);
	viewport.offsetTop = 30;
	viewport.dispatchEvent(new Event('scroll'));
	vi.advanceTimersByTime(200);
	expect(scroll).not.toHaveBeenCalled();
	vi.runAllTimers();
	// Видимая зона 90..410, центр формы должен попасть в 250.
	expect(top + 50).toBe(250);
	expect(scroll).toHaveBeenCalledTimes(1);
	editor.dispatchEvent(new Event('input'));
	win.dispatchEvent(new Event('scroll'));
	vi.runAllTimers();
	expect(scroll).toHaveBeenCalledTimes(1);

	// Пользователь взял прокрутку на себя до завершения следующего открытия.
	editor.dispatchEvent(new Event('focusin'));
	win.dispatchEvent(new Event('touchmove'));
	win.dispatchEvent(new Event('keyboardDidShow'));
	top = 10;
	vi.runAllTimers();
	expect(scroll).toHaveBeenCalledTimes(1);
	detach?.();
});
