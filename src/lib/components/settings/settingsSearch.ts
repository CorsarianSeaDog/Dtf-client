import {
	matchesVisibility,
	pickVisibility,
	type SettingField,
	type SettingVisibility,
	type VisibilityContext
} from '$lib/themes/types';

export interface SettingsSearchItem extends SettingVisibility {
	id: string;
	pageId: string;
	folderId?: string;
	icon: string;
	/** Хлебная крошка («пункт») в стиле поиска Android */
	path: string;
	/** Название найденного параметра или раздела */
	title: string;
	subtitle?: string;
	keywords?: string;
	options?: string[];
	/** Ключ `[data-setting-key]` для точного скролла и подсветки */
	settingKey?: string;
	/** Запасной текст заголовка строки/группы для страниц без схемы */
	anchorText?: string;
	devOnly?: boolean;
	requiresGestures?: boolean;
}

export interface SettingsSearchMatch {
	item: SettingsSearchItem;
	/** Подходящий вариант выбора, если совпадение нашлось в опциях */
	matchedOption?: string;
}

export interface DeclarativeFieldGroup {
	pageId: string;
	folderId?: string;
	icon: string;
	path: string;
	fields: SettingField[];
	devOnly?: boolean;
}

export interface SettingsNavPageMeta extends SettingVisibility {
	pageId: string;
	folderId?: string;
	icon: string;
	path: string;
	title: string;
	keywords?: string;
	devOnly?: boolean;
}

/** Приводит текст к единому виду для поиска: нижний регистр и `ё` → `е` */
export function normalizeSearchText(text: string): string {
	return text.toLowerCase().replaceAll('ё', 'е').trim();
}

/**
 * Статические пункты поиска для страниц настроек со своей разметкой.
 * ponytail: поддерживается вручную для не-схемных страниц; при появлении новых строк в них дописывать сюда.
 */
const CUSTOM_SEARCH_ITEMS: SettingsSearchItem[] = [
	// Мой профиль
	{
		id: 'account:name',
		pageId: 'account',
		icon: 'profile',
		path: 'Аккаунт › Мой профиль',
		title: 'Имя и описание профиля',
		subtitle: 'Так вас видят на DTF',
		keywords: 'ник имя био описание о себе профиль',
		anchorText: 'Имя'
	},
	{
		id: 'account:security',
		pageId: 'account',
		icon: 'profile',
		path: 'Аккаунт › Мой профиль',
		title: 'Почта и пароль',
		subtitle: 'Их можно сменить только на сайте DTF',
		keywords: 'email почта пароль вход безопасность аккаунт',
		anchorText: 'Почта и пароль'
	},

	// Моя лента
	{
		id: 'feed:rank',
		pageId: 'feed',
		icon: 'feed',
		path: 'Контент › Моя лента',
		title: 'Сортировать по моему рейтингу',
		subtitle: '«Популярное» и «Лучшие» упорядочиваются по очкам из настроек реакций',
		keywords: 'рейтинг сортировка популярное лучшие худшие реакции комментарии',
		anchorText: 'Сортировать по моему рейтингу'
	},
	{
		id: 'feed:defaultFeed',
		pageId: 'feed',
		icon: 'feed',
		path: 'Контент › Моя лента',
		title: 'Лента по умолчанию',
		subtitle: 'Какая лента открывается первой при запуске',
		options: ['Популярное', 'Свежее', 'Моя лента'],
		keywords: 'стартовая лента запуск',
		anchorText: 'Лента по умолчанию'
	},
	{
		id: 'feed:myFeedSorting',
		pageId: 'feed',
		icon: 'feed',
		path: 'Контент › Моя лента',
		title: 'Сортировка моей ленты',
		subtitle: 'Порядок постов во вкладке «Моя лента»',
		options: ['Свежее', 'Популярное'],
		keywords: 'порядок постов',
		anchorText: 'Сортировка моей ленты'
	},
	{
		id: 'feed:nsfw',
		pageId: 'feed',
		icon: 'feed',
		path: 'Контент › Моя лента',
		title: 'Размывать NSFW',
		subtitle: 'Откровенные картинки и видео в ленте закрыты размытием',
		keywords: 'nsfw 18+ блюр размытие эротика',
		anchorText: 'Размывать NSFW'
	},
	{
		id: 'feed:hideSeen',
		pageId: 'feed',
		icon: 'feed',
		path: 'Контент › Моя лента',
		title: 'Скрывать прочитанные посты',
		subtitle: 'В выбранных лентах и рекомендациях под постами. Список хранится только на этом устройстве',
		options: ['Популярное', 'Свежее', 'Моя лента', 'Рекомендации под постами'],
		keywords: 'прочитанные просмотренные скрытие пикабу',
		anchorText: 'Скрывать прочитанные посты'
	},
	{
		id: 'feed:seenOpen',
		pageId: 'feed',
		icon: 'feed',
		path: 'Контент › Моя лента',
		title: 'Открытие поста',
		subtitle: 'Прочитан, если пост был открыт столько секунд',
		options: ['Не считать', '1 с', '3 с', '5 с', '10 с', '30 с'],
		keywords: 'прочитанные открытие время секунды',
		anchorText: 'Открытие поста'
	},
	{
		id: 'feed:seenFullRead',
		pageId: 'feed',
		icon: 'feed',
		path: 'Контент › Моя лента',
		title: 'Дочитан до конца',
		subtitle: 'Прочитан, если вы долистали пост до конца',
		keywords: 'прочитанные дочитан конец поста',
		anchorText: 'Дочитан до конца'
	},
	{
		id: 'feed:seenFeed',
		pageId: 'feed',
		icon: 'feed',
		path: 'Контент › Моя лента',
		title: 'Показ в ленте',
		subtitle: 'Прочитан, если карточка была в центре экрана ленты столько секунд',
		options: ['Не считать', '1 с', '2 с', '3 с', '5 с'],
		keywords: 'прочитанные показ лента экран секунды',
		anchorText: 'Показ в ленте'
	},
	{
		id: 'feed:clearSeen',
		pageId: 'feed',
		icon: 'feed',
		path: 'Контент › Моя лента',
		title: 'Забыть прочитанное',
		subtitle: 'Все посты снова появятся в лентах после обновления',
		keywords: 'очистить сбросить прочитанные история',
		anchorText: 'Забыть прочитанное'
	},

	// Чёрный список
	{
		id: 'ignored:tags',
		pageId: 'ignored',
		icon: 'ignored',
		path: 'Контент › Чёрный список',
		title: 'Скрытые теги',
		subtitle: 'Скрытие контента в приложении по тегам',
		keywords: 'чс бан мут игнор теги скрыть',
		anchorText: 'Скрытые теги'
	},
	{
		id: 'ignored:keywords',
		pageId: 'ignored',
		icon: 'ignored',
		path: 'Контент › Чёрный список',
		title: 'Скрытые ключевые слова и фразы',
		subtitle: 'Фильтр по словам и готовые пресеты ключевых слов',
		keywords: 'стоп-слова фразы пресеты спойлеры политота',
		anchorText: 'Скрытые ключевые слова и фразы'
	},
	{
		id: 'ignored:mode',
		pageId: 'ignored',
		icon: 'ignored',
		path: 'Контент › Чёрный список',
		title: 'Режим скрытия',
		subtitle: 'Мягкий (плашка с кнопкой «Показать») или жёсткий',
		options: ['Мягкий', 'Жёсткий'],
		keywords: 'мягкий жёсткий скрытие фильтр',
		anchorText: 'Режим скрытия'
	},
	{
		id: 'ignored:posts',
		pageId: 'ignored',
		icon: 'ignored',
		path: 'Контент › Чёрный список',
		title: 'Фильтровать посты',
		subtitle: 'Скрывать посты в ленте по тегам и фразам',
		anchorText: 'Фильтровать посты'
	},
	{
		id: 'ignored:comments',
		pageId: 'ignored',
		icon: 'ignored',
		path: 'Контент › Чёрный список',
		title: 'Фильтровать комментарии',
		subtitle: 'Скрывать комментарии под постами по тегам и фразам',
		anchorText: 'Фильтровать комментарии'
	},
	{
		id: 'ignored:users',
		pageId: 'ignored',
		icon: 'ignored',
		path: 'Контент › Чёрный список',
		title: 'Скрытые пользователи',
		subtitle: 'Их записи, комментарии и уведомления от них не показываются',
		keywords: 'заблокированные авторы чс',
		anchorText: 'Скрытые пользователи'
	},
	{
		id: 'ignored:dtf',
		pageId: 'ignored',
		icon: 'ignored',
		path: 'Контент › Чёрный список',
		title: 'Чёрный список на DTF',
		subtitle: 'Скрытые пользователи, темы и подсайты в аккаунте DTF',
		keywords: 'подсайты сообщества бан dtf',
		anchorText: 'Чёрный список на DTF'
	},

	// Источники данных
	{
		id: 'sources:add',
		pageId: 'sources',
		icon: 'sources',
		path: 'Контент › Источники данных',
		title: 'Добавить источник или плагин',
		subtitle: 'Кастомные сервера, каталог источников и расширения',
		keywords: 'плагины расширения каталог github архив',
		anchorText: 'Добавить источник'
	},
	{
		id: 'sources:restore',
		pageId: 'sources',
		icon: 'sources',
		path: 'Контент › Источники данных',
		title: 'Восстановленные комментарии',
		subtitle: 'Что восстанавливать, показывать развёрнутыми и восстанавливать автора',
		keywords: 'удалённые комментарии архив восстановление',
		anchorText: 'Восстановленные комментарии'
	},

	// Реестр реакций
	{
		id: 'reactions:likeDislike',
		pageId: 'reactions',
		icon: 'reactions',
		path: 'Персонализация › Реестр реакций',
		title: 'Реакции для лайка и дизлайка',
		subtitle: 'Какие реакции ставят кнопки лайка и дизлайка',
		keywords: 'лайк дизлайк кнопка реакция',
		anchorText: 'Лайк и дизлайк'
	},
	{
		id: 'reactions:favorites',
		pageId: 'reactions',
		icon: 'reactions',
		path: 'Персонализация › Реестр реакций',
		title: 'Любимые реакции для свайпа',
		subtitle: 'Быстрые реакции при свайпе по комментарию',
		keywords: 'свайп жест избранные любимые реакции',
		anchorText: 'Любимые реакции',
		touch: true,
		requiresGestures: true
	},
	{
		id: 'reactions:weights',
		pageId: 'reactions',
		icon: 'reactions',
		path: 'Персонализация › Реестр реакций',
		title: 'Вес и вид всех реакций',
		subtitle: 'Плюс, нейтральная или минус и множитель очков для рейтинга',
		keywords: 'вес очки плюс минус нейтральная рейтинг',
		anchorText: 'Все реакции'
	},

	// Приложение и Иконка
	{
		id: 'app:icon',
		pageId: 'app-icon',
		icon: 'app-icon',
		path: 'Персонализация › Приложение',
		title: 'Иконка приложения',
		subtitle: 'Выбор значка приложения и вкладки браузера или загрузка своей иконки',
		keywords: 'значок логотип favicon своя иконка svg png',
		anchorText: 'Иконка приложения'
	},

	// Сеть и прокси
	{
		id: 'network:proxies',
		pageId: 'network',
		icon: 'network',
		path: 'Данные › Сеть и прокси',
		title: 'CORS-прокси и очередь failover',
		subtitle: 'Выбор, проверка доступности и добавление своего прокси-сервера',
		keywords: 'прокси proxy cors сеть failover вход авторизация valtown cloudflare'
	},

	// Моя статистика
	{
		id: 'stats:collect',
		pageId: 'stats',
		icon: 'stats',
		path: 'Данные › Моя статистика',
		title: 'Собирать мою статистику',
		subtitle: 'Локальная статистика времени, прочитанных постов и реакций',
		keywords: 'статистика сбор время посты комментарии авторы',
		settingKey: 'collectStats'
	},
	{
		id: 'stats:summary',
		pageId: 'stats',
		icon: 'stats',
		path: 'Данные › Моя статистика',
		title: 'Сводка и графики активности',
		subtitle: 'Время в приложении, стрики, часы суток и любимые подсайты',
		keywords: 'сводка график часы дни стрик сбросить статистику',
		anchorText: 'Сводка'
	},

	// О проекте
	{
		id: 'help:support',
		pageId: 'help',
		icon: 'help',
		path: 'О проекте › Хочу помочь',
		title: 'Поддержать проект и участие в разработке',
		subtitle: 'Донат, поделиться, звезда на GitHub, сообщить о баге',
		keywords: 'донат поддержка github issue баг telegram дизайн',
		anchorText: 'Поддержите reDTF'
	},
	{
		id: 'about:updatesNative',
		pageId: 'about',
		icon: 'about',
		path: 'О проекте › О приложении',
		title: 'Обновления приложения и автопроверка',
		subtitle: 'Проверка OTA-обновлений и новых APK на GitHub',
		keywords: 'версия обновление ota apk',
		anchorText: 'Обновления',
		native: true
	},
	{
		id: 'about:updatesWeb',
		pageId: 'about',
		icon: 'about',
		path: 'О проекте › О приложении',
		title: 'Обновление и версия приложения',
		subtitle: 'Текущая версия и список релизов',
		keywords: 'версия обновление релизы pwa',
		anchorText: 'Обновления',
		native: false
	},
	{
		id: 'about:documents',
		pageId: 'about',
		icon: 'about',
		path: 'О проекте › О приложении',
		title: 'Документы и лицензия',
		subtitle: 'Пользовательское соглашение, политика конфиденциальности, лицензия',
		keywords: 'правила соглашение приватность конфиденциальность лицензия',
		anchorText: 'Документы'
	},

	// Дебаг
	{
		id: 'debug:safeArea',
		pageId: 'debug',
		icon: 'debug',
		path: 'Разработка › Дебаг',
		title: 'Подсветка Safe Area и панелей',
		subtitle: 'Цветные оверлеи с разметкой безопасных зон поверх интерфейса',
		keywords: 'safe area отступы оверлей отладка',
		anchorText: 'Подсветка Safe Area и панелей',
		devOnly: true
	},
	{
		id: 'debug:hud',
		pageId: 'debug',
		icon: 'debug',
		path: 'Разработка › Дебаг',
		title: 'Плавающий HUD метрик',
		subtitle: 'Индикатор в углу экрана со значениями отступов и размеров',
		keywords: 'hud метрики fps размеры отладка',
		anchorText: 'Плавающий HUD метрик',
		devOnly: true
	},
	{
		id: 'debug:haptics',
		pageId: 'debug',
		icon: 'debug',
		path: 'Разработка › Дебаг',
		title: 'Тактильный отклик (Haptics Lab)',
		subtitle: 'Тестирование аппаратных вибродвижков и примитивов Android',
		keywords: 'вибрация вибромотор haptics примитивы тест',
		anchorText: 'Тактильный отклик (Haptics Lab)',
		devOnly: true
	}
];

function fieldToSearchItem(
	field: SettingField,
	meta: Omit<DeclarativeFieldGroup, 'fields'>
): SettingsSearchItem {
	const options =
		field.type === 'radio' || field.type === 'select'
			? field.options.flatMap((opt) => (opt.description ? [opt.title, opt.description] : [opt.title]))
			: undefined;

	return {
		id: `${meta.pageId}:${field.key}`,
		pageId: meta.pageId,
		folderId: meta.folderId,
		icon: meta.icon,
		path: meta.path,
		title: field.title,
		subtitle: field.description,
		options,
		settingKey: field.key,
		...pickVisibility(field),
		devOnly: meta.devOnly
	};
}

/** Собирает единый индекс поиска из разделов, декларативных полей и статических страниц */
export function buildSettingsSearchIndex(params: {
	navPages: SettingsNavPageMeta[];
	fieldGroups: DeclarativeFieldGroup[];
	visibility: VisibilityContext;
	isDevVisible: boolean;
	hasGestures: boolean;
}): SettingsSearchItem[] {
	const raw: SettingsSearchItem[] = [
		...params.navPages.map((nav) => ({
			id: `page:${nav.pageId}`,
			pageId: nav.pageId,
			folderId: nav.folderId,
			icon: nav.icon,
			path: nav.path,
			title: nav.title,
			keywords: nav.keywords,
			...pickVisibility(nav),
			devOnly: nav.devOnly
		})),
		...params.fieldGroups.flatMap((group) =>
			group.fields.map((field) => fieldToSearchItem(field, group))
		),
		...CUSTOM_SEARCH_ITEMS
	];

	const seen = new Set<string>();
	const result: SettingsSearchItem[] = [];

	// Сначала конкретные настройки, чтобы при совпадении имени со страницей выжила именно настройка со скроллом
	const prioritized = raw.toSorted((a, b) => Number(Boolean(a.id.startsWith('page:'))) - Number(Boolean(b.id.startsWith('page:'))));

	for (const item of prioritized) {
		if (item.devOnly && !params.isDevVisible) continue;
		if (!matchesVisibility(item, params.visibility)) continue;
		if (item.requiresGestures && !params.hasGestures) continue;

		const dedupeKey = `${item.pageId}::${normalizeSearchText(item.title)}`;
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		result.push(item);
	}

	return result;
}

/** Ищет настройки по многословному запросу и ранжирует по релевантности */
export function searchSettings(items: SettingsSearchItem[], query: string): SettingsSearchMatch[] {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) return [];

	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return [];

	const scored: Array<{ match: SettingsSearchMatch; score: number }> = [];

	for (const item of items) {
		const normTitle = normalizeSearchText(item.title);
		const normSubtitle = normalizeSearchText(item.subtitle ?? '');
		const normPath = normalizeSearchText(item.path);
		const normKeywords = normalizeSearchText(item.keywords ?? '');
		const normOptions = (item.options ?? []).map((opt) => ({
			raw: opt,
			norm: normalizeSearchText(opt)
		}));

		const haystack = [
			normTitle,
			normSubtitle,
			normPath,
			normKeywords,
			...normOptions.map((o) => o.norm)
		].join(' ');

		if (!tokens.every((token) => haystack.includes(token))) continue;

		let score = 0;
		if (normTitle === normalizedQuery) score += 100;
		else if (normTitle.startsWith(normalizedQuery)) score += 70;
		else if (normTitle.includes(normalizedQuery)) score += 50;

		for (const token of tokens) {
			if (normTitle.includes(token)) score += 20;
			else if (normOptions.some((o) => o.norm.includes(token))) score += 12;
			else if (normPath.includes(token)) score += 8;
			else if (normKeywords.includes(token) || normSubtitle.includes(token)) score += 5;
		}

		// Если совпали не только по заголовку, а внутри варианта выбора — подскажем его в скобках
		let matchedOption: string | undefined;
		if (!tokens.every((t) => normTitle.includes(t))) {
			const hit = normOptions.find((o) => tokens.some((t) => o.norm.includes(t)));
			if (hit) matchedOption = hit.raw;
		}

		// Настройки чуть выше общих заглушек страниц при равном счёте
		if (!item.id.startsWith('page:')) score += 2;

		scored.push({ match: { item, matchedOption }, score });
	}

	scored.sort((a, b) => b.score - a.score || a.match.item.title.localeCompare(b.match.item.title, 'ru'));
	return scored.map((entry) => entry.match);
}

const HIGHLIGHT_CLASS = 'setting-search-highlight';

function findSettingElement(
	scroller: HTMLElement,
	target: { settingKey?: string; anchorText?: string }
): { scrollEl: HTMLElement; flashEl: HTMLElement } | null {
	if (target.settingKey) {
		const byKey = scroller.querySelector<HTMLElement>(`[data-setting-key="${CSS.escape(target.settingKey)}"]`);
		if (byKey) {
			const card = byKey.querySelector<HTMLElement>('.group__list');
			return { scrollEl: byKey, flashEl: card ?? byKey };
		}
	}

	if (!target.anchorText) return null;
	const needle = normalizeSearchText(target.anchorText);
	const pageEl = scroller.querySelector('.page') ?? scroller;

	const candidates = pageEl.querySelectorAll<HTMLElement>(
		'.row__title, .group__title, .filter-label, .section-title, .proxy-card__name, .hero__title, .field__label, .notice__title'
	);

	for (const el of candidates) {
		const text = normalizeSearchText(el.textContent ?? '');
		if (!text || (text !== needle && !text.includes(needle))) continue;

		const row = el.closest<HTMLElement>('.row, .filter-card, .proxy-card, .hero');
		if (row) return { scrollEl: row, flashEl: row };

		const group = el.closest<HTMLElement>('.group');
		if (group) {
			const card = group.querySelector<HTMLElement>('.group__list');
			return { scrollEl: group, flashEl: card ?? group };
		}

		return { scrollEl: el, flashEl: el };
	}

	return null;
}

function applyScrollAndFlash(found: { scrollEl: HTMLElement; flashEl: HTMLElement }): () => void {
	const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
	found.scrollEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });

	const { flashEl } = found;
	flashEl.classList.remove(HIGHLIGHT_CLASS);
	void flashEl.offsetWidth;
	flashEl.classList.add(HIGHLIGHT_CLASS);

	const timer = setTimeout(() => {
		flashEl.classList.remove(HIGHLIGHT_CLASS);
	}, 1800);

	return () => {
		clearTimeout(timer);
		flashEl.classList.remove(HIGHLIGHT_CLASS);
	};
}

/**
 * Прокручивает контейнер настроек к целевой строке и подсвечивает её.
 * Если страница грузит данные асинхронно (FeedSettings, AccountSettings и др.),
 * ждёт появления элемента в DOM через MutationObserver до 2 секунд.
 */
export function scrollAndHighlightSetting(
	scroller: HTMLElement | undefined,
	target: { settingKey?: string; anchorText?: string }
): () => void {
	if (!scroller || (!target.settingKey && !target.anchorText)) {
		scroller?.scrollTo({ top: 0 });
		return () => {};
	}

	const immediate = findSettingElement(scroller, target);
	if (immediate) return applyScrollAndFlash(immediate);

	let cleanupFlash: (() => void) | undefined;
	const observer = new MutationObserver(() => {
		const found = findSettingElement(scroller, target);
		if (!found) return;
		observer.disconnect();
		clearTimeout(timeout);
		cleanupFlash = applyScrollAndFlash(found);
	});

	observer.observe(scroller, { childList: true, subtree: true });
	const timeout = setTimeout(() => observer.disconnect(), 2000);

	return () => {
		observer.disconnect();
		clearTimeout(timeout);
		cleanupFlash?.();
	};
}
