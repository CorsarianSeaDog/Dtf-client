<script lang="ts">
	import type { Post } from '$lib/api/types';
	import PostsPage from './ui/PostsPage.svelte';

	/*
	 * Репосты записи: записи-ответы карточками ленты. Пометку «Репост» и вложенный оригинал не рисуем:
	 * страница и так про одну запись, и копия оригинала была бы в каждой карточке.
	 */
	let { posts }: { posts: Post[] } = $props();
</script>

<PostsPage title="Репосты" {posts} empty="Репостов пока нет" showRepost={false} />
