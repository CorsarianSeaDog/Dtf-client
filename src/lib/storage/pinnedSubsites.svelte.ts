import type { SearchSubsite } from '$lib/api/types';
import { getLeonardoUrl } from '$lib/api/utils';
import { persistedState } from './persisted.svelte';

export type PinnedSubsite = Pick<SearchSubsite, 'id' | 'name' | 'avatarUrl'>;

export const PINNED_SUBSITES_LIMIT = 10;

// Стандартные пункты бокового меню DTF.
export const STANDARD_SUBSITES: PinnedSubsite[] = [
	{ id: 64953, name: 'Игры', avatarUrl: getLeonardoUrl('e5348320-b11a-9419-fb85-f7b63e2de194', { scale_crop: '64x64' }) },
	{ id: 64957, name: 'Кино и сериалы', avatarUrl: getLeonardoUrl('5d198df0-3ba4-6837-b9c3-ac8c04fb9181', { scale_crop: '64x64' }) },
	{ id: 87855, name: 'Индустрия', avatarUrl: getLeonardoUrl('f488fca4-88d6-c978-d052-4d49a3a62a44', { scale_crop: '64x64' }) },
	{ id: 64954, name: 'Gamedev', avatarUrl: getLeonardoUrl('9e71f64c-f452-321b-e24b-901bd6b01757', { scale_crop: '64x64' }) },
	{ id: 128871, name: 'Жизнь', avatarUrl: getLeonardoUrl('968a91e7-3a3c-5c79-a0cb-2b3df974a697', { scale_crop: '64x64' }) }
];

export const pinnedSubsites = persistedState('redtf:settings:pinned-subsites', {
	visible: true,
	items: STANDARD_SUBSITES
});

export function pinSubsite({ id, name, avatarUrl }: PinnedSubsite, index?: number): boolean {
	const { items } = pinnedSubsites.value;
	if (items.length >= PINNED_SUBSITES_LIMIT || items.some((item) => item.id === id)) return false;
	const subsite = STANDARD_SUBSITES.find((item) => item.id === id) ?? { id, name, avatarUrl };
	pinnedSubsites.patch({ items: items.toSpliced(index ?? items.length, 0, subsite) });
	return true;
}

export function unpinSubsite(id: number) {
	const { items } = pinnedSubsites.value;
	const index = items.findIndex((item) => item.id === id);
	if (index >= 0) pinnedSubsites.patch({ items: items.toSpliced(index, 1) });
	return index;
}
