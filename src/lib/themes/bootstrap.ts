import { DEFAULT_THEME, SETTINGS_VERSION, THEME_SETTINGS_VERSION } from '$lib/storage/defaults';
import { readPersisted } from '$lib/storage/readPersisted';
import { applyPalette, DEFAULT_PALETTES, resolvePalette } from './palette';
import type { ThemePalettes } from './types';

interface PaletteMeta {
	extends?: string;
	palettes?: ThemePalettes;
}

// Берём только палитры тем без settings и motion, чтобы не раздувать встроенный скрипт в HTML
const modules = import.meta.glob<{ default: PaletteMeta }>('./*/palettes.ts', { eager: true });
const byId = new Map(
	Object.entries(modules).map(([path, mod]) => [path.split('/')[1], mod.default])
);

function findPalettes(id: string): ThemePalettes {
	const seen = new Set<string>();
	let current: string | undefined = id;
	while (current !== undefined && !seen.has(current)) {
		seen.add(current);
		const meta = byId.get(current);
		if (meta?.palettes) return meta.palettes;
		current = meta?.extends;
	}
	return DEFAULT_PALETTES;
}

const settings = readPersisted('redtf:settings', { theme: DEFAULT_THEME }, SETTINGS_VERSION);
const theme = byId.has(settings.theme) ? settings.theme : DEFAULT_THEME;
const values = readPersisted(`redtf:theme:${theme}`, { palette: 'auto' }, THEME_SETTINGS_VERSION);
applyPalette(resolvePalette(findPalettes(theme), values.palette, window.matchMedia('(prefers-color-scheme: dark)').matches));
