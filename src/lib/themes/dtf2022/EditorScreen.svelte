<script module lang="ts">
	// Что получает сниппет barActions: всё нужное для «истории» и «удаления», без доступа к сессии
	export type EditorBarActions = {
		/** Версии для выбора; значение 0 — заглушка («Загрузка…», «Нет версий»), её выбирать нельзя */
		historyItems: { value: number; label: string }[];
		historyOpen: boolean;
		/** Открывает или закрывает историю; при открытии сессия загружает версии */
		toggleHistory: () => void;
		restoreVersion: (id: string | number) => void;
		/** Спрашивает подтверждение и удаляет запись */
		requestDelete: () => void;
	};
</script>

<script lang="ts">
	import { onMount, onDestroy, untrack, type Snippet } from 'svelte';
	import Editor from '$lib/components/editor/Editor.svelte';
	import { smartTypography } from '$lib/smartTypography';
	import { Button, Popover } from './ui';
	import ConfirmPopup from './ui/ConfirmPopup.svelte';
	import { notify } from './ui/notify.svelte';
	import EditorSettings from './EditorSettings.svelte';
	import PostCard from './post/PostCard.svelte';
	import { markPostDeleted } from './actions.svelte';

	let {
		session,
		windowed = false,
		barExtra,
		barActions,
		settings,
		onpublish,
		footer
	}: {
		session: any;
		windowed?: boolean;
		barExtra?: Snippet;
		barActions?: Snippet<[EditorBarActions]>;
		settings?: Snippet;
		onpublish?: (publish: () => void) => void;
		footer?: Snippet;
	} = $props();

	onMount(() => {
		session.init();
	});

	onDestroy(() => {
		session.destroy();
	});

	// 0 — заглушка «Загрузка…» / «Нет версий»: выбирать её нельзя
	const historyItems = $derived(
		session.loadingHistory || session.historyVersions.length === 0
			? [{ value: 0, label: session.loadingHistory ? 'Загрузка…' : 'Нет сохранённых версий' }]
			: session.historyVersions.map((v: any) => ({ value: v.id, label: formatDate(v.dateCreated) }))
	);

	function formatDate(timestamp: number) {
		return new Date(timestamp * 1000).toLocaleString('ru-RU', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Enter в заголовке переносит курсор в текст, а не добавляет строку
	function titleKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		session.editorInstance?.caret.setToFirstBlock('start');
	}

	const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

	// Подробный текст ошибки уходит тостом, в шапке остаётся короткая подпись
	const statusText = $derived.by(() => {
		switch (session.saveState as 'idle' | 'dirty' | 'saving' | 'saved' | 'error') {
			case 'dirty':
				return 'Не сохранено';
			case 'saving':
				return 'Сохранение…';
			case 'saved':
				return session.savedAt ? `Сохранено в ${timeFormat.format(session.savedAt)}` : 'Сохранено';
			case 'error':
				return 'Не удалось сохранить';
			default:
				return '';
		}
	});

	async function act(run: () => Promise<unknown>, success?: string) {
		try {
			await run();
			if (success) notify.success(success);
		} catch (e: any) {
			notify.error(e.message);
		}
	}

	// Ошибки сохранения (в том числе фонового и при публикации) показываем целиком тостом: в шапке им нет места
	$effect(() => {
		// notify читает и пишет список тостов: без untrack эффект подписался бы на него и зациклился
		if (session.saveState === 'error' && session.error) untrack(() => notify.error(session.error));
	});

	// Версию можно вернуть назад из самого тоста, пока не было новых правок
	async function restoreVersion(id: string | number) {
		try {
			await session.loadVersion(Number(id));
		} catch (e: any) {
			notify.error(e.message);
			return;
		}
		notify.success('Версия восстановлена', {
			label: 'Отменить',
			onclick: () => session.canUndoLoad && act(session.undoLoadVersion, 'Изменения отменены')
		});
	}

	// Свернули вкладку или приложение: правки сохраняем сразу, потом может не представиться случая
	function onvisibilitychange() {
		if (document.visibilityState === 'hidden') session.flush();
	}

	// Ошибку публикации уже показал эффект выше
	function publish() {
		session.publish().then(() => notify.success('Запись опубликована'), () => {});
	}

	// Форк может сначала показать своё подтверждение: публикацию (с тостами) он запускает переданной функцией
	function requestPublish() {
		if (onpublish) onpublish(publish);
		else publish();
	}

	let confirmingDelete = $state(false);

	// Ctrl/Cmd+S сохраняет сразу, Ctrl/Cmd+Enter публикует так же, как кнопка. По коду клавиши: в русской раскладке key другой
	function onkeydown(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.defaultPrevented || confirmingDelete) return;
		if (e.code === 'KeyS') {
			e.preventDefault();
			session.flush();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (!e.repeat && session.canPublish) requestPublish();
		}
	}

	const barActionsContext: EditorBarActions = {
		get historyItems() {
			return historyItems;
		},
		get historyOpen() {
			return session.showHistory;
		},
		toggleHistory: () => session.toggleHistory(),
		restoreVersion,
		requestDelete: () => (confirmingDelete = true)
	};

	async function deleteEntry() {
		const id = session.postId;
		await session.deletePost();
		if (id) markPostDeleted({ id, sourceId: 'dtf' });
		notify.success('Запись удалена');
		session.goBack();
	}
</script>

<svelte:document {onvisibilitychange} {onkeydown} />

<div class={['writing', { 'writing--window': windowed }]}>
	<div class="writing__bar">
		<button type="button" class="writing__close" aria-label="Закрыть редактор" onclick={session.goBack}>
			<svg class="icon" width="24" height="24" aria-hidden="true">
				<use href="#v_close"></use>
			</svg>
		</button>

		{@render barExtra?.()}

		<span class="writing__status" aria-live="polite">{statusText}</span>

		{#if session.postId}
			{#if barActions}
				{@render barActions(barActionsContext)}
			{:else}
				<Popover
					bind:open={() => session.showHistory, (open) => !open && session.showHistory && session.toggleHistory()}
					items={historyItems}
					onselect={(id) => id && restoreVersion(id)}
					width={220}
					label="История черновика"
				>
					<button type="button" class="writing__icon-button" aria-label="История изменений" onclick={session.toggleHistory}>
						<svg class="icon" width="24" height="24" aria-hidden="true">
							<use href="#v_history"></use>
						</svg>
					</button>
				</Popover>

				<button type="button" class="writing__icon-button" aria-label="Удалить запись" title="Удалить запись" onclick={barActionsContext.requestDelete}>
					<svg class="icon" width="24" height="24" aria-hidden="true">
						<use href="#v_delete"></use>
					</svg>
				</button>
			{/if}
		{/if}

		<div class="writing__publish">
			<Button variant="blue" label="Опубликовать" disabled={!session.canPublish} onclick={requestPublish} />
		</div>
	</div>

	{#if settings}
		{@render settings()}
	{:else}
		<EditorSettings {session} />
	{/if}

	<div class="writing__body">
		<textarea class="writing__title" rows="1" placeholder="Заголовок" bind:value={session.title} onkeydown={titleKeydown} {@attach smartTypography}></textarea>

		{#if session.ready}
			<Editor bind:editorInstance={session.editorInstance} initialData={session.initialData} onChange={session.queueSave} />
		{/if}

		{#if session.repostOf}
			<div class="writing__repost">
				<PostCard post={session.repostOf} embed subscribe={false} />
			</div>
		{/if}
	</div>

	{@render footer?.()}
</div>

{#if confirmingDelete}
	<ConfirmPopup
		title="Удалить запись?"
		message="Запись будет удалена без возможности восстановления."
		errorMessage="Не удалось удалить запись"
		onconfirm={deleteEntry}
		onclose={() => (confirmingDelete = false)}
	/>
{/if}

<style>
	/* В 2023 редактор открывался на всю страницу (vuePopupFullpage), поверх всего остального */
	.writing {
		position: fixed;
		inset: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		overflow-x: hidden;
		overflow-y: auto;
		/* Редактор лежит поверх страницы: без этого жест у края прокрутки (или в коротком тексте) листает страницу под ним */
		overscroll-behavior: contain;
		background-color: var(--bg-card);
		color: var(--text-primary);
	}

	.writing__bar {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
		min-height: calc(56px + env(safe-area-inset-top, 0px));
		padding: calc(8px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) 8px calc(16px + env(safe-area-inset-left, 0px));
		box-sizing: border-box;
		border-bottom: 1px solid var(--border-color);
		background-color: var(--bg-card);
	}

	.writing--window .writing__bar {
		min-height: 56px;
		padding: 8px 16px;
	}

	.writing__close,
	.writing__icon-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 8px;
		color: var(--text-primary);
		opacity: 0.5;
		cursor: pointer;
	}

	.writing__close:hover,
	.writing__icon-button:hover {
		opacity: 1;
	}

	.writing__status {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		color: var(--text-muted);
		font-size: 14px;
		text-align: right;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.writing__publish {
		--btn-height: 40px;
		--btn-offset: 20px;
	}

	.writing__body {
		width: 100%;
		max-width: var(--content-width);
		margin: 0 auto;
		padding: 16px calc(16px + env(safe-area-inset-right, 0px)) calc(120px + env(safe-area-inset-bottom, 0px)) calc(16px + env(safe-area-inset-left, 0px));
		box-sizing: border-box;
	}

	.writing--window .writing__body {
		padding: 16px 16px 120px;
	}

	/* Исходный пост только для контекста: по нему нельзя ни кликнуть, ни проголосовать */
	.writing__repost {
		pointer-events: none;
	}

	.writing__title {
		display: block;
		width: 100%;
		min-height: 44px;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 32px;
		font-weight: 500;
		line-height: 40px;
		outline: none;
		resize: none;
		overflow: hidden;
		field-sizing: content;
	}

	.writing__title::placeholder {
		color: var(--text-placeholder);
	}

	/* На телефоне «Не удалось сохранить» должно помещаться между кнопками без обрезки */
	@media (max-width: 719px) {
		.writing__bar {
			gap: 8px;
		}

		.writing__status {
			font-size: 13px;
		}
	}

	@media (max-width: 859px) {
		.writing:not(.writing--window) .writing__body {
			padding-left: env(safe-area-inset-left, 0px);
			padding-right: env(safe-area-inset-right, 0px);
		}

		.writing--window .writing__body {
			padding-left: 0;
			padding-right: 0;
		}

		.writing__title {
			padding: 0 15px;
			box-sizing: border-box;
			font-size: 26px;
			line-height: 34px;
		}
	}

	/*
	 * Стили блоков редактора из основного CSS DTF (март 2023): правила `.writing …` и `.ce-*`.
	 * Саму оболочку страницы в архиве не сохранили, она восстановлена по соседним частям темы.
	 */
	.writing :global(.editor-container) {
		min-height: 300px;
		padding: 0;
		background: transparent;
		border-radius: 0;
	}

	.writing :global(.ce-block__content),
	.writing :global(.ce-toolbar__content) {
		max-width: none;
	}

	.writing :global(.codex-editor__redactor) {
		margin-right: 0;
	}

	.writing :global(.ce-paragraph) {
		font-size: 17px;
		line-height: 26px;
	}

	.writing :global(.ce-redactor b),
	.writing :global(.ce-redactor strong) {
		font-weight: 700;
	}

	.writing :global(.ce-redactor i),
	.writing :global(.ce-redactor em) {
		font-style: italic;
	}

	.writing :global(.ce-redactor a) {
		padding-bottom: 0;
		border-bottom: 1px solid var(--border-link);
		color: var(--text-link);
	}

	.writing :global(.ce-paragraph::before),
	.writing :global(.ce-header::before),
	.writing :global(.cdx-input::before),
	.writing :global(.cdx-gallery__caption::before),
	.writing :global(.cdx-image__caption::before),
	.writing :global(.ce-quote--text::before),
	.writing :global(.ce-quote--author::before),
	.writing :global(.ce-quote--job::before),
	.writing :global(.cdx-image-form__button) {
		color: var(--text-placeholder) !important;
	}

	.writing :global(h2.ce-header),
	.writing :global(h3.ce-header),
	.writing :global(h4.ce-header) {
		font-size: 27px;
	}

	.writing :global(.marked-text) {
		padding: 0.09em 0;
		background: var(--bg-editor-dragover);
	}

	.writing :global(.cdx-image-form),
	.writing :global(.cdx-gallery__select-file) {
		border: 2px dashed var(--border-editor-dragover);
	}

	.writing :global(.cdx-gallery__select-file) {
		color: var(--text-placeholder);
	}

	.writing :global(.cdx-image--backgrounded) {
		background: var(--bg-editor-dragover-preview);
	}

	@media (max-width: 859px) {
		.writing :global(.ce-toolbar__content) {
			padding: 1px !important;
		}

		.writing :global(.ce-block__content) {
			padding: 1px 15px !important;
			word-break: break-word;
		}
	}
</style>
