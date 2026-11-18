<script lang="ts">
	import type { Snippet } from 'svelte';

	/*
	 * Группа настроек в духе libadwaita: заголовок, пояснение и белая карточка со строками на мягкой тени.
	 * Цвета берутся из переменных окна (SettingsScreen).
	 */
	let { id, settingKey, title, note, description, layout = 'card', children }: {
		id?: string;
		settingKey?: string;
		title?: string;
		note?: string;
		description?: string;
		layout?: 'card' | 'subgroups' | 'subgroup';
		children: Snippet;
	} = $props();
</script>

<section {id} data-setting-key={settingKey} class={['group', { 'group--subgroup': layout === 'subgroup' }]}>
	{#if title}
		<svelte:element this={layout === 'subgroup' ? 'h4' : 'h3'} class="group__title">
			{title}
			{#if note}
				<span class="group__note">{note}</span>
			{/if}
		</svelte:element>
	{/if}
	{#if description}
		<p class="group__description">{description}</p>
	{/if}
	<div class={layout === 'subgroups' ? 'group__subgroups' : 'group__list'}>
		{@render children()}
	</div>
</section>

<style>
	.group {
		position: relative;
		margin-bottom: 36px;
	}

	.group:has(.group__title) {
		margin-top: 36px;
	}

	.group:first-child,
	.group:has(.group__title):first-child {
		margin-top: 0;
	}

	.group.group--subgroup {
		margin: 0;
	}

	.group:has(:global(.select-wrap--open)) {
		z-index: 50;
	}

	.group__note {
		margin-left: 8px;
		color: var(--st-warn);
		font-size: 13px;
		font-weight: 400;
	}

	.group__title {
		margin: 0 4px 6px;
		font-size: 17px;
		font-weight: 500;
		line-height: 24px;
	}

	.group__description {
		margin: 0 4px 12px;
		color: var(--st-muted);
		font-size: 14px;
		line-height: 20px;
	}

	.group__title + .group__list,
	.group__title + .group__subgroups {
		margin-top: 12px;
	}

	.group--subgroup .group__title {
		margin-bottom: 0;
		color: var(--st-muted);
		font-size: 14px;
		font-weight: 600;
		line-height: 20px;
	}

	.group--subgroup .group__title + .group__list {
		margin-top: 4px;
	}

	.group__subgroups {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
	}

	.group__list {
		position: relative;
		border-radius: 14px;
		background: var(--st-card);
		box-shadow: var(--st-card-shadow);
	}

	.group__list > :global(*:first-child) {
		border-top-left-radius: 14px;
		border-top-right-radius: 14px;
	}

	.group__list > :global(*:last-child) {
		border-bottom-left-radius: 14px;
		border-bottom-right-radius: 14px;
	}
</style>
