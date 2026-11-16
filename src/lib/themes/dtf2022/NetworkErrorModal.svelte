<script lang="ts">
	import { analyzeError } from '$lib/api/errorInfo';
	import { openOverlay } from '$lib/navigation';
	import Button from './ui/Button.svelte';
	import Popup from './ui/Popup.svelte';

	let {
		error,
		onretry,
		onclose
	}: {
		error: unknown;
		onretry?: () => void;
		onclose?: () => void;
	} = $props();

	let info = $derived(analyzeError(error));
	let retrying = $state(false);
	let copied = $state(false);

	function handleClose() {
		onclose?.();
	}

	async function handleRetry() {
		if (retrying) return;
		retrying = true;
		try {
			await onretry?.();
			handleClose();
		} finally {
			retrying = false;
		}
	}

	function openSettings() {
		handleClose();
		openOverlay({ type: 'settings' });
	}

	async function copyDetails() {
		const text = [
			`[reDTF Error Report]`,
			`Тип: ${info.kind} (${info.badge})`,
			`Заголовок: ${info.title}`,
			`URL: ${info.technicalDetails.url || 'N/A'}`,
			`Статус: ${info.technicalDetails.status ?? 'N/A'}`,
			`Время: ${info.technicalDetails.timestamp}`,
			`Сообщение: ${info.technicalDetails.rawMessage}`
		].join('\n');

		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch {
			// Игнорируем ошибку буфера обмена
		}
	}
</script>

<Popup title={info.title} width={520} onclose={handleClose}>
	<div class="network-error">
		<p class="network-error__desc">{info.description}</p>

		{#if info.suggestions.length > 0}
			<div class="network-error__section">
				<div class="network-error__section-title">Что можно сделать</div>
				<ul class="network-error__suggestions">
					{#each info.suggestions as suggestion}
						<li>{suggestion}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<details class="network-error__details">
			<summary class="network-error__summary">
				<span>Технические подробности</span>
				<svg class="icon details-arrow" width="14" height="14" aria-hidden="true">
					<use href="#ui_arrow_down"></use>
				</svg>
			</summary>
			<dl class="network-error__debug">
				<dt>Тип</dt>
				<dd>{info.badge}</dd>
				<dt>Адрес</dt>
				<dd>{info.technicalDetails.url || 'api.dtf.ru'}</dd>
				{#if info.technicalDetails.status}
					<dt>HTTP-код</dt>
					<dd>{info.technicalDetails.status}</dd>
				{/if}
				<dt>Время</dt>
				<dd>{info.technicalDetails.timestamp}</dd>
			</dl>
			<code class="network-error__raw">{info.technicalDetails.rawMessage}</code>
			<button type="button" class="network-error__copy" onclick={copyDetails}>
				{copied ? 'Скопировано' : 'Скопировать отчёт'}
			</button>
		</details>
	</div>

	{#snippet footer()}
		<Button icon="v_gear" iconSize={18} label="Настройки" onclick={openSettings} />
		{#if onretry}
			<Button
				variant="blue"
				icon="v_refresh"
				iconSize={18}
				label={retrying ? 'Повторяем…' : 'Повторить'}
				disabled={retrying}
				onclick={handleRetry}
			/>
		{/if}
	{/snippet}
</Popup>

<style>
	.network-error {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.network-error__desc {
		margin: 0;
		font-size: 16px;
		line-height: 24px;
		color: var(--text-secondary);
	}

	.network-error__section-title {
		margin-bottom: 8px;
		font-size: 14px;
		font-weight: 600;
		line-height: 20px;
		color: var(--text-primary);
	}

	.network-error__suggestions {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 15px;
		line-height: 22px;
		color: var(--text-secondary);
	}

	.network-error__suggestions li::marker {
		color: var(--text-placeholder, var(--text-muted));
	}

	.network-error__details {
		border-top: 1px solid var(--border-color);
	}

	.network-error__summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 48px;
		font-size: 14px;
		color: var(--text-muted);
		cursor: pointer;
		user-select: none;
		list-style: none;
	}

	.network-error__summary::-webkit-details-marker {
		display: none;
	}

	.network-error__summary:hover {
		color: var(--text-primary);
	}

	.details-arrow {
		transition: transform 0.2s ease;
	}

	.network-error__details[open] .details-arrow {
		transform: rotate(180deg);
	}

	.network-error__debug {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 16px;
		margin: 0 0 12px;
		font-size: 13px;
		line-height: 18px;
	}

	.network-error__debug dt {
		color: var(--text-muted);
	}

	.network-error__debug dd {
		margin: 0;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}

	.network-error__raw {
		display: block;
		padding: 10px 12px;
		border-radius: 8px;
		background: var(--bg-secondary);
		color: var(--text-secondary);
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: 12px;
		line-height: 18px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.network-error__copy {
		margin: 4px 0 8px -8px;
		padding: 8px;
		border-radius: 8px;
		color: var(--text-link, var(--color-blue));
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}

	.network-error__copy:hover {
		background: var(--bg-button-hover);
	}
</style>
