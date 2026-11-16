<script lang="ts">
	import { analyzeError } from '$lib/api/errorInfo';
	import { openOverlay } from '$lib/navigation';
	import ThemeLoader from '$lib/themes/ThemeLoader.svelte';

	let {
		error,
		onretry,
		title
	}: {
		error: unknown;
		onretry?: () => void;
		title?: string;
	} = $props();

	let info = $derived(analyzeError(error));
	let showModal = $state(false);
	let retrying = $state(false);

	async function handleRetry() {
		if (retrying) return;
		retrying = true;
		try {
			await onretry?.();
		} finally {
			retrying = false;
		}
	}

	function openSettings() {
		openOverlay({ type: 'settings' });
	}
</script>

<div class="error-block" role="alert">
	<div class="error-block__text">
		<h2 class="error-block__title">{title || info.title}</h2>
		<p class="error-block__subtitle">{info.subtitle}</p>
	</div>

	<div class="error-block__actions">
		{#if onretry}
			<button type="button" class="error-btn error-btn--primary" disabled={retrying} onclick={handleRetry}>
				{retrying ? 'Повторяем…' : 'Повторить'}
			</button>
		{/if}
		<button type="button" class="error-btn" onclick={() => (showModal = true)}>Подробнее</button>
		<button type="button" class="error-btn" onclick={openSettings}>Настройки</button>
	</div>
</div>

{#if showModal}
	<ThemeLoader componentName="NetworkErrorModal" {error} onretry={handleRetry} onclose={() => (showModal = false)} />
{/if}

<style>
	.error-block {
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: var(--content-width, 640px);
		margin: 32px auto;
		padding: 20px;
		border-radius: 8px;
		background: var(--bg-card, #fff);
		box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
		border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
		text-align: left;
	}

	.error-block__title {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
		line-height: 24px;
		color: var(--text-primary, #000);
	}

	.error-block__subtitle {
		margin: 2px 0 0;
		font-size: 14px;
		line-height: 20px;
		color: var(--text-muted, #757575);
		overflow-wrap: anywhere;
	}

	.error-block__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.error-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 36px;
		padding: 0 12px;
		border-radius: 8px;
		background: transparent;
		color: var(--text-link, var(--color-blue, #4683d9));
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		user-select: none;
		transition: background-color 0.15s ease;
	}

	.error-btn:hover {
		background: var(--bg-button-hover, rgba(0, 0, 0, 0.05));
	}

	.error-btn--primary {
		padding: 0 16px;
		background: var(--bg-submit-button, #4683d9);
		color: var(--text-submit-button, #fff);
	}

	.error-btn--primary:hover {
		background: var(--bg-submit-button--hover, #437cce);
	}

	.error-btn:disabled {
		opacity: 0.6;
		pointer-events: none;
	}

	/* Смартфон: блок от края до края, как карточки ленты; кнопки крупнее, «Повторить» на всю ширину */
	@media (max-width: 639px) {
		.error-block {
			margin: 8px 0;
			padding: 16px;
			border-radius: 0;
			border-inline: none;
		}

		.error-btn {
			flex: 1 1 0;
			height: 44px;
		}

		.error-btn--primary {
			flex-basis: 100%;
		}
	}
</style>
