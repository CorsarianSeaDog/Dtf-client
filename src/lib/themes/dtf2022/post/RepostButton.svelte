<script lang="ts">
	import type { Post } from '$lib/api/types';
	import { openOverlay } from '$lib/navigation';
	import PostButton from './PostButton.svelte';
	import { repostPost } from '../actions.svelte';

	/* Кнопка репоста. Число открывает страницу репостов записи: записи-ответы карточками ленты. */
	let { post, iconSize }: { post: Post; iconSize?: number } = $props();
</script>

<PostButton
	kind="repost"
	title="Сделать репост"
	{iconSize}
	value={post.repostsCount}
	onclick={() => repostPost(post)}
	onvalueclick={() => openOverlay({ type: 'reposts', data: { postId: post.id } })}
/>
