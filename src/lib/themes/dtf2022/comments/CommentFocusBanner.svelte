<script lang="ts">
	import type { CommentFocusController, CommentFocusStatus } from '$lib/components/Comments/commentFocus.svelte';

	type BannerStatus = Extract<CommentFocusStatus, 'waiting' | 'ready' | 'not-found' | 'hidden-by-filter'>;

	const BANNERS: Record<BannerStatus, { text: string; action?: string; pending?: string; run?: (f: CommentFocusController) => void }> = {
		waiting: {
			text: 'Комментарий ещё не появился на DTF — проверяем…',
			action: 'Проверить',
			pending: 'Проверяем…',
			run: (f) => f.checkNow()
		},
		ready: {
			text: 'Комментарий появился',
			action: 'Перейти',
			run: (f) => f.jump()
		},
		'hidden-by-filter': {
			text: 'Комментарий скрыт вашим фильтром'
		},
		'not-found': {
			text: 'Комментарий не найден — возможно, он удалён или DTF ещё не обновил ветку',
			action: 'Повторить',
			run: (f) => f.retry()
		}
	};

	/** Компактная плашка вверху комментариев, когда целевой комментарий из уведомления ещё не приехал с DTF или скрыт */
	let { focus }: { focus: CommentFocusController } = $props();

	let banner = $derived(focus.status in BANNERS ? BANNERS[focus.status as BannerStatus] : null);
	let busy = $derived(focus.status === 'waiting' && focus.checking);
</script>

{#if banner}
	<div class={['comment-focus-banner', { 'comment-focus-banner--ready': focus.status === 'ready' }]} role="status" aria-live="polite">
		{#if focus.status === 'waiting'}
			<span class="comment-focus-banner__spinner" aria-hidden="true"></span>
		{/if}
		<span class="comment-focus-banner__text">{banner.text}</span>
		<div class="comment-focus-banner__actions">
			{#if banner.action && banner.run}
				<button type="button" class="comment-focus-banner__action" disabled={busy} onclick={() => banner.run?.(focus)}>
					{busy ? (banner.pending ?? banner.action) : banner.action}
				</button>
			{/if}
			<button type="button" class="comment-focus-banner__close" aria-label="Скрыть" onclick={focus.dismiss}>
				<svg class="icon" width="16" height="16" aria-hidden="true">
					<use href="#v_cross"></use>
				</svg>
			</button>
		</div>
	</div>
{/if}

<style>
	.comment-focus-banner {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
		padding: 10px 12px;
		border: 1px solid var(--border-subtle-2);
		border-radius: 8px;
		background-color: var(--bg-tertiary);
		color: var(--text-secondary);
		font-size: 14px;
		line-height: 20px;
	}

	.comment-focus-banner--ready {
		border-color: var(--color-blue);
		background-color: var(--bg-unread);
		color: var(--text-primary);
	}

	.comment-focus-banner__spinner {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		border: 2px solid var(--border-subtle-2);
		border-top-color: var(--color-blue);
		border-radius: 50%;
		animation: comment-focus-spin 0.8s linear infinite;
	}

	.comment-focus-banner__text {
		flex: 1 1 auto;
		min-width: 0;
	}

	.comment-focus-banner__actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.comment-focus-banner__action {
		color: var(--text-link);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
	}

	.comment-focus-banner__action:disabled {
		color: var(--text-disabled);
		cursor: default;
	}

	.comment-focus-banner__close {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2px;
		color: var(--text-muted);
		cursor: pointer;
	}

	.comment-focus-banner__close::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 32px;
		height: 32px;
		transform: translate(-50%, -50%);
	}

	.comment-focus-banner__close .icon {
		display: block;
	}

	@media (pointer: coarse), (max-width: 859px) {
		.comment-focus-banner__close::after {
			width: 44px;
			height: 44px;
		}
	}

	@media (hover: hover) {
		.comment-focus-banner__action:not(:disabled):hover {
			color: var(--text-link-subtle);
		}

		.comment-focus-banner__close:hover {
			color: var(--text-primary);
		}
	}

	@media (max-width: 520px) {
		.comment-focus-banner {
			flex-wrap: wrap;
		}
	}

	@keyframes comment-focus-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.comment-focus-banner__spinner {
			animation: none;
		}
	}
</style>
