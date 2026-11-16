<script lang="ts">
	import { untrack } from 'svelte';
	import { api } from '$lib/api/index.svelte';
	import { authStorage } from '$lib/storage/auth.svelte';
	import type { Post } from '$lib/api/types';
	import { appendUnique, postKey } from '$lib/api/utils';
	import { openOverlay } from '$lib/navigation';
	import ThemeLoader, { isThemeComponentLoaded, preloadThemeComponent } from '$lib/themes/ThemeLoader.svelte';
	import { activeTheme } from '$lib/themes/index.svelte';
	import Reveal from './Reveal.svelte';

	/*
	 * Черновики вошедшего пользователя: постранично по смещению; редактируются в редакторе, смотрятся как обычный пост.
	 * Разметку рисует компонент темы DraftsPage.
	 */
	const PAGE_SIZE = 20;

	let posts = $state.raw<Post[]>([]);
	let hasMore = $state(true);
	let loaded = $state(false);
	let loading = $state(false);
	let error = $state<unknown>();
	let shown = $state(false);

	async function load(more = false) {
		if (loading || (more && !hasMore)) return;
		loading = true;
		error = undefined;
		const componentReady = !shown ? preloadThemeComponent(activeTheme.chain, 'DraftsPage') : null;
		try {
			const page = await api.getDrafts(more ? posts.length : 0);
			posts = appendUnique(more ? posts : [], page, postKey);
			hasMore = page.length >= PAGE_SIZE;
		} catch (e) {
			error = e;
		} finally {
			loaded = true;
			loading = false;
			if (componentReady) await componentReady;
			shown = true;
		}
	}

	// Без входа черновиков нет: после входа или выхода список загружается заново
	$effect(() => {
		if (authStorage.isAuthenticated) untrack(() => load());
		else {
			posts = [];
			loaded = true;
			if (shown) return;
			if (isThemeComponentLoaded(activeTheme.chain, 'DraftsPage')) {
				shown = true;
			} else {
				preloadThemeComponent(activeTheme.chain, 'DraftsPage').then(() => {
					if (!authStorage.isAuthenticated) shown = true;
				});
			}
		}
	});
</script>

<div class="drafts-screen">
	<Reveal ready={shown} anim="contentIn">
		<ThemeLoader
			componentName="DraftsPage"
			{posts}
			{loaded}
			{loading}
			{error}
			{hasMore}
			loadMore={() => load(true)}
			onretry={() => load()}
			onedit={(post: Post) => openOverlay({ type: 'editor', data: { postId: post.id } })}
			ondelete={async (post: Post) => {
				await api.deletePost(post.id);
				posts = posts.filter((p) => p.id !== post.id);
			}}
		/>
	</Reveal>
</div>

<style>
	.drafts-screen {
		width: 100%;
	}
</style>
