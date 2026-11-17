import { expect, test } from 'vitest';
import { revealDelta } from './keepInView';

test('revealDelta: как block nearest в зоне между панелью и клавиатурой', () => {
	// Зона 68..400
	expect(revealDelta(100, 200, 68, 400)).toBe(0);
	// Под шапкой — вниз к её краю, под клавиатурой — вверх к её краю
	expect(revealDelta(20, 120, 68, 400)).toBe(-48);
	expect(revealDelta(350, 500, 68, 400)).toBe(100);
	// Выше зоны и закрывает её — не трогаем, оставляем пустоту — подтягиваем ближний край
	expect(revealDelta(0, 600, 68, 400)).toBe(0);
	expect(revealDelta(100, 600, 68, 400)).toBe(32);
	expect(revealDelta(-300, 300, 68, 400)).toBe(-100);
});
