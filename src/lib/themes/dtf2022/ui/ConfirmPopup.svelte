<script lang="ts">
	import Button from './Button.svelte';
	import Popup from './Popup.svelte';
	import { notify } from './notify.svelte';

	/** Модал подтверждения необратимого действия */
	let {
		title,
		message,
		confirmLabel = 'Удалить',
		busyLabel = 'Удаление...',
		errorMessage = 'Не удалось выполнить действие',
		onconfirm,
		onclose
	}: {
		title: string;
		message: string;
		confirmLabel?: string;
		busyLabel?: string;
		errorMessage?: string;
		onconfirm: () => Promise<void>;
		onclose: () => void;
	} = $props();

	let busy = $state(false);

	async function submit() {
		if (busy) return;
		busy = true;
		try {
			await onconfirm();
			onclose();
		} catch (e) {
			notify.error((e as Error).message || errorMessage);
		} finally {
			busy = false;
		}
	}
</script>

<Popup {title} onclose={() => { if (!busy) onclose(); }}>
	<p class="confirm-popup__text">{message}</p>
	{#snippet footer()}
		<Button label="Отмена" disabled={busy} onclick={onclose} />
		<Button variant="blue" label={busy ? busyLabel : confirmLabel} disabled={busy} onclick={submit} />
	{/snippet}
</Popup>

<style>
	.confirm-popup__text {
		margin: 0;
		font-size: 15px;
		line-height: 22px;
		color: var(--text-primary);
	}
</style>
