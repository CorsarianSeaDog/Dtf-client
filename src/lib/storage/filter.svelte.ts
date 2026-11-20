import { persistedState } from './persisted.svelte';
import type { Comment, Notification, Post } from '$lib/api/types';

/*
 * Локальный чёрный список и фильтрация контента в ленте и комментариях.
 * Позволяет скрывать посты и комментарии по тегам, ключевым словам и авторам локально на клиенте,
 * без необходимости быть авторизованным на DTF.
 */

export type FilterMode = 'soft' | 'hard';

/** Пользователь DTF, которого скрыли локально; имя хранится, чтобы показать его в настройках без запроса */
export interface HiddenUser {
	id: number;
	name: string;
}

export interface FilterSettings {
	/** Список скрытых тегов (хранятся без ведущего #) */
	tags: string[];
	/** Список скрытых ключевых слов и фраз */
	keywords: string[];
	/** Скрытые локально пользователи DTF: их посты, комментарии и уведомления от них не показываются */
	users: HiddenUser[];
	/** Режим скрытия: soft — сворачивать под плашку с кнопкой «Показать», hard — скрывать насовсем */
	mode: FilterMode;
	/** Фильтровать посты */
	filterPosts: boolean;
	/** Фильтровать редакторские новости */
	filterNews: boolean;
	/** Фильтровать комментарии */
	filterComments: boolean;
}

export interface FilterMatch {
	matched: boolean;
	kind: 'tag' | 'keyword' | 'user';
	rule: string;
}

export interface KeywordPreset {
	id: string;
	title: string;
	keywords: string[];
}

export const KEYWORD_PRESETS: KeywordPreset[] = [
	{
		id: 'gta6',
		title: 'GTA 6',
		keywords: ['gta 6', 'gta vi', 'гта 6', 'gta6', 'gtavi', 'гта6', 'жта6', 'жта 6', 'grand theft auto vi', 'grand theft auto 6']
	},
	{
		id: 'moregta6',
		title: 'GTA 6 (+)',
		keywords: ['люсия', 'джейсон', 'леонида', 'вайс сити', 'вайсити', 'вайс-сити', 'lucia', 'leonida', 'vice-city', 'vice city', 'vicecity']
	},
	{
		id: 'gta',
		title: 'GTA (все)',
		keywords: ['gta', 'grand theft auto', 'гта', 'жта']
	},
	{
		id: 'giveaways',
		title: 'Розыгрыши',
		keywords: ['розыгрыш', 'конкурс', 'разыгрываем', 'раздаём']
	},
];

export const filterSettings = persistedState<FilterSettings>('redtf:settings:filter', {
	tags: [],
	keywords: [],
	users: [],
	mode: 'soft',
	filterPosts: true,
	filterNews: true,
	filterComments: true
});

/** Нормализует тег: убирает # в начале, пробелы и приводит к нижнему регистру */
export function normalizeTag(tag: string): string {
	return tag.trim().replace(/^#+/, '').toLowerCase();
}

/** Добавляет тег в локальный фильтр */
export function addIgnoredTag(tag: string): boolean {
	const clean = normalizeTag(tag);
	if (!clean || filterSettings.value.tags.includes(clean)) return false;
	filterSettings.patch({ tags: [...filterSettings.value.tags, clean] });
	return true;
}

/** Удаляет тег из локального фильтра */
export function removeIgnoredTag(tag: string) {
	const clean = normalizeTag(tag);
	filterSettings.patch({ tags: filterSettings.value.tags.filter((t) => t !== clean) });
}

/** Скрывает пользователя DTF локально: без входа и без записи в чёрный список аккаунта */
export function hideUser(id: number, name: string): boolean {
	if (isUserHidden(id)) return false;
	filterSettings.patch({ users: [...filterSettings.value.users, { id, name }] });
	return true;
}

/** Возвращает локально скрытого пользователя */
export function unhideUser(id: number) {
	filterSettings.patch({ users: filterSettings.value.users.filter((u) => u.id !== id) });
}

export function isUserHidden(id: number, users: HiddenUser[] = filterSettings.value.users): boolean {
	return users.some((u) => u.id === id);
}

/** Уведомление, у которого все авторы скрыты: «Имя и ещё двое оценили» остаётся, пока виден хоть кто-то из них */
export function isNotificationHidden(
	notification: Pick<Notification, 'userIds'>,
	users: HiddenUser[] = filterSettings.value.users
): boolean {
	const ids = notification.userIds;
	return !!ids?.length && ids.every((id) => isUserHidden(id, users));
}

/** Добавляет ключевое слово в локальный фильтр */
export function addIgnoredKeyword(keyword: string): boolean {
	const clean = keyword.trim().toLowerCase();
	if (!clean || filterSettings.value.keywords.includes(clean)) return false;
	filterSettings.patch({ keywords: [...filterSettings.value.keywords, clean] });
	return true;
}

/** Удаляет ключевое слово из локального фильтра */
export function removeIgnoredKeyword(keyword: string) {
	const clean = keyword.trim().toLowerCase();
	filterSettings.patch({ keywords: filterSettings.value.keywords.filter((k) => k !== clean) });
}

/** Добавляет группу ключевых слов (пресет) в локальный фильтр */
export function addIgnoredKeywords(keywords: string[]): number {
	const current = new Set(filterSettings.value.keywords);
	let added = 0;
	for (const kw of keywords) {
		const clean = kw.trim().toLowerCase();
		if (clean && !current.has(clean)) {
			current.add(clean);
			added++;
		}
	}
	if (added > 0) {
		filterSettings.patch({ keywords: Array.from(current) });
	}
	return added;
}

/** Удаляет группу ключевых слов из локального фильтра */
export function removeIgnoredKeywords(keywords: string[]): void {
	const toRemove = new Set(keywords.map((k) => k.trim().toLowerCase()));
	filterSettings.patch({
		keywords: filterSettings.value.keywords.filter((k) => !toRemove.has(k))
	});
}

/** Проверяет, активен ли пресет (все ли его слова присутствуют в списке скрытых) */
export function isKeywordPresetActive(
	preset: KeywordPreset,
	keywords: string[] = filterSettings.value.keywords
): boolean {
	const current = new Set(keywords);
	return preset.keywords.every((kw) => current.has(kw.trim().toLowerCase()));
}

const tagRegexCache = new Map<string, RegExp>();

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTagRegex(tag: string): RegExp {
	let re = tagRegexCache.get(tag);
	if (!re) {
		re = new RegExp('#' + escapeRegex(tag) + '(?![-_a-zA-Z0-9а-яА-ЯёЁ])', 'i');
		tagRegexCache.set(tag, re);
	}
	return re;
}

/** Извлекает весь текст из заголовка, подсайта, автора и блоков поста для поиска */
export function getPostSearchText(post: Post): string {
	const parts: string[] = [post.title || ''];
	if (post.subsite?.name) parts.push(post.subsite.name);
	if (post.author?.name) parts.push(post.author.name);
	if (Array.isArray(post.blocks)) {
		for (const b of post.blocks) {
			if (!b?.data) continue;
			if (typeof b.data.text === 'string') parts.push(b.data.text);
			if (typeof b.data.title === 'string') parts.push(b.data.title);
			if (Array.isArray(b.data.items)) {
				for (const item of b.data.items) {
					if (typeof item === 'string') parts.push(item);
					else if (item && typeof item.title === 'string') parts.push(item.title);
					else if (item && typeof item.text === 'string') parts.push(item.text);
				}
			}
		}
	}
	return parts.join(' ');
}

function matchEntryFilter(post: Post, settings: FilterSettings): FilterMatch | null {
	const { tags, keywords, users } = settings;
	if (tags.length === 0 && keywords.length === 0 && users.length === 0) return null;

	const author = post.sourceId === 'dtf' && post.author ? users.find((u) => u.id === post.author.id) : undefined;
	if (author) return { matched: true, kind: 'user', rule: author.name };

	if (tags.length === 0 && keywords.length === 0) return null;

	const subsiteName = post.subsite?.name ? normalizeTag(post.subsite.name) : '';
	const fullText = getPostSearchText(post);

	// 1. Проверяем теги
	if (tags.length > 0) {
		const hasHash = fullText.includes('#');
		for (const tag of tags) {
			if (!tag) continue;
			// Совпадение с названием подсайта (на DTF подсайты часто выступают тегами категорий)
			if (subsiteName && subsiteName === tag) {
				return { matched: true, kind: 'tag', rule: `#${tag}` };
			}
			// Хэштег в тексте: #тег с границей слова (не буква, не цифра, не подчеркивание)
			if (hasHash && getTagRegex(tag).test(fullText)) {
				return { matched: true, kind: 'tag', rule: `#${tag}` };
			}
		}
	}

	// 2. Проверяем ключевые слова
	if (keywords.length > 0) {
		const lowerText = fullText.toLowerCase();
		for (const kw of keywords) {
			if (!kw) continue;
			if (lowerText.includes(kw)) {
				return { matched: true, kind: 'keyword', rule: kw };
			}
		}
	}

	return null;
}

/** Проверяет, попадает ли пост под фильтр по тегам или ключевым словам */
export function matchPostFilter(
	post: Post,
	settings: FilterSettings = filterSettings.value
): FilterMatch | null {
	return settings.filterPosts ? matchEntryFilter(post, settings) : null;
}

/** Проверяет, попадает ли редакторская новость под фильтр по тегам, ключевым словам или авторам */
export function matchNewsFilter(
	post: Post,
	settings: FilterSettings = filterSettings.value
): FilterMatch | null {
	return settings.filterNews ? matchEntryFilter(post, settings) : null;
}

export interface FilteredNewsRow {
	item: Post;
	key: string;
	match: FilterMatch | null;
}

/** Отбирает новости редакции для показа с учётом фильтра, режима скрытия и раскрытых вручную строк */
export function filterNewsItems(
	items: Post[],
	options: {
		revealed?: ReadonlySet<string>;
		isHidden?: (post: Post) => boolean;
		settings?: FilterSettings;
	} = {}
): FilteredNewsRow[] {
	const settings = options.settings ?? filterSettings.value;
	const hard = settings.mode === 'hard';
	const rows: FilteredNewsRow[] = [];
	for (const item of items) {
		if (options.isHidden?.(item)) continue;
		const key = `${item.sourceId}_${item.id}`;
		const match = options.revealed?.has(key) ? null : matchNewsFilter(item, settings);
		if (match && hard) continue;
		rows.push({ item, key, match });
	}
	return rows;
}

/** Проверяет, попадает ли комментарий под фильтр по тегам или ключевым словам */
export function matchCommentFilter(
	comment: Comment,
	settings: FilterSettings = filterSettings.value
): FilterMatch | null {
	if (!settings.filterComments) return null;
	const { tags, keywords, users } = settings;
	if (tags.length === 0 && keywords.length === 0 && users.length === 0) return null;

	const author = comment.sourceId === 'dtf' ? users.find((u) => u.id === comment.author.id) : undefined;
	if (author) return { matched: true, kind: 'user', rule: author.name };

	if (tags.length === 0 && keywords.length === 0) return null;

	const content = comment.content || '';

	// 1. Проверяем теги (#тег в тексте комментария)
	if (tags.length > 0 && content.includes('#')) {
		for (const tag of tags) {
			if (!tag) continue;
			if (getTagRegex(tag).test(content)) {
				return { matched: true, kind: 'tag', rule: `#${tag}` };
			}
		}
	}

	// 2. Проверяем ключевые слова
	if (keywords.length > 0) {
		const lowerContent = content.toLowerCase();
		for (const kw of keywords) {
			if (!kw) continue;
			if (lowerContent.includes(kw)) {
				return { matched: true, kind: 'keyword', rule: kw };
			}
		}
	}

	return null;
}
