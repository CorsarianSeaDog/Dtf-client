import { tick, untrack } from 'svelte';
import { closeOverlay } from '$lib/navigation';
import { api } from '$lib/api/index.svelte';
import type { Post, SubsiteItem, PostHistoryVersion } from '$lib/api/types';
import { editorJsToDtf, dtfToEditorJs } from './mapper';
import type { OutputData } from '@editorjs/editorjs';

/** idle — правок нет; dirty — есть несохранённое; saving — идёт запрос; saved — всё сохранено; error — последняя попытка не удалась */
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Сессия не хранит текстов для пользователя: о сохранении говорит `saveState`, а успех или ошибку действия
 * (публикация, права, версия) метод возвращает или бросает — текст показывает экран.
 *
 * `repostId` — id поста, на который пишется ответ (репост у DTF теперь ответ): уходит в запись при сохранении,
 * у такой записи может не быть ни заголовка, ни блоков.
 */
export function createEditorSession(initialPostId: number | null = null, repostId?: number) {
	let postId = $state(initialPostId);
	let initialData: OutputData | undefined = $state(undefined);
	/** Данные загружены, редактор можно создавать */
	let ready = $state(false);
	let subsites: SubsiteItem[] = $state([]);
	let selectedSubsiteId = $state(0);
	/** Пост, на который пишется репост: показывается в редакторе, чтобы было видно, к чему ответ */
	let repostOf = $state<Post>();
	let isAdult = $state(false);
	let title = $state('');
	let commentPermission = $state<'everyone' | 'nobody' | 'only_plus' | 'only_subscribers'>('everyone');

	let saveState = $state<SaveState>('idle');
	/** Время (мс) последнего удачного сохранения */
	let savedAt = $state<number | null>(null);
	/** Текст последней ошибки сохранения или загрузки записи; очищается при следующей попытке сохранения */
	let error = $state('');
	/** Есть ли в записи блоки: обновляется вместе со снимком, чтобы canPublish не трогал редактор */
	let hasBlocks = $state(false);
	/** Содержимое до восстановления версии: до следующей правки его можно вернуть */
	let beforeVersion = $state<{ title: string; isAdult: boolean; data: OutputData } | null>(null);

	let showHistory = $state(false);
	let historyVersions: PostHistoryVersion[] = $state([]);
	let loadingHistory = $state(false);

	let editorInstance: any = $state(null);

	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

	// Правки считаются номерами: несохранённое есть, пока номер последней правки больше номера сохранённой
	let changes = 0;
	let savedChanges = 0;
	/** Последнее содержимое редактора: к закрытию экрана сам редактор уже уничтожен и save() не вызвать */
	let snapshot: OutputData | undefined;
	/** Сохранения идут по очереди: иначе у новой записи два запроса подряд создали бы два черновика */
	let saveQueue: Promise<unknown> = Promise.resolve();
	let deleted = false;

	const DEBOUNCE_MS = 10000;
	const MAX_WAIT_MS = 120000;
	let isFirstRender = true;

	function remember(data: OutputData) {
		snapshot = data;
		hasBlocks = (data.blocks?.length ?? 0) > 0;
	}

	async function init() {
		try {
			subsites = await api.getSubsites();
			if (subsites.length > 0) {
				selectedSubsiteId = subsites[0].value;
			}
			if (postId) {
				commentPermission = await api.getCommentPermissions(postId);
			}
		} catch (e) {
			console.error("Failed to load initial data", e);
		}
		// Существующую запись читаем до показа редактора: его содержимое задаётся только при создании
		if (postId) {
			try {
				const entry = await api.getEditorEntry(postId);
				initialData = dtfToEditorJs(entry);
				remember(initialData);
				title = entry.title || '';
				isAdult = entry.is_adult || false;
				if (entry.subsite_id) selectedSubsiteId = entry.subsite_id;
			} catch (e: any) {
				error = e.message;
				saveState = 'error';
				console.error(e);
			}
		}
		ready = true;
		if (repostId) repostOf = await api.getPost(repostId).catch(() => undefined);
	}

	/** Экран закрывается: не отправленные правки уходят сразу, а не ждут таймера, которого уже не будет */
	function destroy() {
		if (saveTimer) clearTimeout(saveTimer);
		if (maxWaitTimer) clearTimeout(maxWaitTimer);
		saveTimer = maxWaitTimer = null;
		if (!deleted && changes > savedChanges) autosave(snapshot ?? initialData ?? { blocks: [] });
	}

	/** Сохранение без ожидателя: ошибка остаётся в saveState и error */
	function autosave(content?: OutputData) {
		return performSave(false, content).catch(() => {});
	}

	/** Сохраняет сразу, если есть несохранённое: экран зовёт, когда страница уходит в фон */
	function flush() {
		if (deleted || changes <= savedChanges) return;
		return autosave(editorInstance ? undefined : (snapshot ?? initialData ?? { blocks: [] }));
	}

	function queueSave() {
		if (!editorInstance || deleted) return;

		changes++;
		beforeVersion = null;
		if (saveState !== 'saving') saveState = 'dirty';
		editorInstance.save().then(remember, () => {});

		if (saveTimer) clearTimeout(saveTimer);

		saveTimer = setTimeout(() => autosave(), DEBOUNCE_MS);

		if (!maxWaitTimer) {
			maxWaitTimer = setTimeout(() => autosave(), MAX_WAIT_MS);
		}
	}

	function performSave(isPublishing: boolean = false, content?: OutputData) {
		const run = saveQueue.then(() => save(isPublishing, content));
		saveQueue = run.catch(() => {});
		return run;
	}

	/** `content` — готовое содержимое, когда редактора уже нет. Ошибку записывает в состояние и бросает */
	async function save(isPublishing: boolean, content?: OutputData) {
		if (!isPublishing) {
			if (saveTimer) clearTimeout(saveTimer);
			if (maxWaitTimer) clearTimeout(maxWaitTimer);
			saveTimer = null;
			maxWaitTimer = null;
		}

		if (deleted || (!content && !editorInstance)) return;

		const reached = changes;
		try {
			const data = content ?? await editorInstance.save();
			if (!content) remember(data);

			if (!repostId && title.trim() === '' && (!data.blocks || data.blocks.length === 0)) {
				if (isPublishing) throw new Error('Содержимое поста пусто');
				// Пустой черновик не отправляем: правки были, но сохранять нечего
				savedChanges = Math.max(savedChanges, reached);
				saveState = changes > savedChanges ? 'dirty' : 'idle';
				return;
			}

			saveState = 'saving';
			error = '';

			const dtfEntry = editorJsToDtf(data, {
				id: postId || 0,
				title,
				subsite_id: selectedSubsiteId,
				is_adult: isAdult,
				is_published: isPublishing,
				repostId
			});

			const result = await api.saveDraft(dtfEntry);
			savedChanges = Math.max(savedChanges, reached);

			if (!postId && result && result.id) {
				postId = result.id;
			}

			savedAt = Date.now();
			// Правка могла прийти, пока шёл запрос
			saveState = changes > savedChanges ? 'dirty' : 'saved';
			if (isPublishing) setTimeout(closeOverlay, 1000);
		} catch (e: any) {
			error = e.message;
			saveState = 'error';
			console.error(e);
			throw e;
		}
	}

	/** Публикует запись; ошибка уходит в saveState/error и бросается вызывающему */
	function publish() {
		return performSave(true);
	}

	/** Бросает ошибку, если права не удалось поставить */
	async function updateCommentPermission(e: Event) {
		const target = e.target as HTMLSelectElement;
		const perm = target.value as 'everyone' | 'nobody' | 'only_plus' | 'only_subscribers';
		commentPermission = perm;

		// У новой записи сначала нужен черновик: права ставятся на существующую запись
		if (!postId) {
			await performSave(false).catch(() => {});
		}

		if (postId) await api.setCommentPermissions(postId, perm);
	}

	async function toggleHistory() {
		if (!postId) return;
		showHistory = !showHistory;
		if (showHistory) {
			loadingHistory = true;
			try {
				historyVersions = await api.getPostHistory(postId);
			} catch (e) {
				console.error(e);
			} finally {
				loadingHistory = false;
			}
		}
	}

	/** Заменяет содержимое версией; прежнее запоминается для undoLoadVersion(). Ошибку бросает */
	async function loadVersion(versionId: number) {
		if (!postId || !editorInstance) return;
		const entry = await api.getPostHistoryVersion(postId, versionId);
		const previous = { title, isAdult, data: (await editorInstance.save()) as OutputData };
		await applyContent(dtfToEditorJs(entry), entry.title || '', entry.is_adult || false);
		showHistory = false;
		// Правки-следствия (смена заголовка запускает queueSave) уже прошли: отмена доступна до следующей правки
		beforeVersion = previous;
	}

	/** Возвращает содержимое, которое было до последнего loadVersion() */
	async function undoLoadVersion() {
		if (!beforeVersion || !editorInstance) return;
		const { data, title: oldTitle, isAdult: oldAdult } = beforeVersion;
		await applyContent(data, oldTitle, oldAdult);
		beforeVersion = null;
	}

	async function applyContent(data: OutputData, newTitle: string, newAdult: boolean) {
		await editorInstance.render(data);
		title = newTitle;
		isAdult = newAdult;
		remember(data);
		queueSave();
		await tick();
	}

	function goBack() {
		closeOverlay();
	}

	/** Удаляет текущую запись и отменяет автосохранение при закрытии */
	async function deletePost() {
		if (!postId) return;
		deleted = true;
		if (saveTimer) clearTimeout(saveTimer);
		if (maxWaitTimer) clearTimeout(maxWaitTimer);
		saveTimer = maxWaitTimer = null;
		await saveQueue;
		try {
			await api.deletePost(postId);
			changes = savedChanges;
		} catch (e) {
			deleted = false;
			throw e;
		}
	}

	// We can use $effect inside the session factory because it's called during component initialization
	$effect(() => {
		const _t = title;
		const _s = selectedSubsiteId;
		const _a = isAdult;

		untrack(() => {
			if (isFirstRender) {
				isFirstRender = false;
				return;
			}
			queueSave();
		});
	});

	return {
		get postId() { return postId; },
		get repostId() { return repostId; },
		get repostOf() { return repostOf; },
		get initialData() { return initialData; },
		get ready() { return ready; },
		get subsites() { return subsites; },
		get selectedSubsiteId() { return selectedSubsiteId; },
		set selectedSubsiteId(v) { selectedSubsiteId = v; },
		get isAdult() { return isAdult; },
		set isAdult(v) { isAdult = v; },
		get title() { return title; },
		set title(v) { title = v; },
		get commentPermission() { return commentPermission; },
		get saveState() { return saveState; },
		get savedAt() { return savedAt; },
		get error() { return error; },
		/** Публиковать можно, пока не идёт сохранение и запись не пуста (репост может быть без текста) */
		get canPublish() { return saveState !== 'saving' && (!!repostId || title.trim() !== '' || hasBlocks); },
		/** Можно ли вернуть содержимое до последнего loadVersion(): пропадает после следующей правки */
		get canUndoLoad() { return beforeVersion !== null; },
		get showHistory() { return showHistory; },
		get historyVersions() { return historyVersions; },
		get loadingHistory() { return loadingHistory; },

		get editorInstance() { return editorInstance; },
		set editorInstance(v) { editorInstance = v; },

		init,
		destroy,
		queueSave,
		flush,
		publish,
		updateCommentPermission,
		toggleHistory,
		loadVersion,
		undoLoadVersion,
		deletePost,
		goBack
	};
}
