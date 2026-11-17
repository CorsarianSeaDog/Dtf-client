<script lang="ts">
	import { api } from '$lib/api/index.svelte';
	import type { PaginatedResult, Post } from '$lib/api/types';
	import { appendUnique, postKey } from '$lib/api/utils';
	import ThemeLoader, { hasThemeComponent, preloadThemeComponent } from '$lib/themes/ThemeLoader.svelte';
	import { feedNotice, NOTICE_AFTER_POST } from '$lib/feedNotice.svelte';
	import Reveal from '$lib/components/Reveal.svelte';
	import NetworkErrorState from '$lib/components/NetworkErrorState.svelte';
	import { activeTheme } from '$lib/themes/index.svelte';
	import { loadFeed, peekFeed, sortingOf } from '$lib/feedCache';
	import { feed, openFeedTab, type FeedName, type FeedSorting } from '$lib/feed.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { chunked } from '$lib/chunked';
	import { watchVisible } from '$lib/watchVisible';
	import { appear } from '$lib/themes/appear';
	import { markFeedLoaded } from '$lib/ready';
	import { editorialNews } from '$lib/editorialNews.svelte';
	import { seenSnapshot, trackInFeed, tracksFeed } from '$lib/storage/seen.svelte';
	import { settings } from '$lib/storage/settings.svelte';

	/*
	 * Одна лента главной. Страница держит несколько таких сразу: неактивная скрыта, но сохраняет посты,
	 * подгруженные страницы и раскладку, поэтому возврат на неё мгновенный.
	 */
	let { name, sorting, active }: { name: FeedName; sorting: FeedSorting; active: boolean } = $props();

	const CHUNK_SIZE = 5;
	// Сколько страниц подряд, целиком из прочитанного, пропускаем, пока ищем непрочитанные
	const MAX_SKIPPED_PAGES = 10;

	// Прочитанное на момент загрузки ленты: за сессию оно остаётся на месте, пока ленту не обновят
	let seen = $state.raw(new Set<string>());
	// «Показать прочитанные»: лента показывается целиком до смены сортировки
	let showSeen = $state(false);
	const unseen = (items: Post[]) => (settings.value.hideSeen && !showSeen ? items.filter((post) => !seen.has(postKey(post))) : items);
	const withoutSeen = (result: PaginatedResult<Post>): PaginatedResult<Post> => ({ ...result, items: unseen(result.items) });
	const hasMore = (result: PaginatedResult<Post>) => !!result.cursors && Object.keys(result.cursors).length > 0;

	let feedResult = $state.raw<PaginatedResult<Post> | null>(null);
	let renderedCount = $state(0);
	let renderedItems = $derived(feedResult ? feedResult.items.slice(0, renderedCount) : []);
	let loading = $state(true);
	let loadingMore = $state(false);
	let refreshing = $state(false);
	let error = $state<unknown | null>(null);
	// Растёт, когда показана новая первая страница: список пересоздаётся и проигрывает появление (подгрузка вниз его не трогает)
	let epoch = $state(0);

	// Номер запроса: ответ прежней сортировки не должен перетереть новый
	let requestId = 0;
	let moreInFlight: Promise<boolean> | undefined;

	// Посты показываются порциями по кадрам, чтобы большая пачка не блокировала поток
	const chunks = chunked(
		() => feedResult?.items.length ?? 0,
		() => renderedCount,
		(count) => (renderedCount = count),
		CHUNK_SIZE
	);
	onDestroy(chunks.stop);

	// Свежие посты подставляются, только пока лента у верха: иначе список сменился бы под пальцем. У скрытой — по запомненной прокрутке
	const atTop = () => (active ? window.scrollY : feed.scrollOf(name)) < 100;

	// Свежая первая страница совпадает с началом показанного списка
	const startsWith = (list: PaginatedResult<Post>, first: PaginatedResult<Post>) =>
		first.items.every((post, i) => post.id === list.items[i]?.id && post.sourceId === list.items[i]?.sourceId);

	/**
	 * Показать ленту. Уже виденная лента открывается сразу из кэша, свежие посты подтягиваются следом.
	 * `isRefresh` — явное обновление: старый список остаётся, пока идёт запрос.
	 */
	async function loadInitial(isRefresh = false) {
		const id = ++requestId;
		const cached = isRefresh ? undefined : peekFeed(name, sorting);
		const showNews = name === 'popular' && sorting === 'now';
		seen = seenSnapshot();
		error = null;
		if (isRefresh) refreshing = true;
		else {
			chunks.stop();
			feedResult = cached ? withoutSeen(cached) : null;
			renderedCount = feedResult?.items.length ?? 0;
			loading = !cached || (showNews && !editorialNews.ready);
			epoch++;
		}
		try {
			// Данные и компоненты готовятся вместе: общая заглушка сразу сменяется готовой лентой.
			const [result] = await Promise.all([
				loadFeed(name, sorting, isRefresh),
				preloadThemeComponent(activeTheme.chain, 'Post'),
				preloadThemeComponent(activeTheme.chain, 'FeedTabs'),
				...(showNews ? [preloadThemeComponent(activeTheme.chain, 'EditorialNews'), editorialNews.loadInitial(isRefresh)] : [])
			]);
			// Скрытая лента (соседняя для свайпа) строит список в простое: сборка десятков карточек не должна совпасть с прокруткой
			if (!active) await new Promise((done) => ('requestIdleCallback' in window ? requestIdleCallback(done, { timeout: 300 }) : setTimeout(done)));
			if (id !== requestId) return;
			if (isRefresh && feedResult) {
				// Обновление: карточки с теми же id остаются на месте (список с ключами), создаются только новые. Пересборка всей ленты стоила кадров
				feedResult = withoutSeen(result);
				renderedCount = Math.min(renderedCount, feedResult.items.length);
				void chunks.run();
			} else if (!cached || (atTop() && !startsWith(cached, result))) {
				feedResult = withoutSeen(result);
				renderedCount = 0;
				epoch++;
				void chunks.run();
			}
		} catch (e: any) {
			// Показанный из кэша список остаётся, даже если обновить его не вышло
			if (id === requestId && !cached) error = e;
			console.error('Failed to load posts:', e);
		} finally {
			if (id === requestId) loading = refreshing = false;
			if (isRefresh) feed.refreshed();
			markFeedLoaded();
		}
	}

	/** Вернулись на сохранённую ленту: если она у верха и устарела, подтягиваем свежие посты, не трогая остальное */
	async function revalidate() {
		const shown = feedResult;
		if (!shown || loading || refreshing) return;
		if (name === 'popular' && sorting === 'now') {
			editorialNews.loadInitial();
		}
		const id = requestId;
		const result = await loadFeed(name, sorting).catch(() => undefined);
		const fresh = result && withoutSeen(result);
		if (fresh && id === requestId && feedResult === shown && atTop() && !startsWith(shown, fresh)) {
			feedResult = fresh;
			renderedCount = 0;
			epoch++;
			void chunks.run();
		}
	}

	function loadMore(): Promise<boolean> {
		if (chunks.pending) return chunks.pending;
		if (moreInFlight) return moreInFlight;
		if (loading || loadingMore || error || !feedResult || !hasMore(feedResult)) {
			return Promise.resolve(false);
		}
		const id = requestId;
		const run = (async () => {
			try {
				loadingMore = true;
				// ponytail: страницы целиком из прочитанного пропускаем, но не больше MAX_SKIPPED_PAGES подряд; потом ждём прокрутки
				for (let skipped = 0; ; skipped++) {
					const next = await api.getPosts({ pageName: name, sorting: sortingOf(name, sorting), cursors: feedResult!.cursors });
					if (id !== requestId || !feedResult) return false;
					const items = unseen(next.items);
					feedResult = { items: appendUnique(feedResult.items, items, postKey), cursors: next.cursors };
					if (items.length || skipped >= MAX_SKIPPED_PAGES || !hasMore(next)) break;
				}
				const promise = chunks.run();
				loadingMore = false;
				return await promise;
			} catch (e: any) {
				console.error('Failed to load more posts:', e);
				return false;
			} finally {
				loadingMore = false;
			}
		})().finally(() => {
			if (moreInFlight === run) moreInFlight = undefined;
		});
		moreInFlight = run;
		return run;
	}

	// Лента появилась или у неё сменилась сортировка: загружаем с начала
	$effect(() => {
		void sorting;
		untrack(() => {
			showSeen = false;
			loadInitial();
		});
	});

	// Вернулись на ленту: свежие посты, если она у верха
	let wasActive = untrack(() => active);
	$effect(() => {
		if (active && !wasActive) untrack(() => revalidate());
		wasActive = active;
	});

	// Клик по логотипу или жест на открытой ленте: обновить без сброса списка
	let handledRefresh = feed.refreshCount;
	$effect(() => {
		if (feed.refreshCount === handledRefresh) return;
		handledRefresh = feed.refreshCount;
		if (untrack(() => active)) untrack(() => loadInitial(true));
	});

	let showNotice = $derived(feedNotice.due && hasThemeComponent(activeTheme.chain, 'FeedNotice'));

	let loaderNode = $state<HTMLElement>();

	// Подгрузка вниз только у открытой ленты. Новый наблюдатель при возврате сразу сообщает, виден ли низ списка
	$effect(() => {
		if (!loaderNode || !active) return;
		return watchVisible(loaderNode, loadMore);
	});

	// Список, построенный в скрытой ленте, не анимируется: ленту на экран выводит страница или свайп
	const appearIfShown = (el: HTMLElement) => {
		if (untrack(() => active)) appear('feedIn')(el);
	};
</script>

<!-- Обновление жестом рисует сам жест: тогда список не притухает и своего индикатора нет -->
<div class={['feed', { 'feed--refreshing': refreshing && !feed.refreshQuiet }]}>
	{#if refreshing && !feed.refreshQuiet}
		<div class="refresh"><ThemeLoader componentName="Spinner" inline={true} /></div>
	{/if}

	{#if error}
		<NetworkErrorState {error} onretry={() => loadInitial()} />
	{:else}
		<Reveal ready={!loading} block>
			{#if feedResult}
				{#key epoch}
					<div class="list" {@attach appearIfShown}>
						<ThemeLoader
							componentName="FeedTabs"
							currentFeed={name}
							switchFeed={openFeedTab}
							{sorting}
							switchSorting={(next: FeedSorting) => openFeedTab(name, next)}
						/>
						{#if feedResult.items.length === 0 && !hasMore(feedResult)}
							{#if seen.size > 0 && settings.value.hideSeen && !showSeen}
								<div class="empty">
									Всё прочитано
									<button class="show-seen" onclick={() => { showSeen = true; loadInitial(); }}>Показать прочитанные</button>
								</div>
							{:else}
								<div class="empty">Нет постов</div>
							{/if}
						{:else}
							{#if name === 'popular' && sorting === 'now'}
								<ThemeLoader componentName="EditorialNews" />
							{/if}
							{#each renderedItems as post, i (post.sourceId + '_' + post.id)}
								{#if i === NOTICE_AFTER_POST && showNotice}
									<ThemeLoader componentName="FeedNotice" onlater={feedNotice.later} onnever={feedNotice.never} />
								{/if}
								<!-- Обёртка с наблюдателем нужна, только когда показ в ленте считается прочтением -->
								{#if tracksFeed()}
									<div {@attach (el) => (active ? trackInFeed(el, post) : undefined)}>
										<ThemeLoader componentName="Post" {post} />
									</div>
								{:else}
									<ThemeLoader componentName="Post" {post} />
								{/if}
							{/each}

							{#if hasMore(feedResult)}
								<div bind:this={loaderNode} class="infinite-loader">
									{#if loadingMore}
										<ThemeLoader componentName="Spinner" inline={true} />
									{/if}
								</div>
							{/if}
						{/if}
					</div>
				{/key}
			{/if}
		</Reveal>
	{/if}
</div>

<style>
	/* В темах с flex-раскладкой (dtf2022) иначе лента сжимается по контенту */
	.feed {
		position: relative;
		width: 100%;
	}
	/* Обновление по нажатию: старый список остаётся, но притухает, а сверху крутится индикатор */
	.list {
		width: 100%;
		transition: opacity 0.2s ease;
	}
	.feed--refreshing .list {
		opacity: 0.55;
	}
	.refresh {
		position: absolute;
		top: 8px;
		left: 50%;
		z-index: 5;
		translate: -50% 0;
		border-radius: 999px;
		background: var(--bg-card, #fff);
		color: var(--text-primary, inherit);
		border: 1px solid var(--border-subtle, transparent);
		box-shadow: var(--shadow-popup, 0 2px 12px rgba(0, 0, 0, 0.18));
		animation: refresh-in 0.25s cubic-bezier(0.165, 0.84, 0.44, 1) backwards;
		pointer-events: none;
	}
	@keyframes refresh-in {
		from {
			opacity: 0;
			translate: -50% -12px;
			scale: 0.8;
		}
	}
	.empty,
	.infinite-loader {
		text-align: center;
		padding: 40px;
		color: var(--text-muted, #666);
		font-size: 1.1em;
	}
	.show-seen {
		display: block;
		margin: 16px auto 0;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: var(--text-primary, inherit);
		text-decoration: underline;
		cursor: pointer;
	}
	.infinite-loader {
		padding: 20px;
		min-height: 50px;
		display: flex;
		justify-content: center;
	}
</style>
