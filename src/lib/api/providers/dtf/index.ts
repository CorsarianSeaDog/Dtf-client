import type {
	AccountSettings,
	ApiProvider,
	Badge,
	Comment,
	CommentControls,
	CommentMedia,
	CommentPermission,
	ContentControls,
	CurrentUser,
	CursorData,
	DonationAccount,
	DtfEditorEntry,
	GetPostsOptions,
	GifResult,
	IgnoredSubsite,
	MentionUser,
	Notification,
	NotificationChannel,
	PaginatedResult,
	Post,
	PostHistoryVersion,
	PostIgnoreSource,
	Profile,
	ProfileListItem,
	ProfileSorting,
	QuizResult,
	Reactions,
	RealtimeCommentEvent,
	RealtimeNotificationEvent,
	RealtimeSubscriptionOptions,
	RecommendationsCursor,
	SearchCommentsOptions,
	SearchCommentsResult,
	SearchFilters,
	SearchSorting,
	SearchSubsite,
	SubsiteItem,
	UploadOptions,
	UploadResult
} from '../../types';
import { buildEditorEntry, getLeonardoUrl } from '../../utils';
import { API_URL, COMMENTS_API_URL, UPLOAD_URL, apiV, fetchSearch, fetchWithAuth, requireAuth, uploadWithAuth } from './client';
import { untrack } from 'svelte';
import { authStorage } from '$lib/storage/auth.svelte';
import { addWatermark } from '$lib/watermark';
import { settings } from '$lib/storage/settings.svelte';
import { login, loginByToken } from './auth';
import { mapBadges, mapComment, mapCurrentUser, mapDonationAccount, mapEntryToPost, mapIgnoredSubsite, mapMentionUser, mapNotification, mapProfile, mapProfileListItem, mapQuizResult, mapReactions, mapSearchSnippet, mapSearchSubsite } from './mappers';
import { parseNotificationRealtimeEvent, subscribeChannel, subscribeDtfComments } from './realtime';

/** Загружает файл в хранилище DTF; возвращает запись как есть (`{ type, data }`): в таком виде её принимают поля вроде avatar и cover */
async function uploadItem(file: File, options?: UploadOptions): Promise<any> {
	const formData = new FormData();
	formData.append('files', file);

	const response = await uploadWithAuth(`${UPLOAD_URL}/uploader/upload`, formData, options);
	const json = await response.json();
	if (json.error) throw new Error(json.message?.text || 'Не удалось загрузить файл');

	const item = json.result?.[0];
	if (!item?.data?.uuid) throw new Error('Некорректный ответ при загрузке файла');
	return item;
}

/** Изменение профиля. Сайт шлёт блог (name, description…), ленты, avatar и cover отдельными запросами */
async function postSubsiteUpdate(userId: number, fields: Record<string, string>): Promise<void> {
	const formData = new FormData();
	formData.append('subsiteId', userId.toString());
	for (const [key, value] of Object.entries(fields)) formData.append(key, value);

	await fetchWithAuth(`${apiV('2.1')}/subsite/update`, { method: 'POST', body: formData });
}

/** Курсор для следующей страницы в запросе к API */
function cursorQuery(cursor?: CursorData): string {
	return cursor?.lastId != null ? `&lastId=${cursor.lastId}&lastSortingValue=${cursor.lastSortingValue ?? 0}` : '';
}

/** Форма запроса из полей; DTF принимает записи только как multipart */
function formOf(fields: Record<string, string | number | boolean>): FormData {
	const formData = new FormData();
	for (const [name, value] of Object.entries(fields)) formData.append(name, String(value));
	return formData;
}

/** Часть методов отвечает 200 с `error` в теле */
async function resultOf(response: Response, fallback: string): Promise<any> {
	const json = await response.json();
	if (json.error) throw new Error(json.message?.text || json.message || fallback);
	return json.result;
}

/** Вложение комментария в виде, который ждёт DTF: те же поля, что у media комментария, плюс служебные */
function attachmentsOf(media: CommentMedia[]): string {
	return JSON.stringify(media.map(({ type, data }) => ({ type, data: { hash: '', external_service: [], ...data } })));
}

/** Записи в ответах приходят то в `data`, то напрямую; бывают и пустые */
function entriesOf(items: unknown): any[] {
	return (Array.isArray(items) ? items : []).map((item) => item?.data || item).filter((entry) => entry?.id !== undefined);
}

/** Личный хеш канала `mobile:{userHash}` приходит в /subsite/me; живёт в памяти только для текущего поколения сессии */
let userHash: { gen: number; value: string } | undefined;
let meInFlight: { gen: number; promise: Promise<CurrentUser> } | undefined;

function currentSessionGen(): number {
	return untrack(() => authStorage.generation);
}

/** Запомненный хеш или, если его ещё нет, свежий /subsite/me; `undefined`, если сервер хеш не дал */
async function resolveUserHash(): Promise<string | undefined> {
	if (userHash?.gen !== currentSessionGen()) await dtfApiProvider.getMe();
	return userHash?.gen === currentSessionGen() ? userHash.value : undefined;
}

/** Официальный API DTF. Все остальные части приложения ходят сюда только через фасад api. */
export const dtfApiProvider = {
	name: 'DTF Official API',

	login,
	loginByToken,

	async getMe(): Promise<CurrentUser> {
		requireAuth();
		const gen = currentSessionGen();
		if (meInFlight?.gen === gen) return meInFlight.promise;

		const promise = (async () => {
			// /user/me на всех версиях API отвечает 404; текущий профиль отдаёт /subsite/me (плоский объект,
			// markdown=false — чтобы description (bio) пришёл сырым текстом)
			const response = await fetchWithAuth(`${API_URL}/subsite/me?markdown=false`);
			const json = await response.json();

			if (!json.result?.id) throw new Error('Не удалось получить профиль пользователя');

			const hash = json.result.userHash;
			if (typeof hash === 'string' && hash && currentSessionGen() === gen) userHash = { gen, value: hash };

			return mapCurrentUser(json.result);
		})().finally(() => {
			if (meInFlight?.promise === promise) meInFlight = undefined;
		});

		meInFlight = { gen, promise };
		return promise;
	},

	async getDonationAccount(): Promise<DonationAccount | null> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.5')}/donations/account`);
		return mapDonationAccount((await response.json()).result);
	},

	async updateBio(description: string, userId: number): Promise<void> {
		requireAuth();

		// Сначала получаем текущий профиль, чтобы не затереть name и commentingPermissions (как видно в HAR)
		const subsiteRes = await fetchWithAuth(`${API_URL}/subsite?id=${userId}&markdown=false`);
		const currentSubsite = (await subsiteRes.json()).result || {};

		const formData = new FormData();
		formData.append('subsiteId', userId.toString());
		formData.append('description', description);
		if (currentSubsite.name) formData.append('name', currentSubsite.name);
		if (currentSubsite.commentingPermissions) formData.append('commentingPermissions', currentSubsite.commentingPermissions);

		await fetchWithAuth(`${API_URL}/subsite/update`, { method: 'POST', body: formData });
	},

	async getAccountSettings(): Promise<AccountSettings> {
		requireAuth();
		const response = await fetchWithAuth(`${API_URL}/subsite/me?markdown=false`);
		const me = (await response.json()).result ?? {};

		return {
			id: me.id,
			name: me.name ?? '',
			description: me.description ?? '',
			commentingPermissions: me.commentingPermissions ?? 'everybody',
			defaultFeed: me.defaultFeed ?? 'popular',
			myFeedSorting: me.myFeedSorting ?? 'new',
			isBlurNsfw: !!me.isBlurNsfw,
			hideViewedPostsFromFeeds: !!me.hideViewedPostsFromFeeds
		};
	},

	/** Поля блога (name, description, commentingPermissions) и лент передавайте группами, как сайт */
	async updateAccountSettings(userId: number, patch: Partial<AccountSettings>): Promise<void> {
		requireAuth();
		await postSubsiteUpdate(userId, Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, String(value)])));
	},

	async setProfileImage(userId: number, kind: 'avatar' | 'cover', file: File): Promise<void> {
		requireAuth();
		const item = await uploadItem(file);
		// Новая обложка встаёт в позицию 0, как у сайта
		await postSubsiteUpdate(userId, kind === 'cover' ? { cover: JSON.stringify(item), cover_y: '0' } : { avatar: JSON.stringify(item) });
	},

	/** Позиция обложки уходит вместе с самой обложкой (`cover` — как её отдал профиль) */
	async setProfileCoverPosition(userId: number, cover: unknown, coverY: number): Promise<void> {
		requireAuth();
		await postSubsiteUpdate(userId, { cover: JSON.stringify(cover), cover_y: String(coverY) });
	},

	/** Сайт убирает обложку так: `cover` равен строке «null», позиция сбрасывается в 0 */
	async removeProfileCover(userId: number): Promise<void> {
		requireAuth();
		await postSubsiteUpdate(userId, { cover: 'null', cover_y: '0' });
	},

	async getIgnoredSubsites(): Promise<IgnoredSubsite[]> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.1')}/ignores/subsites`);
		return ((await response.json()).result ?? []).map(mapIgnoredSubsite);
	},

	/** Чёрный список: скрыть пользователя или тему (`ignored`) либо вернуть. Поле success в ответе ненадёжно (у темы при скрытии бывает false), поэтому смотрим только на код ответа */
	async setSubsiteIgnored(subsiteId: number, ignored: boolean): Promise<void> {
		requireAuth();
		const formData = new FormData();
		formData.append('id', subsiteId.toString());
		formData.append('action', ignored ? 'mute' : 'unmute');

		await fetchWithAuth(`${apiV('2.1')}/subsite/mute`, { method: 'POST', body: formData });
	},

	/** Скрыть пост. Сайт добавляет откуда нажали (`location`, `previousPage`, `fromFeed` — раздел ленты и страница, `hitId` — uuid показа); без них запрос не проверялся. Возврата поста на сайте нет, `unmute` не снят */
	async setPostIgnored(postId: number, ignored: boolean, source: PostIgnoreSource = {}): Promise<void> {
		requireAuth();
		const formData = new FormData();
		formData.append('id', postId.toString());
		formData.append('action', ignored ? 'mute' : 'unmute');
		for (const [key, value] of Object.entries(source)) if (value) formData.append(key, value);

		await fetchWithAuth(`${apiV('2.4')}/content/mute`, { method: 'POST', body: formData });
	},

	async getNotificationSettings(): Promise<NotificationChannel[]> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.1')}/user/notifications/settings`);
		return (await response.json()).result?.channels ?? [];
	},

	/** Меняет пункты (один или сразу все, как «включить все» на сайте); ответ — все настройки уведомлений с новыми значениями */
	async setNotificationSettings(values: Record<string, boolean>): Promise<NotificationChannel[]> {
		requireAuth();
		const formData = new FormData();
		for (const [key, enabled] of Object.entries(values)) formData.append(`settings[${key}]`, String(enabled));

		const response = await fetchWithAuth(`${apiV('2.1')}/user/notifications/settings`, { method: 'POST', body: formData });
		return (await response.json()).result?.channels ?? [];
	},

	// --- Чтение ---

	async getPosts(options?: GetPostsOptions): Promise<PaginatedResult<Post>> {
		const pageName = options?.pageName || 'popular';
		const sorting = options?.sorting || 'hotness';
		// Новости в популярном показываются отдельным блоком, в самой ленте их не нужно
		const withoutNews = pageName === 'popular' ? '&isWithoutNews=true' : '';
		const response = await fetchWithAuth(`${API_URL}/feed?pageName=${pageName}&sorting=${sorting}${withoutNews}${cursorQuery(options?.cursor)}`);
		const { result } = await response.json();

		return {
			items: entriesOf(result.items).map(mapEntryToPost),
			lastId: result.lastId,
			lastSortingValue: result.lastSortingValue
		};
	},

	async getPost(id: number): Promise<Post> {
		const response = await fetchWithAuth(`${API_URL}/content?id=${id}`);
		return mapEntryToPost((await response.json()).result);
	},

	/** Репосты поста — записи-ответы. Снято на v2.10 (адрес `COMMENTS_API_URL`), постраничности в ответе нет */
	async getReposts(postId: number): Promise<Post[]> {
		const response = await fetchWithAuth(`${COMMENTS_API_URL}/content/${postId}/reposts?markdown=false`);
		return entriesOf((await response.json()).result?.items).map(mapEntryToPost);
	},

	/**
	 * Рекомендации под постом, по дюжине записей. Следующая страница — те же параметры плюс курсор из ответа
	 * (без `excludeIds` сервер отдаёт первую страницу заново). Адрес версии 2.10, токен не обязателен
	 */
	async getRecommendations(postId: number, cursor?: RecommendationsCursor): Promise<{ items: Post[]; cursor?: RecommendationsCursor }> {
		const params = new URLSearchParams({ markdown: 'false', contentId: String(postId), previousPage: 'post' });
		if (cursor) {
			params.set('lastId', cursor.lastId);
			params.set('excludeIds', cursor.excludeIds);
		}
		const response = await fetchWithAuth(`${COMMENTS_API_URL}/recommendations?${params}`);
		const result = (await response.json()).result;
		const items = entriesOf(result?.items).map(mapEntryToPost);
		return { items, cursor: items.length && result.lastId && result.excludeIds ? { lastId: String(result.lastId), excludeIds: result.excludeIds } : undefined };
	},

	/**
	 * Записи по тегу (без `#`). Адрес версии 2.10: на 2.31 ответ другой формы. Отдаёт одну страницу (около дюжины записей),
	 * параметров постраничности у метода нет: `lastId`, `offset`, `page`, `sorting` игнорируются
	 */
	async getTagPosts(tag: string): Promise<Post[]> {
		const response = await fetchWithAuth(`${COMMENTS_API_URL}/tag/${encodeURIComponent(tag)}?markdown=false`);
		return entriesOf((await response.json()).result?.items).map(mapEntryToPost);
	},

	/** Поиск записей: `title` — искать только в заголовках, `editorial` — только у редакции, `strict` — точное совпадение, `authorId` — по автору. У каждой записи `meta.highlight` — фрагмент текста с найденным в `<mark>`; страницы — по курсору */
	async searchPosts(query: string, sorting: SearchSorting, filters: SearchFilters, cursor?: CursorData): Promise<PaginatedResult<Post> & { total?: number }> {
		const params = new URLSearchParams({
			markdown: 'false',
			sorting,
			title: String(filters.title),
			editorial: String(filters.editorial),
			strict: String(filters.strict)
		});
		if (query) params.set('q', query);
		if (filters.authorId !== undefined) params.set('author', String(filters.authorId));
		const response = await fetchSearch(`/v2.10/search/posts?${params}${cursorQuery(cursor)}`);
		const result = (await response.json()).result;

		return {
			items: (result?.items || []).flatMap((item: any) => {
				const entry = item.data || item;
				if (entry.id === undefined) return [];
				const post = mapEntryToPost(entry);
				return [{ ...post, searchSnippet: mapSearchSnippet(item.meta?.highlight, post.title) }];
			}),
			lastId: result?.lastId,
			lastSortingValue: result?.lastSortingValue,
			total: result?.total
		};
	},

	/** Поиск пользователей и блогов (`communities` — false) или тем (true). Отдаёт только первую дюжину: `page` метод не читает */
	async searchSubsites(query: string, communities: boolean): Promise<{ items: SearchSubsite[]; total: number }> {
		const params = new URLSearchParams({ q: query, type: communities ? '2' : '1', page: '0' });
		const response = await fetchSearch(`/v2.51/search/subsites?${params}`);
		const result = (await response.json()).result;

		return { items: entriesOf(result?.items).map(mapSearchSubsite), total: result?.total ?? 0 };
	},

	async getTopics(): Promise<SearchSubsite[]> {
		const response = await fetchWithAuth(`${apiV('2.7')}/discovery/topics`);
		const result = await resultOf(response, 'Не удалось загрузить темы DTF');
		return entriesOf(result).map(mapSearchSubsite);
	},

	/** Поиск по комментариям (`/v2.51/search/comments`): поддерживает текст, сортировку, точное совпадение, фильтр по автору и 1-indexed `page` */
	async searchComments(options: SearchCommentsOptions = {}): Promise<SearchCommentsResult> {
		const page = Math.max(1, options.page ?? 1);
		const params = new URLSearchParams({
			sorting: options.sorting ?? 'relevance',
			page: String(page)
		});
		if (options.query) params.set('q', options.query);
		if (options.strict !== undefined) params.set('strict', String(options.strict));
		if (options.authorId !== undefined) params.set('author', String(options.authorId));

		const response = await fetchSearch(`/v2.51/search/comments?${params}`);
		const result = (await response.json()).result;
		const items: Comment[] = (result?.items || []).flatMap((item: any) => {
			const data = item.data || item;
			if (data?.id === undefined) return [];
			const comment = mapComment(data, data.entry?.id ?? 0);
			if (typeof item.meta?.highlight === 'string' && item.meta.highlight) {
				comment.searchSnippet = item.meta.highlight;
			}
			if (typeof data.entry?.subsite_id === 'number') {
				comment.postSubsiteId = data.entry.subsite_id;
			}
			return [comment];
		});
		const total = result?.total ?? 0;
		const hasMore = items.length > 0 && (page - 1) * 12 + items.length < total;

		return {
			items,
			total,
			page,
			hasMore,
			lastId: result?.lastId,
			lastSortingValue: result?.lastSortingValue
		};
	},

	/** Черновики вошедшего пользователя; постранично по `offset` (на странице 20) */
	async getDrafts(offset = 0): Promise<Post[]> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.10')}/new/posts/drafts?markdown=false&offset=${offset}&limit=20`);
		return entriesOf((await resultOf(response, 'Не удалось получить черновики')).items).map(mapEntryToPost);
	},

	/** Записи в закладках вошедшего пользователя, новые сверху; постранично по `offset` (на странице 20) */
	async getBookmarkedPosts(offset = 0): Promise<Post[]> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.10')}/bookmarks?markdown=false&type=posts&count=20&offset=${offset}`);
		return entriesOf((await resultOf(response, 'Не удалось получить закладки')).items).map(mapEntryToPost);
	},

	/** Комментарии в закладках: по 10, следующая страница — от даты последнего (`lastSortingValue`) */
	async getBookmarkedComments(lastSortingValue?: number): Promise<PaginatedResult<Comment>> {
		requireAuth();
		const from = lastSortingValue ? `&last_sorting_value=${lastSortingValue}` : '';
		const response = await fetchWithAuth(`${apiV('2.8')}/bookmarks?type=comments&count=10${from}`);
		const result = await resultOf(response, 'Не удалось получить закладки');
		const raw: any[] = (Array.isArray(result) ? result : result?.items || []).map((item: any) => item.data || item).filter((c: any) => c?.id !== undefined);
		return {
			items: raw.map((c) => mapComment(c, c.entry?.id ?? 0)),
			lastSortingValue: raw.length < 10 ? undefined : raw[raw.length - 1].date
		};
	},

	/** Доступные действия над постом текущего пользователя (правка, закреп, удаление) */
	async getContentControls(postId: number): Promise<ContentControls> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.4')}/content/etcControls?id=${postId}`);
		const controls = (await resultOf(response, 'Не удалось получить доступные действия'))?.etcControls;
		return {
			editEntry: !!controls?.editEntry,
			pinContent: !!controls?.pinContent,
			remove: !!controls?.remove
		};
	},

	/** Удаляет запись (пост или черновик) */
	async deletePost(postId: number): Promise<void> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.4')}/content/${postId}`, { method: 'DELETE' });
		const result = await resultOf(response, 'Не удалось удалить запись');
		if (result?.success === false) throw new Error('Не удалось удалить запись');
	},

	async getComments(postId: number, cursor?: CursorData, sorting: string = 'date'): Promise<PaginatedResult<Comment>> {
		const dtfSorting = sorting === 'worst' ? 'hotness' : sorting === 'dateAsc' ? 'date' : sorting;
		const response = await fetchWithAuth(`${COMMENTS_API_URL}/comments?contentId=${postId}&sorting=${dtfSorting}${cursorQuery(cursor)}`);
		const { result } = await response.json();

		return {
			items: result.items.map((item: any) => mapComment(item, postId)),
			lastId: result.lastId,
			lastSortingValue: result.lastSortingValue
		};
	},

	async reactToComment(commentId: number, reactionId: number): Promise<void> {
		requireAuth();

		const formData = new FormData();
		formData.append('type', reactionId.toString());

		await fetchWithAuth(`${COMMENTS_API_URL}/comment/${commentId}/react`, { method: 'POST', body: formData });
	},

	async reactToPost(postId: number, reactionId: number): Promise<Reactions> {
		requireAuth();
		const response = await fetchWithAuth(`${COMMENTS_API_URL}/content/${postId}/react`, { method: 'POST', body: formOf({ type: reactionId }) });
		return mapReactions(await resultOf(response, 'Не удалось поставить реакцию')) ?? { counters: [], reactionId: 0 };
	},

	/** Результаты опроса по hash из блока quiz. Отвечает и без токена (тогда userVoted пуст) */
	async getQuizResults(hash: string): Promise<QuizResult> {
		const response = await fetchWithAuth(`${apiV('2.1')}/quiz/${hash}/results`);
		return mapQuizResult(await resultOf(response, 'Не удалось загрузить результаты опроса'));
	},

	/** Голос за вариант; без itemId снимает свой голос. Тело запроса пустое, сайт шлёт пустой multipart */
	async voteQuiz(hash: string, postId: number, itemId?: string): Promise<QuizResult> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.1')}/quiz/${hash}/contentId/${postId}/vote${itemId ? '/' + encodeURIComponent(itemId) : ''}`, { method: 'POST', body: formOf({}) });
		return mapQuizResult(await resultOf(response, 'Не удалось проголосовать'));
	},

	async setFavorite(id: number, kind: 'post' | 'comment', favorite: boolean): Promise<number> {
		requireAuth();
		const body = formOf({ id, type: kind === 'post' ? 1 : 2 });
		const response = await fetchWithAuth(`${apiV('2.1')}/${favorite ? 'favorite' : 'unfavorite'}`, { method: 'POST', body });
		return (await resultOf(response, 'Не удалось изменить закладки')).count ?? 0;
	},

	async addComment(postId: number, text: string, replyTo = 0, media: CommentMedia[] = []): Promise<Comment> {
		requireAuth();
		const shouldWatermark = untrack(() => settings.value.watermark);
		const preparedText = shouldWatermark ? addWatermark(text) : text;
		// nonce сайт придумывает сам, сервер возвращает его в ответе
		const body = formOf({ id: postId, text: preparedText, attachments: attachmentsOf(media), reply_to: replyTo, nonce: Math.floor(Math.random() * 1e6) });
		const response = await fetchWithAuth(`${apiV('2.4')}/comment/add`, { method: 'POST', body });
		return mapComment(await resultOf(response, 'Не удалось отправить комментарий'), postId);
	},

	async editComment(commentId: number, postId: number, text: string, media: CommentMedia[] = []): Promise<Comment> {
		requireAuth();
		const shouldWatermark = untrack(() => settings.value.watermark);
		const preparedText = shouldWatermark ? addWatermark(text) : text;
		const body = formOf({ comment_id: commentId, text: preparedText, attachments: attachmentsOf(media) });
		const response = await fetchWithAuth(`${apiV('2.4')}/comment/edit`, { method: 'POST', body });
		return mapComment(await resultOf(response, 'Не удалось изменить комментарий'), postId);
	},

	async getCommentControls(commentId: number): Promise<CommentControls> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.1')}/comment/etcControls?commentId=${commentId}`);
		return { edit: !!(await resultOf(response, 'Не удалось получить действия')).etcControls?.edit };
	},

	async getBadges(): Promise<Badge[]> {
		const response = await fetchWithAuth(`${apiV('2.9')}/assets`);
		return mapBadges((await resultOf(response, 'Не удалось загрузить бейджи')).badges);
	},

	/**
	 * Оба запроса — GET, но меняют подписку. Ответ `thread/unsubscribe` врёт (`subscribe: true`),
	 * поэтому ему не верим: настоящее состояние лежит в посте (`subscribedToTreads`).
	 */
	async setCommentsSubscription(postId: number, subscribed: boolean): Promise<void> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.4')}/content/${postId}/thread/${subscribed ? 'subscribe' : 'unsubscribe'}`);
		await resultOf(response, 'Не удалось изменить подписку на комментарии');
	},

	// --- Гифки для комментариев ---

	async getFavoriteGifs(): Promise<GifResult[]> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.9')}/favorite-gifs?page=0&limit=24`);
		// У избранного вложение уже готово (поле andropov)
		return ((await resultOf(response, 'Не удалось получить избранные гифки')).items || []).map((item: any) => ({
			previewUrl: getLeonardoUrl(item.leonardoUuid, { width: 200 }),
			media: item.andropov
		}));
	},

	async searchGifs(query: string, cursor = ''): Promise<{ items: GifResult[]; cursor?: string }> {
		requireAuth();
		const params = new URLSearchParams({ mediaFilter: 'gif,tinygif,nanogif', limit: '18', cursor, q: query });
		const response = await fetchWithAuth(`${apiV('2.1')}/gifs/search?${params}`);
		const result = await resultOf(response, 'Не удалось найти гифки');

		return {
			// Вложение из поиска собрано по полям выдачи, как у избранного: как сайт прикрепляет найденную гифку, не снималось
			items: (result.items || []).map((item: any): GifResult => {
				const gif = item.media_formats?.gif ?? {};
				return {
					previewUrl: gif.preview ?? item.url,
					media: {
						type: 'image',
						data: { uuid: item.id, width: gif.dims?.[0] ?? 0, height: gif.dims?.[1] ?? 0, size: gif.size ?? 0, type: 'gif', duration: gif.duration, has_audio: !!item.hasaudio }
					}
				};
			}),
			cursor: result.cursor || undefined
		};
	},

	async searchMentions(query = '', options?: { signal?: AbortSignal }): Promise<MentionUser[]> {
		requireAuth();
		const trimmed = query.trim();
		const params = trimmed ? `?q=${encodeURIComponent(trimmed)}` : '';
		const response = await fetchWithAuth(`${apiV('2.9')}/users/mentions${params}`, { signal: options?.signal });
		return ((await resultOf(response, 'Не удалось найти пользователей')) || []).map(mapMentionUser);
	},

	async complain(kind: 'post' | 'comment', id: number, reasonId: number): Promise<void> {
		requireAuth();
		const [path, idField] = kind === 'post' ? ['content', 'content_id'] : ['comment', 'comment_id'];
		const response = await fetchWithAuth(`${apiV('2.4')}/${path}/complaint`, { method: 'POST', body: formOf({ [idField]: id, reason_id: reasonId }) });
		await resultOf(response, 'Не удалось отправить жалобу');
	},

	async createDonation(postId: number, text: string, replyTo = 0, media: CommentMedia[] = [], amount: number): Promise<string> {
		requireAuth();
		const body = formOf({
			type: 'comment',
			'data[id]': postId,
			'data[text]': text,
			'data[attachments]': attachmentsOf(media),
			'data[reply_to]': replyTo,
			'data[nonce]': Math.floor(Math.random() * 1e6),
			donation: amount
		});
		const response = await fetchWithAuth(`${apiV('2.6')}/donations/donate`, { method: 'POST', body });
		const link = (await resultOf(response, 'Не удалось создать платёж')).payment_link;
		// Ссылку открывает пользователь, поэтому пускаем только https
		if (typeof link !== 'string' || !link.startsWith('https://')) throw new Error('DTF не вернул ссылку на оплату');
		return link;
	},

	// --- Подписки ---

	async setSubscription(subsiteId: number, subscribed: boolean): Promise<void> {
		requireAuth();
		const body = formOf({ id: subsiteId, action: subscribed ? 'subscribe' : 'unsubscribe', isSubscribedToNotifications: false });
		await resultOf(await fetchWithAuth(`${apiV('2.1')}/subsite/subscription`, { method: 'POST', body }), 'Не удалось изменить подписку');
	},

	async setSubscriptionNotifications(subsiteId: number, enabled: boolean): Promise<void> {
		requireAuth();
		const action = enabled ? 'subscribe' : 'unsubscribe';
		await fetchWithAuth(`${apiV('2.1')}/subsite/notifications/subsite/${action}/${subsiteId}`, { method: 'POST' });
	},

	// --- Уведомления ---

	async getNotifications(): Promise<Notification[]> {
		requireAuth();
		// html=true добавляет текст со ссылками на пост и автора, как у сайта
		const response = await fetchWithAuth(`${apiV('2.1')}/subsite/me/updates?html=true&is_read=1`);
		return ((await resultOf(response, 'Не удалось получить уведомления')) || []).map(mapNotification);
	},

	async getNotificationsUnreadCount(): Promise<number> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.1')}/subsite/me/updates/count`);
		return (await resultOf(response, 'Не удалось получить счётчик уведомлений')).count;
	},

	async markNotificationsRead(ids: number[]): Promise<void> {
		requireAuth();
		if (ids.length === 0) return;
		const response = await fetchWithAuth(`${apiV('2.1')}/subsite/notifications/markAsRead`, {
			method: 'POST',
			body: formOf({ notificationIds: JSON.stringify(ids) })
		});
		const res = await resultOf(response, 'Не удалось отметить уведомления прочитанными');
		if (res?.result === false) throw new Error('Не удалось отметить уведомления прочитанными');
	},

	async markAllNotificationsRead(): Promise<void> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.1')}/subsite/notifications/markAsRead`, {
			method: 'POST',
			body: formOf({ all: true })
		});
		const res = await resultOf(response, 'Не удалось отметить все уведомления прочитанными');
		if (res?.result === false) throw new Error('Не удалось отметить все уведомления прочитанными');
	},

	subscribeComments(
		postId: number,
		onUpdate: (event: RealtimeCommentEvent) => void,
		options?: RealtimeSubscriptionOptions
	): () => void {
		return subscribeDtfComments(postId, onUpdate, options);
	},

	subscribeNotifications(
		onUpdate: (event: RealtimeNotificationEvent) => void,
		options?: RealtimeSubscriptionOptions
	): () => void {
		let active = true;
		let attempt = 0;
		let unsubChannel: (() => void) | undefined;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;

		const attemptSubscribe = () => {
			resolveUserHash()
				.then((hash) => {
					// Нет хеша: сервер его не дал, повторы не помогут
					if (!active || !hash) return;
					unsubChannel = subscribeChannel(`mobile:${hash}`, {
						onEvent: (raw) => {
							const ev = parseNotificationRealtimeEvent(raw);
							if (ev) onUpdate(ev);
						},
						onReady: options?.onReady
					});
				})
				.catch((err) => {
					// Профиль не получен (сеть): повторяем с нарастающей задержкой, пока подписку не отменят
					if (!active) return;
					const error = err instanceof Error ? err : new Error(String(err));
					console.warn('[realtime] Не удалось подписаться на уведомления:', error.message);
					options?.onError?.(error);
					retryTimer = setTimeout(attemptSubscribe, Math.min(30_000, 2_000 * 2 ** Math.min(attempt++, 4)));
				});
		};

		attemptSubscribe();

		return () => {
			active = false;
			clearTimeout(retryTimer);
			unsubChannel?.();
			unsubChannel = undefined;
		};
	},

	/** Новости редакции порциями (как «Показать ещё» у DTF): курсор — id последней новости, первая порция — без него */
	async getEditorialNews(lastId = 0): Promise<PaginatedResult<Post>> {
		const response = await fetchWithAuth(`${API_URL}/news?lastId=${lastId}`);
		const { result } = await response.json();

		return { items: entriesOf(result?.news).map(mapEntryToPost), lastId: result?.lastId };
	},

	// --- Профили ---

	async getProfile(id: number | string): Promise<Profile> {
		const query = typeof id === 'number' ? `id=${id}` : `uri=${encodeURIComponent(id)}`;
		const response = await fetchWithAuth(`${API_URL}/subsite?${query}`);
		const subsite = (await response.json()).result?.subsite;
		if (!subsite) throw new Error('Профиль не найден');

		return mapProfile(subsite);
	},

	async getProfilePosts(id: number, sorting: ProfileSorting, cursor?: CursorData, isCommunity = false): Promise<PaginatedResult<Post>> {
		const dtfSorting = sorting === 'popular' ? (isCommunity ? 'hotness' : 'all') : 'date';
		const response = await fetchWithAuth(`${API_URL}/timeline?subsitesIds=${id}&sorting=${dtfSorting}${cursorQuery(cursor)}`);
		const result = (await response.json()).result;

		return {
			items: entriesOf(result?.items).map(mapEntryToPost),
			lastId: result?.lastId,
			lastSortingValue: result?.lastSortingValue
		};
	},

	async getProfileSubscribers(id: number, cursor?: CursorData): Promise<PaginatedResult<ProfileListItem>> {
		const response = await fetchWithAuth(`${API_URL}/subsite/subscribers?subsiteId=${id}${cursorQuery(cursor)}`);
		const result = (await response.json()).result;

		return {
			items: (result?.items || []).map(mapProfileListItem),
			lastId: result?.lastId,
			lastSortingValue: result?.lastSortingValue
		};
	},

	async getProfileSubscriptions(id: number): Promise<ProfileListItem[]> {
		const response = await fetchWithAuth(`${API_URL}/subsite/subscriptions?subsiteId=${id}`);
		return ((await response.json()).result?.items || []).map(mapProfileListItem);
	},

	async getProfileComments(id: number, sorting: ProfileSorting = 'new', cursor?: CursorData): Promise<PaginatedResult<Comment>> {
		const dtfSorting = sorting === 'popular' ? 'hotness' : 'new';
		const response = await fetchWithAuth(`${apiV('2.5')}/comments?subsiteId=${id}&sorting=${dtfSorting}&page=0${cursorQuery(cursor)}`);
		const result = (await response.json()).result;

		return {
			items: (result?.items || []).map((item: any) => mapComment(item, item.entry?.id ?? 0)),
			lastId: result?.lastId,
			lastSortingValue: result?.lastSortingValue
		};
	},

	// --- Редактор ---

	/** Запись для редактора: черновик или опубликованный пост (`id=0` — новая запись, её тут не просят) */
	async getEditorEntry(postId: number): Promise<DtfEditorEntry> {
		requireAuth();
		const response = await fetchWithAuth(`${apiV('2.1')}/editor/${postId}`);
		return (await resultOf(response, 'Не удалось открыть черновик')).entry;
	},

	async saveDraft(entry: DtfEditorEntry): Promise<DtfEditorEntry> {
		requireAuth();

		const formData = new FormData();
		formData.append('entry', JSON.stringify(entry));

		const response = await fetchWithAuth(`${API_URL}/editor`, { method: 'POST', body: formData });
		const json = await response.json();
		if (json.error) throw new Error(json.message?.text || 'Не удалось сохранить черновик');
		return json.result?.entry;
	},

	async copyPostToDraft(postId: number): Promise<number> {
		const original = await dtfApiProvider.getEditorEntry(postId);
		if (original?.id !== postId || !Array.isArray(original.entry?.blocks)) {
			throw new Error('DTF не вернул содержимое поста');
		}

		const draft = await dtfApiProvider.saveDraft(
			buildEditorEntry(original.entry.blocks, { ...original, id: 0, user_id: undefined, is_published: false })
		);
		if (!draft || !Number.isSafeInteger(draft.id) || draft.id <= 0 || draft.id === postId || draft.is_published === true) {
			throw new Error('DTF не подтвердил создание нового черновика');
		}
		return draft.id;
	},

	async uploadMedia(file: File, options?: UploadOptions): Promise<UploadResult> {
		requireAuth();

		const resultItem = await uploadItem(file, options);
		const uploaded = resultItem.data;

		return {
			uuid: uploaded.uuid,
			width: uploaded.width,
			height: uploaded.height,
			size: uploaded.size,
			type: resultItem.type === 'movie' ? 'movie' : uploaded.type,
			color: uploaded.color,
			isVideo: uploaded.isVideo,
			duration: uploaded.duration,
			has_audio: uploaded.has_audio
		};
	},

	async getSubsites(): Promise<SubsiteItem[]> {
		requireAuth();

		const response = await fetchWithAuth(`${API_URL}/editor/subsites`);
		const json = await response.json();
		if (json.error) throw new Error(json.message?.text || 'Не удалось получить список подсайтов');

		// API отвечает так: [{ items: [подсайты] }]
		return json.result?.[0]?.items || [];
	},

	async getCommentPermissions(postId: number): Promise<CommentPermission> {
		requireAuth();
		const response = await fetchWithAuth(`${API_URL}/posts/${postId}/comment-permission`);
		return (await response.json()).result?.permission || 'everyone';
	},

	async setCommentPermissions(postId: number, permission: CommentPermission): Promise<void> {
		requireAuth();
		const url = `${API_URL}/posts/${postId}/comment-permission`;

		if (permission === 'everyone') {
			await fetchWithAuth(url, { method: 'DELETE' });
		} else {
			const formData = new FormData();
			formData.append('commentingPermissions', permission);
			await fetchWithAuth(url, { method: 'POST', body: formData });
		}
	},

	async getPostHistory(postId: number): Promise<PostHistoryVersion[]> {
		requireAuth();
		const response = await fetchWithAuth(`${API_URL}/content/${postId}/history`);
		return (await response.json()).result?.versions || [];
	},

	async getPostHistoryVersion(postId: number, versionId: number): Promise<DtfEditorEntry> {
		requireAuth();
		const response = await fetchWithAuth(`${API_URL}/content/${postId}/history/${versionId}`);
		const json = await response.json();
		if (json.error) throw new Error(json.message?.text || 'Не удалось получить версию поста');
		return json.result?.entry;
	}
} satisfies ApiProvider;
