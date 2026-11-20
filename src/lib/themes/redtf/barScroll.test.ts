import { expect, it } from 'vitest';
import { createTopToggle, initialBarScroll, nextBarScroll } from './barScroll';

/** Прогон прокрутки по списку положений: итоговое состояние */
const scrollThrough = (ys: number[], start = initialBarScroll(100)) => ys.reduce((state, y) => nextBarScroll(state, y), start);

it('прячет панель при прокрутке вниз, возвращает при прокрутке вверх и у начала страницы', () => {
	const down = scrollThrough([130, 160, 200]);
	expect(down.hidden).toBe(true);
	expect(scrollThrough([190, 170, 140], down).hidden).toBe(false);
	expect(scrollThrough([130, 160, 200, 30]).hidden).toBe(false);
});

it('не реагирует на дрожание пальца, скачок окна и открытое меню', () => {
	expect(scrollThrough([108, 100, 109, 101, 110]).hidden).toBe(false);
	// Восстановление прокрутки слоя: скачок показывает панель, а не прячет
	expect(scrollThrough([130, 160, 200, 2500]).hidden).toBe(false);
	expect(nextBarScroll(initialBarScroll(100), 200, () => true).hidden).toBe(false);
});

it('возвращает прокрутку по повторному нажатию, держит точку при частичном скролле и сбрасывает при пересечении вниз или смене экрана', () => {
	const states: boolean[] = [];
	const toggle = createTopToggle((active) => states.push(active));

	expect(toggle.tap(0)).toBeUndefined();
	expect(toggle.tap(420)).toBe(0);
	// Плавный скролл вверх и частичный скролл вниз (меньше 420) точку не сбрасывают
	for (const y of [422, 300, 0, 200, 419, 15]) toggle.scroll(y);
	// Повторное нажатие после небольшого скролла вниз возвращает к 420, а не снова наверх
	expect(toggle.tap(15)).toBe(420);
	expect(toggle.tap(0)).toBeUndefined();

	// Пересечение сохранённой точки вниз сбрасывает возврат
	expect(toggle.tap(420)).toBe(0);
	for (const y of [200, 0, 420, 0]) toggle.scroll(y);
	expect(toggle.tap(0)).toBeUndefined();

	// Сброс при переключении страницы работает даже без нажатия на новом экране
	expect(toggle.tap(300)).toBe(0);
	toggle.reset();
	expect(toggle.tap(0)).toBeUndefined();

	expect(states).toEqual([true, false, true, false, true, false]);
});
