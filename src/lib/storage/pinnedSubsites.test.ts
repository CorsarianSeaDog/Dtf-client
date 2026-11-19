import { expect, it } from 'vitest';
import { PINNED_SUBSITES_LIMIT, STANDARD_SUBSITES, pinnedSubsites, pinSubsite, unpinSubsite } from './pinnedSubsites.svelte';

it('сохраняет стандартные пункты, исключает дубли и ограничивает общий список', () => {
	expect(pinnedSubsites.value).toEqual({ visible: true, items: STANDARD_SUBSITES });
	const [standard] = STANDARD_SUBSITES;
	expect(pinSubsite(standard)).toBe(false);
	expect(pinnedSubsites.value.items).toHaveLength(STANDARD_SUBSITES.length);

	unpinSubsite(standard.id);
	expect(pinnedSubsites.value.items).not.toContain(standard);
	expect(pinSubsite({ id: standard.id, name: 'Из результатов поиска' })).toBe(true);
	expect(pinnedSubsites.value.items.at(-1)).toEqual(standard);

	const firstCustomId = 1;
	for (let id = firstCustomId; id <= PINNED_SUBSITES_LIMIT; id++) {
		pinSubsite({ id, name: `Тема ${id}` });
	}
	expect(pinnedSubsites.value.items).toHaveLength(PINNED_SUBSITES_LIMIT);
	expect(pinnedSubsites.value.items.some((item) => item.id === PINNED_SUBSITES_LIMIT)).toBe(false);
	expect(pinSubsite({ id: PINNED_SUBSITES_LIMIT, name: 'Лишняя тема' })).toBe(false);

	pinnedSubsites.patch({ visible: false });
	unpinSubsite(firstCustomId);
	pinSubsite({ id: PINNED_SUBSITES_LIMIT, name: 'Новая тема' });
	expect(pinnedSubsites.value.visible).toBe(false);
	expect(pinnedSubsites.value.items.at(-1)?.id).toBe(PINNED_SUBSITES_LIMIT);
});
