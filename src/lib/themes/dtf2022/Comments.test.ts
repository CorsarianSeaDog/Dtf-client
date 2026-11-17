import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Comments sorting options', () => {
	it.each(['dtf2022', 'redtf'])('%s: сортировки идут в нужном порядке, «Худшие» доступны при включенном rank', (theme) => {
		const svelteContent = fs.readFileSync(path.join(__dirname, '..', theme, 'Comments.svelte'), 'utf8');

		expect(svelteContent).toContain('reactionSettings.value.rank');
		expect([...svelteContent.matchAll(/\{ value: '([^']+)', label: '([^']+)' \}/g)].map(([, value, label]) => [value, label])).toEqual([
			['hotness', 'Лучшие'],
			['date', 'Последние'],
			['dateAsc', 'Первые'],
			['worst', 'Худшие']
		]);
		expect(svelteContent).toContain("if (!reactionSettings.value.rank && logic.sorting === 'worst')");
		expect(svelteContent).toContain("setSorting('hotness')");
	});
});
