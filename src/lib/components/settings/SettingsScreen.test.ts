import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import SettingsScreen from './SettingsScreen.svelte';
import { authStorage } from '$lib/storage/auth.svelte';
import { activeTheme } from '$lib/themes/index.svelte';
import { resolveInitialNav } from './settingsConfig';

describe('SettingsScreen', () => {
	it('рендерит основные категории и пункты Уровня 1', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {}
			}
		});

		// Заголовок окна
		expect(body).toContain('Настройки');

		// Основные категории первого уровня
		expect(body).toContain('Аккаунт');
		expect(body).toContain('Контент');
		expect(body).toContain('Персонализация');
		expect(body).toContain('Данные');
		expect(body).toContain('О проекте');
		expect(body).toContain('Разработка');

		// Пункты меню первого уровня
		expect(body).toContain('Мой профиль');
		expect(body).toContain('Уведомления');
		expect(body).toContain('Чёрный список');
		expect(body).toContain('Моя лента');
		expect(body).toContain('Выбор темы');
		expect(body).toContain('Интерфейс');
		expect(body).toContain('Реестр реакций');
		expect(body).toContain('Приложение');
		expect(body).toContain('Источники данных');
		expect(body).toContain('Сеть и прокси');
		expect(body).toContain('Моя статистика');
		expect(body).toContain('Хочу помочь');
		expect(body).toContain('Поддержавшие проект');
		expect(body).toContain('О приложении');
		expect(body).toContain('Дебаг');
	});

	it('по умолчанию открывается пустым с заглушкой по центру', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {}
			}
		});

		expect(body).toContain('Выберите раздел в меню слева');
		expect(body).toContain('empty-state');
		expect(body).not.toContain('nav__item--active');
	});

	it('открывает источники при явной передаче page: sources', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'sources'
			}
		});

		expect(body).toContain('nav__item--active');
		expect(body).not.toContain('Выберите раздел в меню слева');
	});

	it('рендерит режим solo с кнопкой возврата', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'ignored',
				solo: true
			}
		});

		expect(body).toContain('data-solo="true"');
		expect(body).toContain('solo-back-button');
		expect(body).toContain('solo-back-button--menu');
		expect(body).toContain('Показать меню');
	});

	it('рендерит страницу «О приложении» при передаче page: about', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'about'
			}
		});

		expect(body).toContain('reDTF');
		expect(body).toContain('Переосмысление клиентского опыта для DTF');
		expect(body).toContain('Пользовательское соглашение');
		expect(body).toContain('id="about-documents"');
	});

	it('рендерит страницу «Хочу помочь» при передаче page: help', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'help'
			}
		});

		expect(body).toContain('Поддержите reDTF');
		expect(body).toContain('Расскажите о проекте');
		expect(body).toContain('Поддержать проект');
	});

	it('рендерит страницу «Поддержавшие проект» при передаче page: supporters', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'supporters'
			}
		});

		expect(body).toContain('Поддержавшие проект');
		expect(body).toContain('Загрузка списка спонсоров...');
	});

	it('открывает «О приложении» при передаче page: legal', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'legal'
			}
		});

		expect(body).toContain('Пользовательское соглашение');
		expect(body).toContain('Политика конфиденциальности');
	});

	it('рендерит страницу «Дебаг» при передаче page: debug', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'debug'
			}
		});

		expect(body).toContain('Подсветка Safe Area и панелей');
		expect(body).toContain('Плавающий HUD метрик');
		expect(body).toContain('Безопасная область (Safe Area)');
		expect(body).toContain('Верхняя панель (--header-height)');
	});

	it('рендерит подменю раздела со стрелкой назад справа от заголовка', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				section: 'interface'
			}
		});

		expect(body).toContain('Интерфейс');
		expect(body).toContain('folder-back');
		expect(body).toContain('aria-label="Назад к разделам"');

		// Заголовок предшествует кнопке возврата в разметке шапки сайдбара
		const titleIndex = body.indexOf('side-title');
		const backIndex = body.indexOf('folder-back');
		expect(titleIndex).toBeGreaterThan(-1);
		expect(backIndex).toBeGreaterThan(-1);
		expect(titleIndex).toBeLessThan(backIndex);
	});

	it('скрывает настройки для мобильных на десктопе и показывает настройки для десктопа', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				section: 'interface',
				page: 'interface-content',
				device: 'desktop'
			}
		});

		// В подменю на десктопе видна Верхняя панель, скрыта Мобильная панель
		expect(body).toContain('Верхняя панель');
		expect(body).not.toContain('Мобильная панель');

		// Десктопная настройка ширины контента видна
		expect(body).toContain('Ширина контента');
	});

	it('показывает настройки для мобильных на смартфонах и скрывает десктопные', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				section: 'interface',
				page: 'interface-mobile-bar',
				device: 'mobile'
			}
		});

		// В подменю на смартфонах видны обе панели
		expect(body).toContain('Мобильная панель');
		expect(body).toContain('Верхняя панель');

		// Мобильные настройки видны
		expect(body).toContain('Блюр мобильного бара');
		expect(body).toContain('Плавающий мобильный бар');
		// Десктопная настройка ширины контента скрыта
		expect(body).not.toContain('Ширина контента');
	});

	it('верхняя панель на смартфоне показывает свои настройки, на десктопе их нет', () => {
		const props = { onclose: () => {}, section: 'interface', page: 'interface-top-bar' };
		const mobile = render(SettingsScreen, { props: { ...props, device: 'mobile' } }).body;
		for (const text of ['Вид верхней панели', 'Как на сайте', 'experimental', 'Блюр верхней панели', 'Заголовок поста в верхней панели', 'Скрывать верхнюю панель при прокрутке']) {
			expect(mobile).toContain(text);
		}

		const desktop = render(SettingsScreen, { props: { ...props, device: 'desktop' } }).body;
		expect(desktop).toContain('Блюр верхней панели');
		expect(desktop).not.toContain('Вид верхней панели');
	});

	it('пункт «Верхняя панель» на смартфоне есть у redtf и скрыт у темы без её полей', () => {
		const props = { onclose: () => {}, section: 'interface', page: 'interface-content', device: 'mobile' as const };
		const previousTheme = activeTheme.id;
		try {
			activeTheme.set('redtf');
			expect(render(SettingsScreen, { props }).body).toContain('Верхняя панель');
			activeTheme.set('dtf2022');
			expect(render(SettingsScreen, { props }).body).not.toContain('Верхняя панель');
		} finally {
			activeTheme.set(previousTheme);
		}
	});

	it('меняет местами блоки в выборе темы: сначала тема, затем цветовая схема', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'theme-select'
			}
		});

		const themeIndex = body.indexOf('Выбор темы');
		const colorSchemeIndex = body.indexOf('Цветовая палитра');
		expect(themeIndex).toBeGreaterThan(-1);
		expect(colorSchemeIndex).toBeGreaterThan(-1);
		expect(themeIndex).toBeLessThan(colorSchemeIndex);
	});

	it('рендерит раздел Приложение с нужными параметрами и кнопкой выбора иконки', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'app'
			}
		});

		expect(body).toContain('Тактильный отклик (вибрация)');
		expect(body).toContain('Продвинутые эффекты прозрачности и размытия');
		expect(body).toContain('Невидимая подпись reDTF');
		expect(body).toContain('Превью ссылок в соцсетях');
		expect(body).toContain('Иконка приложения');
		expect(body).toContain('Выбрать');
	});

	it('рендерит раздел Верхняя панель с меню аватара и блюром', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'interface-top-bar',
				device: 'desktop'
			}
		});

		expect(body).toContain('Меню по клику на аватар');
		expect(body).toContain('Блюр верхней панели');
	});

	it('рендерит раздел Лента и контент с рекомендациями и соло-ссылкой на фильтрацию', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'interface-content'
			}
		});

		expect(body).not.toContain('Сортировать по моему рейтингу');
		expect(body).toContain('Медиа в посте');
		expect(body).toContain('Рекомендации под постом');
		expect(body).toContain('Фильтрация контента');
		expect(body).toContain('Чёрный список и стоп-слова');
	});

	it('рендерит раздел Моя лента с рейтингом и заглушкой входа без сессии', () => {
		authStorage.logout();
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'feed'
			}
		});

		expect(body).toContain('Сортировать по моему рейтингу');
		expect(body).toContain('Нужен вход в DTF');
	});

	it('рендерит раздел Моя лента с рейтингом и группой настроек DTF при авторизации', () => {
		authStorage.session = {
			type: 'Bearer',
			accessToken: 'test-token',
			refreshToken: 'test-refresh',
			accessExpTimestamp: 0,
			refreshExpTimestamp: 0
		};

		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'feed'
			}
		});

		expect(body).toContain('Сортировать по моему рейтингу');
		expect(body).toContain('Настройки с DTF');

		authStorage.logout();
	});

	it('рендерит Оценки с соло-ссылкой на Реестр реакций', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'interface-votes'
			}
		});

		expect(body).toContain('Оценки');
		expect(body).toContain('Реестр реакций');
		expect(body).toContain('Настройка реакций');
	});

	it('рендерит Комментарии с соло-ссылкой на параметры приложения для подписи и учитывает touch-флаг', () => {
		const { body: desktopBody } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'interface-comments',
				device: 'desktop',
				touch: false
			}
		});

		expect(desktopBody).toContain('Голос за себя при публикации');
		expect(desktopBody).toContain('как на Reddit');
		expect(desktopBody).toContain('Вложенные комментарии');
		expect(desktopBody).toContain('Виртуализация комментариев');
		expect(desktopBody).toContain('Подпись reDTF');
		expect(desktopBody).not.toContain('Действия свайпа по комментарию');

		const { body: tabletBody } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'interface-comments',
				device: 'desktop',
				touch: true
			}
		});
		expect(tabletBody).toContain('Действия свайпа по комментарию');
	});

	it('рендерит настройку типографики на странице Редактор', () => {
		const { body } = render(SettingsScreen, {
			props: {
				onclose: () => {},
				page: 'interface-editor'
			}
		});

		expect(body).toContain('Редактор');
		expect(body).toContain('Типографика при вводе');
	});

	it('разрешает алиасы страниц и разделов через resolveInitialNav', () => {
		expect(resolveInitialNav('themes', undefined, false)).toEqual({
			folderId: null,
			pageId: 'theme-select',
			section: undefined
		});
		expect(resolveInitialNav('behavior-comments', undefined, false)).toEqual({
			folderId: 'interface',
			pageId: 'interface-comments',
			section: undefined
		});
		expect(resolveInitialNav('legal', 'other', false)).toEqual({
			folderId: null,
			pageId: 'about',
			section: 'documents'
		});
		expect(resolveInitialNav(undefined, 'appearance', false)).toEqual({
			folderId: 'interface',
			pageId: null,
			section: 'appearance'
		});
		expect(resolveInitialNav('debug', undefined, false)).toEqual({
			folderId: null,
			pageId: null,
			section: undefined
		});
	});

	it('показывает поиск только на главной (в корневом слое сайдбара)', () => {
		const desktopMain = render(SettingsScreen, {
			props: { onclose: () => {}, device: 'desktop' }
		});
		expect(desktopMain.body).toMatch(/class="nav-layer[^"]*">\s*<div class="search-box/);

		const desktopPage = render(SettingsScreen, {
			props: { onclose: () => {}, device: 'desktop', page: 'sources' }
		});
		expect(desktopPage.body).toMatch(/class="nav-layer[^"]*">\s*<div class="search-box/);

		const desktopFolder = render(SettingsScreen, {
			props: { onclose: () => {}, device: 'desktop', section: 'appearance' }
		});
		expect(desktopFolder.body).toMatch(/nav-layer--hidden[^>]*>\s*<div class="search-box/);

		const mobilePage = render(SettingsScreen, {
			props: { onclose: () => {}, device: 'mobile', page: 'sources' }
		});
		expect(mobilePage.body).toContain('data-view="page"');
	});
});
