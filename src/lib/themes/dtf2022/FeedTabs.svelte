<script lang="ts">
	import type { FeedName, FeedSorting } from '$lib/feed.svelte';
	import { formatDay } from './format';
	import SortingFilters from './ui/SortingFilters.svelte';

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
</script>

<SortingFilters items={OPTIONS[currentFeed]} selected={sorting} label={POPOVER_LABELS[currentFeed]} onselect={switchSorting} />
