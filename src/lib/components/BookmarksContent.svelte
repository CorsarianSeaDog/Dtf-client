<script lang="ts">
	import { untrack } from 'svelte';
	import { api } from '$lib/api/index.svelte';
	import { authStorage } from '$lib/storage/auth.svelte';
	import type { Comment, Post } from '$lib/api/types';
	import { appendUnique, postKey } from '$lib/api/utils';
	import ThemeLoader, { isThemeComponentLoaded, preloadThemeComponent } from '$lib/themes/ThemeLoader.svelte';
	import type { BookmarksTab } from '$lib/themes/contract';
	import { activeTheme } from '$lib/themes/index.svelte';
	import Reveal from './Reveal.svelte';
	import ScreenBar from './ScreenBar.svelte';

	/*
	 * Закладки вошедшего пользователя: записи постранично по смещению, комментарии — от даты последнего.
	 * Вкладки грузятся независимо, каждая при первом переходе на неё. Разметку рисует компонент темы BookmarksPage.
	 */
	const POSTS_PAGE = 20;

	type TabState = { loaded: boolean; loading: boolean; error: unknown; hasMore: boolean };
	const fresh = (): TabState => ({ loaded: false, loading: false, error: undefined, hasMore: true });

	let tab = $state<BookmarksTab>('posts');
	let posts = $state.raw<Post[]>([]);
	// Глубокое состояние: карточка комментария темы ставит и снимает закладку прямо на объекте
	let comments = $state<Comment[]>([]);
	let commentsFrom: number | undefined;
	let tabs = $state<Record<BookmarksTab, TabState>>({ posts: fresh(), comments: fresh() });
	let shown = $state(false);
	let current = $derived(tabs[tab]);

	async function load(which: BookmarksTab, more = false) {
		const state = tabs[which];
		if (state.loading || (more && !state.hasMore)) return;
		state.loading = true;
		state.error = undefined;
		const componentReady = !shown ? preloadThemeComponent(activeTheme.chain, 'BookmarksPage') : null;
		try {
			if (which === 'posts') {
				const page = await api.getBookmarkedPosts(more ? posts.length : 0);
				posts = appendUnique(more ? posts : [], page, postKey);
				state.hasMore = page.length >= POSTS_PAGE;
			} else {
				const page = await api.getBookmarkedComments(more ? commentsFrom : undefined);
				comments = appendUnique(more ? comments : [], page.items, (comment) => comment.id);
				commentsFrom = page.lastSortingValue;
				state.hasMore = commentsFrom !== undefined;
			}
		} catch (e) {
			state.error = e;
		} finally {
			state.loaded = true;
			state.loading = false;
			if (componentReady) await componentReady;
			shown = true;
		}
	}

	function switchTab(next: BookmarksTab) {
		tab = next;
		if (!tabs[next].loaded) load(next);
	}

	// Без входа закладок нет: после входа или выхода списки начинаются заново
	$effect(() => {
		const signedIn = authStorage.isAuthenticated;
		untrack(() => {
			posts = [];
			comments = [];
			commentsFrom = undefined;
			tabs = { posts: fresh(), comments: fresh() };
			if (signedIn) return load(tab);
			tabs[tab].loaded = true;
			if (shown) return;
			if (isThemeComponentLoaded(activeTheme.chain, 'BookmarksPage')) shown = true;
			else preloadThemeComponent(activeTheme.chain, 'BookmarksPage').then(() => (shown = true));
		});
	});
</script>

<div class="bookmarks-screen">
	<ScreenBar screen="bookmarks" title="Закладки" />
	<Reveal ready={shown} anim="contentIn">
		<ThemeLoader
			componentName="BookmarksPage"
			{tab}
			onTabChange={switchTab}
			{posts}
			{comments}
			loaded={current.loaded}
			loading={current.loading}
			error={current.error}
			hasMore={current.hasMore}
			loadMore={() => load(tab, true)}
			onretry={() => load(tab)}
		/>
	</Reveal>
</div>

<style>
	.bookmarks-screen {
		width: 100%;
	}
</style>
