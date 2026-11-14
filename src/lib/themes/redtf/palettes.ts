import type { ThemePalettes } from '../types';

export const extendsTheme = 'dtf2022';

export const palettes: ThemePalettes = {
	default: 'light',
	system: { light: 'light', dark: 'dark' },
	options: [
		{ id: 'light', title: 'Светлая', mode: 'light', background: '#f2f2f2', themeColor: '#D9F5FF' },
		{ id: 'dark', title: 'Тёмная', mode: 'dark', background: '#141414', themeColor: '#202022' },
		{ id: 'amoled', title: 'AMOLED', mode: 'dark', background: '#000000', themeColor: '#000000' }
	]
};

export default { extends: extendsTheme, palettes };
