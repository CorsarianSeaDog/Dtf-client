<script lang="ts">
	import { tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { editorJsToDtf } from '$lib/components/editor/mapper';
	import type { Block } from '$lib/api/types';
	import { MOBILE_BREAKPOINT } from '../types';
	import BaseEditorScreen, { type EditorBarActions } from '../dtf2022/EditorScreen.svelte';
	import EditorSettings from '../dtf2022/EditorSettings.svelte';
	import PublishSheet from './PublishSheet.svelte';
	import EditorMenu from './EditorMenu.svelte';
	import { activeThemeSettings } from '../settings.svelte';
	import { notify } from '../dtf2022/ui/notify.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import PostPreview from './PostPreview.svelte';

	let { session }: { session: any } = $props();

	const themeSettings = activeThemeSettings();
	const fullscreen = $derived(themeSettings.value.editorFullscreen !== false);

	const mobile = new MediaQuery(`max-width: ${MOBILE_BREAKPOINT}px`);

	// На телефоне настройки и публикация живут в шторке: строка над заголовком не рисуется
	let publishing = $state<(() => void) | null>(null);

	function onpublish(publish: () => void) {
		if (mobile.current) publishing = publish;
		else publish();
	}

	/*
	 * Предпросмотр — режим этого же экрана: тело редактора прячется (theme.css), сам EditorJS остаётся жить,
	 * поэтому текст, история правок и выделение никуда не деваются. Блоки берём из редактора тем же mapper.ts, что и при сохранении.
	 */
	let previewBlocks = $state<Block[] | null>(null);
	const previewing = $derived(previewBlocks !== null);
	// Что было в фокусе и где стоял курсор: после выхода возвращаем
	let before: { focus: HTMLElement | null; range: Range | null; scroll: number } | null = null;

	const screen = () => document.querySelector<HTMLElement>('.writing');

	async function togglePreview() {
		if (previewBlocks) {
			previewBlocks = null;
			await tick();
			if (!before) return;
			const { focus, range, scroll } = before;
			before = null;
			if (screen()) screen()!.scrollTop = scroll;
			focus?.focus({ preventScroll: true });
			if (range) {
				const sel = getSelection();
				sel?.removeAllRanges();
				sel?.addRange(range);
			}
			return;
		}
		const sel = getSelection();
		const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		before = {
			focus: focus?.closest('.writing__body') ? focus : null,
			range: sel?.rangeCount && sel.anchorNode?.parentElement?.closest('.codex-editor') ? sel.getRangeAt(0).cloneRange() : null,
			scroll: screen()?.scrollTop ?? 0
		};
		// Редактор не смог собрать содержимое: пустой предпросмотр был бы ложью
		const data = await session.editorInstance?.save().catch(() => null);
		if (!data) return notify.error('Не удалось собрать предпросмотр');
		previewBlocks = editorJsToDtf(data).entry.blocks;
		if (screen()) screen()!.scrollTop = 0;
	}
</script>

<!-- История и удаление уходят в «⋯» только на телефоне; на десктопе остаются штатные кнопки -->
{#snippet menu(actions: EditorBarActions)}
	<EditorMenu {actions} {previewing} onpreview={togglePreview} />
{/snippet}

<!-- Окно или весь экран, плавно: геометрия .writing--window и переход заданы в theme.css -->
<BaseEditorScreen {session} windowed={!fullscreen} {onpublish} barActions={mobile.current ? menu : undefined}>
	{#snippet barExtra()}
		<!-- На телефоне предпросмотр лежит в «⋯»; у новой записи без id меню нет, поэтому кнопка остаётся в шапке -->
		{#if !mobile.current || !session.postId}
			<button
				type="button"
				class="writing__preview"
				aria-label={previewing ? 'Вернуться к редактору' : 'Предпросмотр'}
				aria-pressed={previewing}
				onclick={togglePreview}
			>
				<svg class="icon" width="24" height="24" aria-hidden="true">
					<use href="#v_eye"></use>
				</svg>
			</button>
		{/if}
		<button
			type="button"
			class="writing__mode"
			aria-label={fullscreen ? 'Показать редактор окном' : 'Развернуть редактор на весь экран'}
			onclick={() => themeSettings.patch({ editorFullscreen: !fullscreen })}
		>
			<svg class="icon" width="24" height="24" aria-hidden="true">
				<use href="#{fullscreen ? 'v_minimize' : 'v_maximize'}"></use>
			</svg>
		</button>
	{/snippet}

	{#snippet settings()}
		{#if !mobile.current && !previewing}
			<EditorSettings {session} />
		{/if}
	{/snippet}

	{#snippet footer()}
		{#if previewBlocks}
			<PostPreview title={session.title} blocks={previewBlocks} repost={session.repostOf} />
		{/if}
		<EditorToolbar {session} />
	{/snippet}
</BaseEditorScreen>

{#if publishing && mobile.current}
	<PublishSheet {session} onpublish={publishing} onclose={() => (publishing = null)} />
{/if}
