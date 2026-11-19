<script lang="ts" generics="K extends string | number">
	/*
	 * Скроллируемый список чипов с кнопкой удаления и подсказкой для пустого состояния.
	 * Общий для тегов и стоп-слов в «Фильтрации» и локально скрытых пользователей в «Чёрном списке».
	 */
	let {
		items,
		label,
		emptyHint,
		onremove
	}: {
		items: Array<{ key: K; label: string; removeLabel: string }>;
		label: string;
		emptyHint: string;
		onremove: (key: K) => void;
	} = $props();
</script>

{#if items.length > 0}
	<div class="chips-container" aria-label={label}>
		{#each items as item (item.key)}
			<span class="chip">
				<span class="chip__label">{item.label}</span>
				<button
					class="chip__remove"
					type="button"
					aria-label={item.removeLabel}
					onclick={() => onremove(item.key)}
				>
					<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
						<path d="M4 4l8 8M12 4l-8 8" />
					</svg>
				</button>
			</span>
		{/each}
	</div>
{:else}
	<p class="empty-hint">{emptyHint}</p>
{/if}

<style>
	/* Просторная скроллируемая область для списка */
	.chips-container {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		min-height: 48px;
		max-height: 200px;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 10px 12px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--st-field) 50%, transparent);
		border: 1px solid var(--st-separator);
		align-content: flex-start;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 8px 0 12px;
		border-radius: 16px;
		background: var(--st-card);
		box-shadow: var(--st-card-shadow-soft);
		color: inherit;
		font-size: 13px;
		font-weight: 500;
	}

	.chip__label {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chip__remove {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		color: var(--st-muted);
		cursor: pointer;
		transition: background-color var(--duration-base), color var(--duration-base);
	}

	.chip__remove:hover {
		background: var(--st-button-hover);
		color: var(--st-danger);
	}

	.empty-hint {
		margin: 4px 0 0;
		color: var(--st-muted);
		font-size: 13px;
	}
</style>
