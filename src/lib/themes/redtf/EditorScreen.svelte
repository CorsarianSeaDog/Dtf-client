<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import { MOBILE_BREAKPOINT } from '../types';
	import BaseEditorScreen, { type EditorBarActions } from '../dtf2022/EditorScreen.svelte';
	import EditorSettings from '../dtf2022/EditorSettings.svelte';
	import PublishSheet from './PublishSheet.svelte';
	import EditorMenu from './EditorMenu.svelte';
	import { activeThemeSettings } from '../settings.svelte';

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
</script>

<!-- История и удаление уходят в «⋯» только на телефоне; на десктопе остаются штатные кнопки -->
{#snippet menu(actions: EditorBarActions)}
	<EditorMenu {actions} />
{/snippet}

<!-- Окно или весь экран, плавно: геометрия .writing--window и переход заданы в theme.css -->
<BaseEditorScreen {session} windowed={!fullscreen} {onpublish} barActions={mobile.current ? menu : undefined}>
	{#snippet barExtra()}
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
		{#if !mobile.current}
			<EditorSettings {session} />
		{/if}
	{/snippet}
</BaseEditorScreen>

{#if publishing && mobile.current}
	<PublishSheet {session} onpublish={publishing} onclose={() => (publishing = null)} />
{/if}
