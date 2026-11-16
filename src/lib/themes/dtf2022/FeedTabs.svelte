<script lang="ts">
	import type { FeedName, FeedSorting } from '$lib/feed.svelte';
	import { formatDay } from './format';
	import Popover from './ui/Popover.svelte';
	import { haptics } from '$lib/haptics';

	// Вкладки ленты живут в сайдбаре и мобильной панели, здесь — селектор сортировки/фильтра текущей ленты
	let {
		currentFeed,
		sorting,
		switchSorting
	}: {
		currentFeed: FeedName;
		sorting: FeedSorting;
		switchSorting: (sorting: FeedSorting) => void;
	} = $props();

	const POPOVER_LABELS: Record<FeedName, string> = {
		popular: 'Период',
		new: 'Сортировка',
		my: 'Сортировка'
	};

	const OPTIONS: Record<FeedName, { value: FeedSorting; label: string }[]> = {
		popular: [
			{ value: 'now', label: formatDay(new Date()) },
			{ value: 'day', label: '24 часа' },
			{ value: 'week', label: 'Неделя' },
			{ value: 'month', label: 'Месяц' },
			{ value: 'year', label: 'Год' },
			{ value: 'all', label: 'Всё время' }
		],
		new: [
			{ value: 'all', label: 'Все' },
			{ value: 'from5', label: 'От +5' },
			{ value: 'from10', label: 'От +10' }
		],
		my: [
			{ value: 'new', label: 'По дате' },
			{ value: 'hotness', label: 'По популярности' },
			{ value: 'seen', label: 'Просмотренные' }
		]
	};

	let open = $state(false);
	let items = $derived(OPTIONS[currentFeed]);
	let activeLabel = $derived(items.find((item) => item.value === sorting)?.label ?? items[0].label);
</script>

<div class="sorting-filters">
	<Popover
		bind:open
		{items}
		selected={sorting}
		onselect={(next) => {
			haptics.tick();
			switchSorting(next);
		}}
		width={180}
		align="left"
		label={POPOVER_LABELS[currentFeed]}
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
