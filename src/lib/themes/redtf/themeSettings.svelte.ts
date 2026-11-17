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
	/** Выбор действия свайпа по комментарию: 'list' (выделение по кнопкам) или 'drum' (выбранное в центре, как в Telegram X) */
	get swipeColumn(): 'list' | 'drum' {
		return activeThemeSettings().value.swipeColumn === 'drum' ? 'drum' : 'list';
	},
	/** Использовать продвинутые эффекты прозрачности и размытия */
	get transparencyEffects(): boolean {
		const val = activeThemeSettings().value.transparencyEffects;
		if (typeof val === 'boolean') return val;
		if (typeof window === 'undefined') return true;
		return !window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;
	},
	/** Блюр верхней панели */
	get headerBlur(): boolean {
		return activeThemeSettings().value.headerBlur === true;
	},
	/** Заголовок поста в верхней панели смартфона */
	get postTitleInBar(): boolean {
		return activeThemeSettings().value.postTitleInBar === true;
	},
	/** Верхняя панель смартфона уезжает при прокрутке вниз */
	get hideTopBarOnScroll(): boolean {
		return activeThemeSettings().value.hideTopBarOnScroll === true;
	},
	/** Блюр мобильного бара */
	get mobileBarBlur(): boolean {
		return activeThemeSettings().value.mobileBarBlur === true;
	},
	/** Плавающий мобильный бар */
	get mobileBarFloating(): boolean {
		return activeThemeSettings().value.mobileBarFloating === true;
	},
	/** Клик на аватар в шапке открывает меню вместо перехода в профиль */
	get avatarOpensMenu(): boolean {
		return activeThemeSettings().value.avatarOpensMenu !== false;
	},
	/** Расположение кнопки «Создать»: 'top' (сверху в шапке) или 'sidebar' (на левом сайдбаре) */
	get createButtonPos(): 'top' | 'sidebar' {
		return (activeThemeSettings().value.createButtonPos as 'top' | 'sidebar') ?? 'top';
	},
	/** Режим строки поиска: 'always' (всегда) или 'button' (скрывать за кнопкой) */
	get searchBarMode(): 'always' | 'button' {
		return (activeThemeSettings().value.searchBarMode as 'always' | 'button') ?? 'always';
	},
	/** Ширина медиа на странице поста: 'full' (на всю ширину) или 'content' (на ширину контента) */
	get postMediaWidth(): 'full' | 'content' {
		return activeThemeSettings().value.postMediaWidth === 'content' ? 'content' : 'full';
	},
	/** Отладка: поднять панель редактора над клавиатурой на поправку (костыль для Chrome на Android, см. EditorToolbar) */
	get keyboardBarGap(): boolean {
		return activeThemeSettings().value.keyboardBarGap === true;
	}
};
