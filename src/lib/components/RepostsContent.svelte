<script lang="ts">
	import { api } from '$lib/api/index.svelte';
	import ThemeLoader from '$lib/themes/ThemeLoader.svelte';
	import PostListScreen from './PostListScreen.svelte';
	import ScreenBar from './ScreenBar.svelte';

	/* Репосты записи: записи-ответы на неё. Разметку рисует компонент темы RepostsPage. */
	let { postId }: { postId: number } = $props();
</script>

<PostListScreen source={postId} load={() => api.getReposts(postId)} component="RepostsPage" errorTitle="Не удалось загрузить репосты">
	{#snippet bar()}
		<ScreenBar screen="reposts" title="Репосты" />
	{/snippet}
	{#snippet children(posts)}
		<ThemeLoader componentName="RepostsPage" {posts} />
	{/snippet}
</PostListScreen>
