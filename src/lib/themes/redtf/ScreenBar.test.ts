import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import ScreenBar from './ScreenBar.svelte';
import { currentUser } from '$lib/api/currentUser.svelte';
import type { Post, Profile } from '$lib/api/types';

// Оверлеев нет: «Назад» — ссылка на ленту
vi.mock('$app/state', () => ({ page: { state: {}, route: { id: '/' } } }));
vi.mock('$lib/api/currentUser.svelte', () => ({ currentUser: { value: undefined as { id: number } | undefined } }));

const labels = (props: object) => [...render(ScreenBar, { props: props as any }).body.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
const profile = { id: 7, sourceId: 'dtf', name: 'Автор' } as Profile;
const post = { id: 1, sourceId: 'dtf', title: 'Пост', isDraft: false } as Post;

it('набор кнопок зависит от экрана', () => {
	expect(labels({ screen: 'feed' })).toEqual(expect.arrayContaining(['Открыть меню', 'Поиск', 'Написать пост']));
	expect(labels({ screen: 'post', post })).toEqual(expect.arrayContaining(['Назад в ленту', 'Поделиться постом']));
	expect(labels({ screen: 'post', post })).not.toContain('Открыть меню');
	expect(labels({ screen: 'tag', tag: 'тег' })).toEqual(['Верхняя панель', 'Назад в ленту', 'Больше']);

	expect(render(ScreenBar, { props: { screen: 'tag', tag: 'тег' } }).body).toContain('#Тег');

	// Чужой профиль: поделиться и «⋯»; свой — написать пост и поделиться, без «⋯»
	expect(labels({ screen: 'profile', profile })).toEqual(expect.arrayContaining(['Поделиться профилем', 'Больше']));
	const me = currentUser as { value?: { id: number } };
	me.value = { id: 7 };
	const own = labels({ screen: 'profile', profile });
	me.value = undefined;
	expect(own).toEqual(expect.arrayContaining(['Написать пост', 'Поделиться профилем']));
	expect(own).not.toContain('Больше');

	// Уведомления и аккаунт: только полоска безопасной зоны
	for (const screen of ['notifications', 'messages', 'account'] as const) {
		const html = render(ScreenBar, { props: { screen } }).body;
		expect(html).not.toMatch(/<button|<a /);
		if (screen === 'account') expect(html).not.toContain('screen-bar--card');
		else expect(html).toContain('screen-bar--card');
	}
});
