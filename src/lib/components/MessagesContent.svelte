<script lang="ts">
	import ScreenBar from './ScreenBar.svelte';
</script>

<div class="messages-screen">
	<ScreenBar screen="messages" />
	<div class="messages-page">
		<header class="messages__header">
			<span class="messages__title">Сообщения</span>
		</header>
		<div class="messages__body">
			<svg class="icon messages__icon" width="40" height="40" aria-hidden="true">
				<use href="#v_messenger"></use>
			</svg>
			<p class="messages__status">Личные сообщения пока в разработке</p>
		</div>
	</div>
</div>

<style>
	.messages-screen {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		width: 100%;
	}

	.messages-page {
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: var(--content-width);
		flex-grow: 1;
		background: var(--bg-card);
		color: var(--text-primary);
	}

	.messages__header {
		display: flex;
		align-items: baseline;
		padding: 16px;
		border-bottom: 1px solid var(--bg-main);
	}

	.messages__title {
		font-size: 20px;
		line-height: 24px;
		font-weight: 700;
	}

	.messages__body {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex-grow: 1;
		gap: 12px;
		padding: 48px 16px;
		color: var(--text-muted);
		text-align: center;
	}

	.messages__icon {
		opacity: 0.45;
	}

	.messages__status {
		margin: 0;
		font-size: 15px;
		line-height: 22px;
	}

	@media (max-width: 719px) {
		/* Компенсируем отступ .page-content на корне экрана, чтобы playClipped не обрезал низ при переходе */
		.messages-screen {
			margin-bottom: calc(-1 * var(--mobile-bar-height));
		}

		.messages-page {
			padding-bottom: var(--mobile-bar-height);
		}
	}
</style>
