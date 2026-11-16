import { expect, it } from 'vitest';
import { keyboardOffset } from './keyboardOffset';

it('считает высоту клавиатуры по видимой области и не уходит в минус', () => {
	// Клавиатура на 300px: видимая область короче окна
	expect(keyboardOffset(800, 500, 0)).toBe(300);
	// iOS прокрутил страницу над клавиатурой: смещение сверху вычитается
	expect(keyboardOffset(800, 500, 120)).toBe(180);
	// Клавиатуры нет, дробные значения округляются
	expect(keyboardOffset(800, 800, 0)).toBe(0);
	expect(keyboardOffset(800, 799.6, 0)).toBe(0);
	// Масштаб жестом или полоса адреса дают видимую область больше окна
	expect(keyboardOffset(800, 830, 0)).toBe(0);
});
