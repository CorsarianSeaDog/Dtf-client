<script lang="ts">
	import { api } from '$lib/api/index.svelte';
	import ThemeLoader from '$lib/themes/ThemeLoader.svelte';
	import PostListScreen from './PostListScreen.svelte';
	import ScreenBar from './ScreenBar.svelte';

	/* Записи с тегом. Разметку рисует компонент темы TagPage. */
	let { tag }: { tag: string } = $props();
</script>

<PostListScreen source={tag} load={() => api.getTagPosts(tag)} component="TagPage" errorTitle="Не удалось загрузить записи">
	{#snippet bar()}
		<ScreenBar screen="tag" {tag} />
	{/snippet}
	{#snippet children(posts)}
		<ThemeLoader componentName="TagPage" {tag} {posts} />
	{/snippet}
</PostListScreen>
