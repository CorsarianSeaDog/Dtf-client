<script module lang="ts">
	import type { Comment, Post } from '$lib/api/types';
	import type { BookmarkItem } from '$lib/themes/contract';

	const timestampOf = (iso: string) => Date.parse(iso) || 0;

	/** Добавляет ещё не показанные посты и комментарии, сортируя новую пачку от свежих к старым без сдвига уже показанных */
	export function appendNewBookmarks(existing: BookmarkItem[], posts: Post[], comments: Comment[]): BookmarkItem[] {
		const seenPosts = new Set<number>();
		const seenComments = new Set<number>();
		for (const entry of existing) {
			if (entry.kind === 'post') seenPosts.add(entry.item.id);
			else seenComments.add(entry.item.id);
		}
		const added: BookmarkItem[] = [];
		for (const item of posts) if (!seenPosts.has(item.id)) added.push({ kind: 'post', item });
		for (const item of comments) if (!seenComments.has(item.id)) added.push({ kind: 'comment', item });
		if (added.length === 0) return existing;
		added.sort((a, b) => timestampOf(b.item.createdAt) - timestampOf(a.item.createdAt));
		return existing.length === 0 ? added : [...existing, ...added];
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { api } from '$lib/api/index.svelte';
	import { authStorage } from '$lib/storage/auth.svelte';
	import { appendUnique, postKey } from '$lib/api/utils';
	import ThemeLoader, { isThemeComponentLoaded, preloadThemeComponent } from '$lib/themes/ThemeLoader.svelte';
	import type { BookmarksTab } from '$lib/themes/contract';
	import { activeTheme } from '$lib/themes/index.svelte';
	import Reveal from './Reveal.svelte';
	import ScreenBar from './ScreenBar.svelte';

	/*
	 * Закладки вошедшего пользователя: записи постранично по смещению, комментарии — от даты последнего.
	 * По умолчанию открыта общая лента «Все» из обоих потоков; переключение на «Статьи» и «Комментарии» использует уже загруженные данные.
	 */
	const POSTS_PAGE = 20;

	type Stream = 'posts' | 'comments';
	type StreamState = { loaded: boolean; loading: boolean; error: unknown; hasMore: boolean };
	const fresh = (): StreamState => ({ loaded: false, loading: false, error: undefined, hasMore: true });

	let tab = $state<BookmarksTab>('all');
	let posts = $state.raw<Post[]>([]);
	// Глубокое состояние: карточка комментария темы ставит и снимает закладку прямо на объекте
	let comments = $state<Comment[]>([]);
	let items = $state.raw<BookmarkItem[]>([]);
	let commentsFrom: number | undefined;
	let streams = $state<Record<Stream, StreamState>>({ posts: fresh(), comments: fresh() });
	let shown = $state(false);
	let generation = 0;

	let loaded = $derived(tab === 'all' ? streams.posts.loaded && streams.comments.loaded : streams[tab].loaded);
	let loading = $derived(tab === 'all' ? streams.posts.loading || streams.comments.loading : streams[tab].loading);
	let error = $derived(tab === 'all' ? (streams.posts.error ?? streams.comments.error) : streams[tab].error);
	let hasMore = $derived(tab === 'all' ? streams.posts.hasMore || streams.comments.hasMore : streams[tab].hasMore);

	async function loadStream(which: Stream, more: boolean, gen: number): Promise<number> {
		const state = streams[which];
		if (state.loading || (more && !state.hasMore)) return 0;
		state.loading = true;
		state.error = undefined;
		try {
			if (which === 'posts') {
				const page = await api.getBookmarkedPosts(more ? posts.length : 0);
				if (gen !== generation) return 0;
				const prev = more ? posts : [];
				posts = appendUnique(prev, page, postKey);
				state.hasMore = page.length >= POSTS_PAGE;
				return posts.length - prev.length;
			}
			const page = await api.getBookmarkedComments(more ? commentsFrom : undefined);
			if (gen !== generation) return 0;
			const prev = more ? comments : [];
			comments = appendUnique(prev, page.items, (comment) => comment.id);
			commentsFrom = page.lastSortingValue;
			state.hasMore = commentsFrom !== undefined;
			return comments.length - prev.length;
		} catch (e) {
			if (gen === generation) state.error = e;
			return 0;
		} finally {
			if (gen === generation) {
				state.loaded = true;
				state.loading = false;
			}
		}
	}

	async function load(which: BookmarksTab, more = false): Promise<boolean> {
		const gen = generation;
		const componentReady = !shown ? preloadThemeComponent(activeTheme.chain, 'BookmarksPage') : null;
		let added = 0;
		try {
			if (which === 'all') {
				const targets: Stream[] = more
					? (['posts', 'comments'] as const).filter((s) => streams[s].hasMore)
					: (['posts', 'comments'] as const).filter((s) => !streams[s].loaded || streams[s].error);
				const counts = await Promise.all(targets.map((s) => loadStream(s, more, gen)));
				added = counts.reduce((sum, n) => sum + n, 0);
			} else {
				added = await loadStream(which, more, gen);
			}
			if (gen === generation) items = appendNewBookmarks(items, posts, comments);
		} finally {
			if (componentReady) await componentReady;
			if (gen === generation) shown = true;
		}
		return added > 0;
	}

	function switchTab(next: BookmarksTab) {
		tab = next;
		if (next === 'all') {
			items = appendNewBookmarks(items, posts, comments);
			if (!streams.posts.loaded || !streams.comments.loaded) load('all');
		} else if (!streams[next].loaded) {
			load(next);
		}
	}

	// Без входа закладок нет: после входа или выхода списки начинаются заново
	$effect(() => {
		const signedIn = authStorage.isAuthenticated;
		untrack(() => {
			generation++;
			posts = [];
			comments = [];
			items = [];
			commentsFrom = undefined;
			streams = { posts: fresh(), comments: fresh() };
			if (signedIn) return void load(tab);
			streams.posts.loaded = true;
			streams.comments.loaded = true;
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
			{items}
			{posts}
			{comments}
			{loaded}
			{loading}
			{error}
			{hasMore}
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
