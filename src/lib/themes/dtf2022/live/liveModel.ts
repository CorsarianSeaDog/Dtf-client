/*
 * Модель правой колонки DTF 2022: поток «Комментарии» (Live).
 * Правила взяты из бандла оригинала (сентябрь 2022): типы событий, лимит 20 карточек,
 * замена карточки с тем же hash, обрезка текста до 90 символов.
 */

export type LiveMediaType = 'image' | 'video' | 'movie' | 'link' | 'tweet' | 'telegram' | 'instagram';

export interface LiveMedia {
	type: LiveMediaType;
	/** Для картинок — адрес, для ссылок — подпись */
	value: string;
}

/** Плашка-уведомление: вместо текста комментария показывает действие автора («ответил на ваш комментарий») */
export interface LiveNotification {
	/** От вида зависит значок на аватарке: ответ, комментарий к записи, оценка */
	kind: 'reply' | 'comment' | 'like';
	/** Что сделал автор, без имени: «ответил на ваш комментарий» */
	text: string;
}

export interface LiveItem {
	type: 'comment_add' | 'comment_voted' | 'comment_replied' | 'entry_published' | 'entry_commented';
	/** Идентификатор события: событие с тем же hash заменяет прежнюю карточку */
	hash: string;
	/** Время события, мс */
	date: number;
	user: { id: number; name: string; avatarUrl?: string; isVerified?: boolean };
	/** Текст комментария; в нём могут быть упоминания вида `[@123|Имя]` */
	text: string;
	postId: number;
	commentId?: number;
	/** Запись, под которой написан комментарий */
	postTitle: string;
	donate?: number;
	media?: LiveMedia[];
	/** Подсайт записи: по нему событие фильтруется по подпискам */
	subsiteId?: number;
	/** Есть — карточка рисуется плашкой-уведомлением, а не комментарием */
	notification?: LiveNotification;
}

export type LiveEvent = LiveItem | { type: 'comment_removed'; commentId: number } | { type: 'comment_edited'; commentId: number; text: string };

/** Что показывает колонка: только комментарии или ещё и входящие уведомления */
export type LiveContent = 'comments' | 'comments-notifications';

/** Чьи события пропускать: подсайты из подписок и авторы не из игнора */
export interface LiveFilter {
	subscribed: ReadonlySet<number>;
	ignored: ReadonlySet<number>;
}

export const LIVE_LIMIT = 20;
const PREVIEW_LENGTH = 90;

/** «[@123|Имя] привет» → «@Имя привет» */
function plainText(text: string): string {
	return text.replace(/\[@\d+\|(.+?)\]/g, '@$1');
}

/** Текст карточки: без разметки упоминаний, не длиннее 90 символов */
export function shorten(text: string): string {
	const plain = plainText(text);
	return plain.length > PREVIEW_LENGTH ? plain.slice(0, PREVIEW_LENGTH).trim() + '…' : plain;
}

/** Вложения одного типа показываются один раз (ponytail: так сделан оригинал, судя по сравнению по `type`) */
export function uniqueByType(media: LiveMedia[] = []): LiveMedia[] {
	return media.filter((m, i) => media.findIndex((x) => x.type === m.type) === i);
}

/** Событие показывается, если подсайт в подписках (или его нет) и автор не в игноре */
export function isVisible(e: LiveEvent, { subscribed, ignored }: LiveFilter): boolean {
	if (!('user' in e)) return true;
	return (!e.subsiteId || subscribed.has(e.subsiteId)) && !ignored.has(e.user.id);
}

/**
 * Применяет событие к списку карточек (порядок прихода). Карточка с тем же hash заменяется,
 * ответ или комментарий к записи убирает прежние карточки того же комментария (плашки не трогает),
 * в списке остаётся не больше `LIVE_LIMIT` последних.
 */
export function applyEvent(items: LiveItem[], e: LiveEvent): LiveItem[] {
	if (e.type === 'comment_removed') return items.filter((i) => i.commentId !== e.commentId);
	if (e.type === 'comment_edited') return items.map((i) => (i.commentId === e.commentId ? { ...i, text: e.text } : i));
	if (!e.hash) return items;
	const replacesComment = (e.type === 'comment_replied' || e.type === 'entry_commented') && e.commentId !== undefined;
	const rest = items.filter((i) => i.hash !== e.hash && !(replacesComment && i.commentId === e.commentId && !i.notification));
	return [...rest, e].slice(-LIVE_LIMIT);
}

/** Пачка событий: сначала плашки-уведомления, потом остальные (как в оригинале) */
export function applyEvents(items: LiveItem[], events: LiveEvent[]): LiveItem[] {
	const notices = events.filter((e) => 'notification' in e && e.notification);
	const rest = events.filter((e) => !notices.includes(e));
	return [...notices, ...rest].reduce(applyEvent, items);
}

/** Порядок показа: новые сверху; плашки видны только в режиме с уведомлениями */
export function visibleItems(items: LiveItem[], content: LiveContent): LiveItem[] {
	return items.filter((i) => content === 'comments-notifications' || !i.notification).sort((a, b) => b.date - a.date);
}
