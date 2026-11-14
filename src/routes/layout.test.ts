import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const layout = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '+layout.svelte'), 'utf8');

describe('+layout.svelte: скрытие слоёв', () => {
	it('прячет детей слоя по метке, а не по `> *`: универсальный селектор пересчитывает стили всего поддерева при показе слоя', () => {
		expect(layout).toContain('.layer[data-hidden] > :global([data-layer-root])');
		expect(layout).not.toMatch(/\.layer\[data-hidden\]\s*>\s*:global\(\*\)/);
		expect(layout.match(/\{@attach markLayerRoots\}/g)).toHaveLength(2);
	});
});
