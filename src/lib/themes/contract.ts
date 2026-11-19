import type { Snippet } from 'svelte';
import type { Comment, CommentEditorState, Post, Profile, ProfileListItem, ProfileSorting, SearchFilters, SearchSorting, SearchSubsite } from '$lib/api/types';
import type { FeedName, FeedSorting } from '$lib/feed.svelte';

export type SearchTab = 'posts' | 'comments' | 'blogs' | 'topics';
export type BookmarksTab = 'posts' | 'comments';

/**
 * Какие компоненты есть у темы и какие пропсы им передают.
 * Каждый лежит в корне папки темы: `<тема>/<Имя>.svelte`.
 *
 * Обязательные: Header, EditorialNews, FeedTabs, Post, Comments, Profile, Notifications, TagPage, RepostsPage, SearchPage, DraftsPage, BookmarksPage, LoginModal, NetworkErrorModal, EditorScreen, Spinner, ReloadPrompt.
 * Необязательные (если нет, ядро обходится без них): MainLayout.
 * Необязательные, которых без темы просто нет на экране: FeedNotice, Recommendations, AccountPage, ScreenBar, PagePeek.
 * Форк темы (`extends`) может не иметь ничего из этого и взять недостающее у основы.
 */
export interface ThemeComponents {
	Header: {};
	/** Каркас страницы, в него вставляется содержимое */
	MainLayout: { children?: Snippet };
	EditorialNews: {};
	/** Плашка между постами ленты с просьбой поддержать проект; её показом управляет ядро (`feedNotice`) */
	FeedNotice: {
		/** «Показать позже» */
		onlater: () => void;
		/** «Больше не показывать» */
		onnever: () => void;
	};
	/** Лента рекомендаций под комментариями поста: тема сама грузит её через `api.getRecommendations`, когда её низ подъезжает к экрану */
	Recommendations: { postId: number };
	/**
	 * Верхняя панель экрана. Каждый экран рисует её первым элементом у себя, поэтому она едет вместе с ним в переходах и свайпе.
	 * Какие экраны получают панель и что в ней лежит, решает тема; у экранов без панели она может занять только безопасную зону.
	 */
	ScreenBar: {
		/** Какой экран рисует панель */
		screen: 'feed' | 'post' | 'profile' | 'tag' | 'reposts' | 'search' | 'drafts' | 'bookmarks' | 'notifications' | 'account' | 'messages';
		/** Заголовок экрана, если он уже известен */
		title?: string;
		/** Открытый пост: для «Поделиться» */
		post?: Post;
		/** Открытый профиль: для его действий */
		profile?: Profile;
		/** Открытый тег: для его меню */
		tag?: string;
	};
	FeedTabs: {
		currentFeed: FeedName;
		switchFeed: (feed: FeedName) => void;
		/** Выбранная сортировка (или период «Популярного») и переход на другую */
		sorting: FeedSorting;
		switchSorting: (sorting: FeedSorting) => void;
	};
	Post: { post: Post; preview?: boolean; evictMedia?: boolean };
	/** Плеер блока `audio` внутри поста (`data` — данные блока): форк может нарисовать свой, иначе берётся плеер основы */
	AudioBlock: { data: any };
	Comments: {
		postId: number;
		sourceId?: string;
		commentsCount?: number;
		subscribed?: boolean;
		/** Автор поста: его комментарии получают плашку «Автор» */
		postAuthorId?: number;
		/** Писать нельзя (бан, чёрный список, ограничение автора): вместо редактора тема показывает причину и убирает «Ответить» */
		commentEditor?: CommentEditorState;
		/** Комментарий, к которому прокрутить (из ссылки или уведомления); комментарии догружаются, пока он не найдётся */
		focusCommentId?: number;
		/** Повторный фокус на комментарий (например, при повторном клике по тому же уведомлению) */
		focusNonce?: number;
		/** Поиск `focusCommentId` закончился (нашли или не нашли): вызывается до прокрутки, чтобы экран успел показать список */
		onfocused?: () => void;
		/** Изменение числа комментариев поста из realtime или при отправке */
		onCountChange?: (delta: number) => void;
		/** Канал комментариев переподключился после обрыва */
		onReconnect?: () => void;
		/** Передаёт функцию обновления комментариев (и `undefined` при размонтировании) для pull-to-refresh */
		onRefreshReady?: (refresh: (() => Promise<void>) | undefined) => void;
	};
	Profile: {
		profile: Profile;
		posts: Post[];
		sorting: ProfileSorting;
		hasMore: boolean;
		loadingPosts: boolean;
		postsError: string | null;
		subscribersPromise: Promise<ProfileListItem[]>;
		subscriptionsPromise: Promise<ProfileListItem[]>;
		onSortingChange: (sorting: ProfileSorting) => void;
		loadMore: () => void;
		/** Профиль изменился (своя аватарка или обложка): показать новый вместо старого */
		onProfileUpdate?: (profile: Profile) => void;
		/** Поиск по записям профиля: пустой `query` — обычная лента. Тема без поиска не вызывает */
		onSearch?: (query: string, sorting: SearchSorting) => void;
	};
	/** Страница уведомлений (оверлей notifications) */
	Notifications: { active?: boolean };
	/** Записи с тегом `tag` (без `#`): одна страница без подгрузки */
	TagPage: {
		tag: string;
		posts: Post[];
	};
	/** Репосты записи — записи-ответы на неё: одна страница без подгрузки */
	RepostsPage: {
		posts: Post[];
	};
	/** Результаты поиска: записи и комментарии (с подгрузкой), блоги или темы (только первая страница) */
	SearchPage: {
		query: string;
		tab: SearchTab;
		onTabChange: (tab: SearchTab) => void;
		sorting: SearchSorting;
		onSortingChange: (sorting: SearchSorting) => void;
		filters: SearchFilters;
		onFiltersChange: (filters: SearchFilters) => void;
		posts: Post[];
		comments: Comment[];
		subsites: SearchSubsite[];
		/** Сколько всего нашлось на вкладке */
		total?: number;
		/** Известные счётчики по уже загруженным вкладкам */
		totals?: Partial<Record<SearchTab, number>>;
		/** Первая страница уже пришла */
		loaded: boolean;
		loading: boolean;
		error: unknown;
		hasMore: boolean;
		loadMore: () => void;
		onretry: () => void;
	};
	/** Черновики вошедшего пользователя; карточки неактивны, под каждой кнопки «Смотреть», «Редактировать» (`onedit`) и «Удалить» (`ondelete`) */
	DraftsPage: {
		posts: Post[];
		loaded: boolean;
		loading: boolean;
		error: unknown;
		hasMore: boolean;
		loadMore: () => void;
		onretry: () => void;
		onedit: (post: Post) => void;
		ondelete: (post: Post) => Promise<void>;
	};
	/** Закладки вошедшего пользователя: записи или комментарии (вкладка `tab`), каждая со своей подгрузкой */
	BookmarksPage: {
		tab: BookmarksTab;
		onTabChange: (tab: BookmarksTab) => void;
		posts: Post[];
		comments: Comment[];
		/** Первая страница выбранной вкладки уже пришла */
		loaded: boolean;
		loading: boolean;
		error: unknown;
		hasMore: boolean;
		loadMore: () => void;
		onretry: () => void;
	};
	/** Страница аккаунта (оверлей account): профиль, черновики, донаты, вход в настройки, выход. Без неё нижняя панель ведёт в настройки */
	AccountPage: {};
	LoginModal: {};
	NetworkErrorModal: {
		error: unknown;
		onretry?: () => void;
		onclose?: () => void;
	};
	EditorScreen: { session: any };
	/** `inline` — маленький, в потоке; `block` — заглушка на месте содержимого экрана (если тема так умеет); без них — обычный на своём месте */
	Spinner: { inline?: boolean; block?: boolean };
	/**
	 * Панель будущей страницы, пока она грузится (нужна, если в `motion` темы есть `peek`). Ядро двигает обёртку на весь
	 * экран, компонент рисует её содержимое: фон страницы и индикатор в видимой полосе у левого края
	 */
	PagePeek: {
		/** Расчётный прогресс 0…1. Единица — страница готова: индикатор доливается, и панель выезжает со страницей */
		progress: number;
	};
	ReloadPrompt: {};
}
