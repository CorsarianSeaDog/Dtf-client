<script lang="ts" generics="T extends string">
	import Popover from './Popover.svelte';
	import { haptics } from '$lib/haptics';

	/* Выпадающий фильтр над списком, как feed-sorting-filters у DTF: им переключались сортировка ленты и вид закладок */
	let {
		items,
		selected,
		label,
		onselect
	}: {
		items: { value: T; label: string }[];
		selected: T;
		/** Заголовок выпадающего списка */
		label: string;
		onselect: (value: T) => void;
	} = $props();

	let open = $state(false);
	let activeLabel = $derived(items.find((item) => item.value === selected)?.label ?? items[0].label);
</script>

<div class="sorting-filters">
	<Popover
		bind:open
		{items}
		{selected}
		onselect={(next: T) => {
			haptics.tick();
			onselect(next);
		}}
		width={180}
		align="left"
		{label}
	>
		<button type="button" class="sorting-filters__button" aria-expanded={open} onclick={() => (open = !open)}>
			<span>{activeLabel}</span>
			<span class="sorting-filters__toggler">
				<svg class="icon" width="16" height="16" aria-hidden="true">
					<use href="#v_chevron_down"></use>
				</svg>
			</span>
		</button>
	</Popover>
</div>

<style>
	.sorting-filters {
		--popover-gap: 7px;

		display: flex;
		box-sizing: border-box;
		width: 100%;
		max-width: var(--content-width);
		/* верхний отступ ленты (padding страницы у DTF) */
		margin: 16px auto 0;
		padding: 4px 0 12px 8px;
	}

	.sorting-filters__button {
		display: flex;
		align-items: center;
		padding: 0 12px;
		border: 0;
		border-radius: 20px;
		background: none;
		color: var(--text-primary);
		font: inherit;
		font-size: 14px;
		line-height: 20px;
		white-space: nowrap;
		cursor: pointer;
	}

	.sorting-filters__toggler {
		display: flex;
		align-items: center;
		margin-right: -4px;
		padding: 0 4px;
	}

	/* Если под селектором сразу идёт первый пост (без блока новостей), межкарточный отступ сверху не нужен */
	.sorting-filters + :global(.feed-item) {
		margin-top: 0;
	}

	@media (max-width: 859px) {
		.sorting-filters {
			--popover-gap: 3px;
			--popover-left: 14px;

			margin-top: 0;
			padding: 16px 16px 8px 4px;
		}
	}
</style>
