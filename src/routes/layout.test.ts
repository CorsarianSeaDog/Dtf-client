import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(rootDir, rel), 'utf8');
const layout = read('src/routes/+layout.svelte');

describe('+layout.svelte: скрытие слоёв', () => {
	it('прячет детей слоя по метке, а не по `> *`: универсальный селектор пересчитывает стили всего поддерева при показе слоя', () => {
		expect(layout).toContain('.layer[data-hidden] > :global([data-layer-root])');
		expect(layout).not.toMatch(/\.layer\[data-hidden\]\s*>\s*:global\(\*\)/);
		expect(layout.match(/\{@attach markLayerRoots\}/g)).toHaveLength(2);
	});
});

describe('глобальные :has() селекторы удалены', () => {
	it('app.html, redtf/theme.css и SettingsScreen.svelte не содержат :has(', () => {
		expect(read('src/app.html')).not.toContain(':has(');
		expect(read('src/lib/themes/redtf/theme.css')).not.toContain(':has(');
		expect(read('src/lib/components/settings/SettingsScreen.svelte')).not.toContain(':has(');
	});
});
