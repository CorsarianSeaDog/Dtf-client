import { untrack } from 'svelte';
import { closeOverlay } from '$lib/navigation';
import { api } from '$lib/api/index.svelte';
import type { Post, SubsiteItem, PostHistoryVersion } from '$lib/api/types';
import { editorJsToDtf, dtfToEditorJs } from './mapper';
import type { OutputData } from '@editorjs/editorjs';

/**
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
	
	let isSaving = $state(false);
	let saveMessage = $state('');
	
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
				title = entry.title || '';
				isAdult = entry.is_adult || false;
				if (entry.subsite_id) selectedSubsiteId = entry.subsite_id;
			} catch (e: any) {
				saveMessage = 'Ошибка: ' + e.message;
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
		if (!deleted && changes > savedChanges) performSave(false, snapshot ?? initialData ?? { blocks: [] });
	}

	function queueSave() {
		if (!editorInstance || deleted) return;

		changes++;
		editorInstance.save().then((data: OutputData) => (snapshot = data), () => {});

		if (saveTimer) clearTimeout(saveTimer);
		
		saveTimer = setTimeout(() => {
			performSave(false);
		}, DEBOUNCE_MS);
		
		if (!maxWaitTimer) {
			maxWaitTimer = setTimeout(() => {
				performSave(false);
			}, MAX_WAIT_MS);
		}
	}

	function performSave(isPublishing: boolean = false, content?: OutputData) {
		const run = saveQueue.then(() => save(isPublishing, content));
		saveQueue = run.catch(() => {});
		return run;
	}

	/** `content` — готовое содержимое, когда редактора уже нет */
	async function save(isPublishing: boolean, content?: OutputData) {
		if (!isPublishing) {
			if (saveTimer) clearTimeout(saveTimer);
			if (maxWaitTimer) clearTimeout(maxWaitTimer);
			saveTimer = null;
			maxWaitTimer = null;
		}

		if (deleted || (!content && !editorInstance)) return;

		try {
			const reached = changes;
			const data = content ?? await editorInstance.save();

			if (!repostId && title.trim() === '' && (!data.blocks || data.blocks.length === 0)) {
				if (isPublishing) saveMessage = 'Ошибка: Содержимое поста пусто';
				return;
			}
			
			isSaving = true;
			saveMessage = isPublishing ? 'Публикация...' : 'Сохранение черновика...';
			
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
			
			if (isPublishing) {
				saveMessage = 'Опубликовано!';
				setTimeout(closeOverlay, 1000);
			} else {
				saveMessage = 'Черновик сохранен';
			}
		} catch (e: any) {
			saveMessage = 'Ошибка: ' + e.message;
			console.error(e);
		} finally {
			if (!isPublishing || saveMessage.startsWith('Ошибка')) {
				isSaving = false;
				setTimeout(() => { if (saveMessage === 'Черновик сохранен') saveMessage = ''; }, 3000);
			}
		}
	}

	function publish() {
		performSave(true);
	}

	async function updateCommentPermission(e: Event) {
		const target = e.target as HTMLSelectElement;
		const perm = target.value as 'everyone' | 'nobody' | 'only_plus' | 'only_subscribers';
		commentPermission = perm;
		
		if (!postId) {
			await performSave(false);
		}
		
		if (postId) {
			try {
				await api.setCommentPermissions(postId, perm);
				saveMessage = 'Права изменены';
				setTimeout(() => { if (saveMessage === 'Права изменены') saveMessage = ''; }, 3000);
			} catch (err: any) {
				saveMessage = 'Ошибка: ' + err.message;
			}
		}
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
	
	async function loadVersion(versionId: number) {
		if (!postId || !editorInstance) return;
		try {
			const entry = await api.getPostHistoryVersion(postId, versionId);
			const editorData = dtfToEditorJs(entry);
			await editorInstance.render(editorData);
			title = entry.title || '';
			isAdult = entry.is_adult || false;
			showHistory = false;
			saveMessage = 'Версия восстановлена';
			setTimeout(() => { if (saveMessage === 'Версия восстановлена') saveMessage = ''; }, 3000);
		} catch (e: any) {
			saveMessage = 'Ошибка: ' + e.message;
		}
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
		get isSaving() { return isSaving; },
		get saveMessage() { return saveMessage; },
		get showHistory() { return showHistory; },
		get historyVersions() { return historyVersions; },
		get loadingHistory() { return loadingHistory; },
		
		get editorInstance() { return editorInstance; },
		set editorInstance(v) { editorInstance = v; },

		init,
		destroy,
		queueSave,
		publish,
		updateCommentPermission,
		toggleHistory,
		loadVersion,
		deletePost,
		goBack
	};
}
