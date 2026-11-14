import type { ThemePalettes } from '../types';

export const palettes: ThemePalettes = {
	default: 'light',
	system: { light: 'light', dark: 'light' },
	options: [
		{ id: 'light', title: 'Светлая', mode: 'light', background: '#f2f2f2', themeColor: '#D9F5FF' }
	]
};

export default { palettes };
