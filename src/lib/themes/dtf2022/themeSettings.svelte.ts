import { activeThemeSettings } from '../settings.svelte';

/**
 * Вид оценок у постов и комментариев:
 * likes — лайк/дизлайк (DTF начала 2023), rating — стрелки ±, reactions — реакции, как сейчас на сайте.
 * Варианты и подписи описаны в theme.ts, значение хранится в настройках выбранной темы (в том числе форка).
 */
export type VotesStyle = 'likes' | 'rating' | 'reactions';

export const themeSettings = {
	get votes(): VotesStyle {
		return activeThemeSettings().value.votes as VotesStyle;
	},
	/** Сторона стрелок оценки: в футере поста и в строке действий комментария */
	get arrowsSide(): 'left' | 'right' {
		return activeThemeSettings().value.arrowsSide as 'left' | 'right';
	},
	/** Порядок стрелок оценки: 'down-up' (вниз / вверх) или 'up-down' (вверх / вниз) */
	get arrowsOrder(): 'down-up' | 'up-down' {
		return (activeThemeSettings().value.arrowsOrder as 'down-up' | 'up-down') ?? 'down-up';
	},
	/** Клик на аватар в шапке открывает меню вместо перехода в профиль */
	get avatarOpensMenu(): boolean {
		return activeThemeSettings().value.avatarOpensMenu === true;
	},
	/** Расположение кнопки «Создать»: 'top' (в шапке) или 'sidebar' (на левом сайдбаре) */
	get createButtonPos(): 'top' | 'sidebar' {
		return (activeThemeSettings().value.createButtonPos as 'top' | 'sidebar') ?? 'top';
	},
	/** Что открывает счётчик репостов: страницу с записями или короткий список под кнопкой */
	get repostsView(): 'page' | 'list' {
		return activeThemeSettings().value.repostsView === 'list' ? 'list' : 'page';
	},
	/** Колонка «Комментарии» (Live) справа от ленты включена */
	get liveEnabled(): boolean {
		return activeThemeSettings().value.liveEnabled === true;
	},
	/** Что показывает колонка: только комментарии или ещё и входящие уведомления */
	get liveContent(): 'comments' | 'comments-notifications' {
		return (activeThemeSettings().value.liveContent as 'comments' | 'comments-notifications') ?? 'comments';
	},
	/** Колонка Live свёрнута до 80px */
	get liveCollapsed(): boolean {
		return activeThemeSettings().value.liveCollapsed === true;
	},
	/** Режим строки поиска: 'always' (всегда) или 'button' (скрывать за кнопкой) */
	get searchBarMode(): 'always' | 'button' {
		return (activeThemeSettings().value.searchBarMode as 'always' | 'button') ?? 'always';
	},
	/** Ширина медиа на странице поста: 'full' (на всю ширину) или 'content' (на ширину контента) */
	get postMediaWidth(): 'full' | 'content' {
		return activeThemeSettings().value.postMediaWidth === 'content' ? 'content' : 'full';
	}
};
