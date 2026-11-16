import { expect, it } from 'vitest';
import { initialBarScroll, nextBarScroll } from './barScroll';

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
