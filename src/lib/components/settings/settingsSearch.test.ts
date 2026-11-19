import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import SettingsScreen from './SettingsScreen.svelte';
import { buildSettingsSearchIndex, searchSettings } from './settingsSearch';
import type { SettingField } from '$lib/themes/types';

const SAMPLE_FIELDS: SettingField[] = [
	{
		key: 'votes',
		type: 'radio',
		title: 'Оценки',
		description: 'Как выглядят оценки постов и комментариев.',
		default: 'likes',
		options: [
			{ value: 'rating', title: 'Стрелки · осень 2022', description: 'Рейтинг со стрелками вверх и вниз' },
			{ value: 'likes', title: 'Лайки · начало 2023' }
		]
	},
	{
		key: 'mobileBarBlur',
		type: 'toggle',
		title: 'Блюр мобильного бара',
		description: 'Размытие фона под нижней навигационной панелью',
		default: false,
		device: 'mobile'
	},
	{
		key: 'contentWidth',
		type: 'slider',
		title: 'Ширина контента',
		steps: [640, 740],
		default: 640,
		unit: 'px',
		device: 'desktop',
		cssVars: (w) => ({ '--content-width': `${w}px` })
	},
	{
		key: 'swipeColumn',
		type: 'radio',
		title: 'Действия свайпа по комментарию',
		default: 'list',
		touch: true,
		options: [
			{ value: 'list', title: 'Колонка' },
			{ value: 'drum', title: 'Барабан' }
		]
	},
	{
		key: 'haptics',
		type: 'toggle',
		title: 'Тактильный отклик (вибрация)',
		default: true,
		platform: 'android'
	},
	{
		key: 'predictiveBack',
		type: 'toggle',
		title: 'Поддержка Predictive Gesture',
		default: false,
		platform: 'android',
		native: true
	}
];

function createIndex(overrides?: Partial<Parameters<typeof buildSettingsSearchIndex>[0]>) {
	return buildSettingsSearchIndex({
		navPages: [
			{ pageId: 'feed', icon: 'feed', path: 'Контент', title: 'Моя лента' },
			{ pageId: 'interface-votes', folderId: 'interface', icon: 'votes', path: 'Персонализация › Интерфейс', title: 'Оценки' },
			{ pageId: 'debug', icon: 'debug', path: 'Разработка', title: 'Дебаг', devOnly: true }
		],
		fieldGroups: [
			{ pageId: 'interface-votes', folderId: 'interface', icon: 'votes', path: 'Интерфейс › Оценки', fields: [SAMPLE_FIELDS[0]] },
			{ pageId: 'interface-mobile-bar', folderId: 'interface', icon: 'mobile-bar', path: 'Интерфейс › Мобильная панель', fields: [SAMPLE_FIELDS[1]] },
			{ pageId: 'interface-content', folderId: 'interface', icon: 'content', path: 'Интерфейс › Лента и контент', fields: [SAMPLE_FIELDS[2]] },
			{ pageId: 'interface-comments', folderId: 'interface', icon: 'comments', path: 'Интерфейс › Комментарии', fields: [SAMPLE_FIELDS[3]] },
			{ pageId: 'app', icon: 'app', path: 'Персонализация › Приложение', fields: [SAMPLE_FIELDS[4], SAMPLE_FIELDS[5]] }
		],
		visibility: {
			device: 'desktop',
			touch: false,
			platform: 'windows',
			native: false
		},
		isDevVisible: false,
		hasGestures: false,
		...overrides
	});
}

describe('settingsSearch', () => {
	it('нормализует ё/е и ищет по нескольким словам и синонимам', () => {
		const index = createIndex();

		const blackList = searchSettings(index, 'черный');
		expect(blackList.some((m) => m.item.pageId === 'ignored')).toBe(true);

		const filterHits = searchSettings(index, 'стоп-слова');
		expect(filterHits.some((m) => m.item.pageId === 'filters')).toBe(true);

		const multiWord = searchSettings(index, 'рейтинг комментарии');
		expect(multiWord[0]?.item.id).toBe('feed:rank');
	});

	it('подсказывает совпавший вариант выбора для радио- и select-полей', () => {
		const index = createIndex();
		const matches = searchSettings(index, 'стрелки осень');

		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].item.settingKey).toBe('votes');
		expect(matches[0].item.path).toBe('Интерфейс › Оценки');
		expect(matches[0].matchedOption).toContain('Стрелки');
	});

	it('фильтрует пункты по устройству, сенсорному вводу, devMode, платформе и жестам', () => {
		const desktopIndex = createIndex({
			visibility: { device: 'desktop', touch: false, platform: 'windows', native: false },
			isDevVisible: false,
			hasGestures: false
		});
		expect(searchSettings(desktopIndex, 'блюр мобильного')).toHaveLength(0);
		expect(searchSettings(desktopIndex, 'ширина контента')).toHaveLength(1);
		expect(searchSettings(desktopIndex, 'действия свайпа')).toHaveLength(0);
		expect(searchSettings(desktopIndex, 'safe area')).toHaveLength(0);
		expect(searchSettings(desktopIndex, 'любимые реакции')).toHaveLength(0);
		expect(searchSettings(desktopIndex, 'ota')).toHaveLength(0);
		expect(searchSettings(desktopIndex, 'вибрация').some((m) => m.item.id === 'app:haptics')).toBe(false);
		expect(searchSettings(desktopIndex, 'predictive')).toHaveLength(0);

		// Планшет: ширина десктопная, но есть тач-ввод
		const tabletIndex = createIndex({
			visibility: { device: 'desktop', touch: true, platform: 'android', native: false },
			hasGestures: true
		});
		expect(searchSettings(tabletIndex, 'ширина контента')).toHaveLength(1);
		expect(searchSettings(tabletIndex, 'действия свайпа')).toHaveLength(1);
		expect(searchSettings(tabletIndex, 'любимые реакции')).toHaveLength(1);
		expect(searchSettings(tabletIndex, 'вибрация').some((m) => m.item.id === 'app:haptics')).toBe(true);
		expect(searchSettings(tabletIndex, 'predictive')).toHaveLength(0);

		const mobileDevIndex = createIndex({
			visibility: { device: 'mobile', touch: true, platform: 'android', native: true },
			isDevVisible: true,
			hasGestures: true
		});
		expect(searchSettings(mobileDevIndex, 'блюр мобильного')).toHaveLength(1);
		expect(searchSettings(mobileDevIndex, 'ширина контента')).toHaveLength(0);
		expect(searchSettings(mobileDevIndex, 'safe area')).toHaveLength(1);
		expect(searchSettings(mobileDevIndex, 'любимые реакции')).toHaveLength(1);
		expect(searchSettings(mobileDevIndex, 'ota')).toHaveLength(1);
		expect(searchSettings(mobileDevIndex, 'вибрация').some((m) => m.item.id === 'app:haptics')).toBe(true);
		expect(searchSettings(mobileDevIndex, 'predictive')).toHaveLength(1);

		const iosIndex = createIndex({
			visibility: { device: 'mobile', touch: true, platform: 'ios', native: true },
			hasGestures: true
		});
		expect(searchSettings(iosIndex, 'вибрация').some((m) => m.item.id === 'app:haptics')).toBe(false);
		expect(searchSettings(iosIndex, 'predictive')).toHaveLength(0);
	});

	it('дедуплицирует одинаковые названия страницы и настройки в пользу настройки', () => {
		const index = createIndex();
		const votesMatches = searchSettings(index, 'Оценки').filter((m) => m.item.pageId === 'interface-votes');

		expect(votesMatches).toHaveLength(1);
		expect(votesMatches[0].item.settingKey).toBe('votes');
	});

	it('рендерит поле поиска в SettingsScreen', () => {
		const { body } = render(SettingsScreen, { props: { onclose: () => {} } });
		expect(body).toContain('Поиск по настройкам');
		expect(body).toContain('type="search"');
	});
});
