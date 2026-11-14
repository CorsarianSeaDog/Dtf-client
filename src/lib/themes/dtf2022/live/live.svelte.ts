import { applyEvents, isVisible, type LiveEvent, type LiveFilter, type LiveItem } from './liveModel';

let items = $state.raw<LiveItem[]>([]);

/** Поток карточек колонки Live. Источник данных (live/source.ts) зовёт `push`, колонка читает `items` */
export const liveFeed = {
	/** Карточки по порядку прихода */
	get items() {
		return items;
	},
	/**
	 * Новая пачка событий. Вебсокет передаёт `filter` (подписки и игнор пользователя),
	 * тогда лишние события отбрасываются здесь; без фильтра пропускаются все.
	 */
	push(events: LiveEvent[], filter?: LiveFilter) {
		items = applyEvents(items, filter ? events.filter((e) => isVisible(e, filter)) : events);
	},
	/** Плашку-уведомление открыли: убираем её из потока. Вебсокет здесь же помечает уведомление прочитанным (`POST /notifications/mark-as-read`) */
	dismiss(hash: string) {
		items = items.filter((i) => i.hash !== hash);
	},
	clear() {
		items = [];
	}
};
