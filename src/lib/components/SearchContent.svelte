<script lang="ts">
	import { untrack } from 'svelte';
	import { api } from '$lib/api/index.svelte';
	import type { CursorData, Post, SearchFilters, SearchSorting, SearchSubsite } from '$lib/api/types';
	import { appendUnique, postKey } from '$lib/api/utils';
	import type { SearchTab } from '$lib/themes/contract';
	import ThemeLoader, { preloadThemeComponent } from '$lib/themes/ThemeLoader.svelte';
	import { activeTheme } from '$lib/themes/index.svelte';
	import Reveal from './Reveal.svelte';

	/*
	 * Результаты поиска. Записи листаются по курсору, блоги и темы приходят одной страницей.
	 * Каждая вкладка хранит своё состояние для актуальных параметров, поэтому переключение вкладок
	 * не сбрасывает загруженные записи и не тратит лишние поисковые запросы.
	 * Разметку рисует компонент темы SearchPage.
	 */
	let { query }: { query: string } = $props();

	class TabState<T> {
		key = $state('');
		items = $state.raw<T[]>([]);
		cursor: CursorData | undefined;
		hasMore = $state(false);
		total = $state<number | undefined>();
		loaded = $state(false);
		loading = $state(false);
		error = $state<unknown>();
		// Номер запроса: ответ прежней выдачи не должен перетереть новую
		reqId = 0;
	}

	let tab = $state<SearchTab>('posts');
	let sorting = $state<SearchSorting>('relevance');
	let filters = $state<SearchFilters>({ title: false, editorial: false, strict: false });
	// Первая выдача пришла: до этого страница показывает загрузку целиком, после — только список
	let shown = $state(false);

	const postsTab = new TabState<Post>();
	const blogsTab = new TabState<SearchSubsite>();
	const topicsTab = new TabState<SearchSubsite>();

	let postsKey = $derived(
		`${query}\0${sorting}\0${filters.title ? 1 : 0}${filters.editorial ? 1 : 0}${filters.strict ? 1 : 0}`
	);

	function stateOf(t: SearchTab) {
		return t === 'posts' ? postsTab : t === 'blogs' ? blogsTab : topicsTab;
	}

	function keyOf(t: SearchTab) {
		return t === 'posts' ? postsKey : query;
	}

	async function load(targetTab: SearchTab, targetKey: string, more = false): Promise<boolean> {
		const st = stateOf(targetTab);
		if (more && (targetTab !== 'posts' || st.loading || !st.hasMore)) return false;
		const id = ++st.reqId;
		st.loading = true;
		st.error = undefined;
		// Параллельно с первым поиском грузим компонент темы: иначе Reveal запустит переход на пустом экране и мелькнёт спиннер
		const componentReady = !shown ? preloadThemeComponent(activeTheme.chain, 'SearchPage') : null;
		if (!more) {
			st.key = targetKey;
			st.loaded = st.hasMore = false;
			st.items = [];
			st.total = st.cursor = undefined;
		}
		try {
			if (targetTab === 'posts') {
				const prevCursor = postsTab.cursor;
				const result = await api.searchPosts(query, sorting, $state.snapshot(filters), prevCursor);
				if (id !== postsTab.reqId) return false;
				const prev = more ? postsTab.items : [];
				const next = appendUnique(prev, result.items, postKey);
				postsTab.items = next;
				postsTab.total = result.total;
				const cursorMoved =
					result.lastId !== undefined &&
					(!more ||
						!prevCursor ||
						result.lastId !== prevCursor.lastId ||
						(result.lastSortingValue ?? 0) !== prevCursor.lastSortingValue);
				postsTab.hasMore = result.items.length > 0 && cursorMoved;
				postsTab.cursor = postsTab.hasMore
					? { lastId: result.lastId!, lastSortingValue: result.lastSortingValue ?? 0 }
					: undefined;
				postsTab.loaded = true;
				return next.length > prev.length;
			}
			const subsiteTab = st as TabState<SearchSubsite>;
			const result = await api.searchSubsites(query, targetTab === 'topics');
			if (id !== subsiteTab.reqId) return false;
			subsiteTab.items = appendUnique([], result.items, (s) => s.id);
			subsiteTab.total = result.total;
			subsiteTab.loaded = true;
			return subsiteTab.items.length > 0;
		} catch (e) {
			if (id === st.reqId) {
				st.error = e;
				st.loaded = true;
			}
			return false;
		} finally {
			if (id === st.reqId) {
				st.loading = false;
				if (componentReady) {
					await componentReady;
					if (id === st.reqId) shown = true;
				} else {
					shown = true;
				}
			}
		}
	}

	$effect(() => {
		void query, tab, sorting, filters;
		untrack(() => {
			const currentTab = tab;
			const currentKey = keyOf(currentTab);
			const st = stateOf(currentTab);
			// Не перезапрашиваем уже загруженную или грузящуюся вкладку; если упала догрузка, первую страницу тоже сохраняем
			if (st.key === currentKey && (st.loading || (st.loaded && (!st.error || st.items.length > 0)))) return;
			void load(currentTab, currentKey);
		});
	});

	let activeState = $derived(stateOf(tab));
	let activeKey = $derived(keyOf(tab));
	let isCurrent = $derived(activeState.key === activeKey);
	let totals = $derived<Partial<Record<SearchTab, number>>>({
		posts: postsTab.key === postsKey ? postsTab.total : undefined,
		blogs: blogsTab.key === query ? blogsTab.total : undefined,
		topics: topicsTab.key === query ? topicsTab.total : undefined
	});
</script>

<div class="search-screen">
	<Reveal ready={shown} anim="contentIn">
		<ThemeLoader
			componentName="SearchPage"
			{query}
			{tab}
			onTabChange={(value: SearchTab) => {
				if (value !== tab) tab = value;
			}}
			{sorting}
			onSortingChange={(value: SearchSorting) => {
				if (value !== sorting) sorting = value;
			}}
			{filters}
			onFiltersChange={(value: SearchFilters) => (filters = value)}
			posts={tab === 'posts' && postsTab.key === postsKey ? postsTab.items : []}
			subsites={tab !== 'posts' && isCurrent ? (activeState as TabState<SearchSubsite>).items : []}
			total={isCurrent ? activeState.total : undefined}
			{totals}
			loaded={isCurrent && activeState.loaded}
			loading={isCurrent && activeState.loading}
			error={isCurrent ? activeState.error : undefined}
			hasMore={tab === 'posts' && postsTab.key === postsKey && postsTab.hasMore}
			loadMore={() => load('posts', postsKey, true)}
			onretry={() => load(tab, keyOf(tab))}
		/>
	</Reveal>
</div>

<style>
	.search-screen {
		width: 100%;
	}
</style>
