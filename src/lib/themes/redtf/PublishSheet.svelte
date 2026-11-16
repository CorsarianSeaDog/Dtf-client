<script lang="ts">
	import { onMount } from 'svelte';
	import { pushSubstate, popSubstate } from '$lib/navigation';
	import { Button } from '../dtf2022/ui';
	import Popup from '../dtf2022/ui/Popup.svelte';
	import EditorSettings from '../dtf2022/EditorSettings.svelte';

	/*
	 * Шторка публикации на телефоне: те же настройки записи, что у строки над заголовком, и кнопки.
	 * Само окно — Popup (на узком экране он уже шторка снизу); здесь только шаг истории для «назад» и публикация.
	 */
	let { session, onpublish, onclose }: { session: any; onpublish: () => void; onclose: () => void } = $props();

	// После нажатия кнопка заблокирована до ошибки: успешная публикация сама закроет редактор, вместе со шторкой
	let sent = $state(false);

	// «Назад» браузера закрывает шторку, а не редактор
	onMount(() => {
		pushSubstate(onclose);
	});

	function close() {
		if (!popSubstate()) onclose();
	}

	function publish() {
		sent = true;
		onpublish();
	}
</script>

<Popup title="Публикация" onclose={close}>
	<div class="publish-sheet">
		<EditorSettings {session} />
	</div>
	{#snippet footer()}
		<!-- Подвал Popup на телефоне идёт колонкой снизу вверх: главная кнопка оказывается сверху -->
		<Button label="Отмена" onclick={close} />
		<Button variant="blue" label="Опубликовать" disabled={!session.canPublish || (sent && session.saveState !== 'error')} onclick={publish} />
	{/snippet}
</Popup>

<style>
	/* Поля настроек на всю ширину шторки, одно под другим */
	.publish-sheet :global(.writing__settings.writing__settings) {
		flex-direction: column;
		align-items: stretch;
		gap: 12px;
		padding: 0;
	}

	.publish-sheet :global(.writing__subsite.writing__subsite),
	.publish-sheet :global(.writing__comments.writing__comments) {
		flex: none;
		min-width: 0;
	}

	.publish-sheet :global(.writing__adult) {
		min-height: 44px;
	}

	/* Внизу экрана список открывается вверх: иначе он уходит за край шторки */
	.publish-sheet :global(.popover.popover) {
		top: auto;
		bottom: calc(100% + var(--popover-gap, 8px));
		transform-origin: bottom left;
	}
</style>
