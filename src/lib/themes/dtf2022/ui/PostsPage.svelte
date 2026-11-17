<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Post } from '$lib/api/types';
	import PostCard from '../post/PostCard.svelte';
	import { isPostHidden } from '../actions.svelte';

	/*
	 * Страница-список записей без подгрузки (тег, репосты): заголовок с необязательными действиями, карточки ленты
	 * и пустое состояние. Заголовок у DTF — белая плашка с названием крупно.
	 */
	let {
		title,
		posts,
		empty,
		showRepost = true,
		actions
	}: {
		title: string;
		posts: Post[];
		/** Что написать, когда записей нет */
		empty: string;
		/** Пометка «Репост» и вложенный оригинал в карточках */
		showRepost?: boolean;
		/** Справа от заголовка (меню «⋯») */
		actions?: Snippet;
	} = $props();
</script>

<div class="posts-page">
	<div class="page-head">
		<h1 class="page-head__title">{title}</h1>
		{@render actions?.()}
	</div>

	<!-- Отступ между заголовком и первой записью тот же, что между записями ленты -->
	{#each posts as post (post.sourceId + '_' + post.id)}
		{#if !isPostHidden(post)}
			<PostCard {post} {showRepost} />
		{/if}
	{/each}

	{#if posts.length === 0}
		<p class="posts-page__empty">{empty}</p>
	{/if}
</div>

<style>
	.posts-page {
		width: 100%;
		max-width: var(--content-width);
		/* Отступ страницы у DTF: 16px сверху на широком экране, снизу под последним постом */
		padding: 16px 0;
	}

	.page-head {
		display: flex;
		align-items: center;
		box-sizing: border-box;
		padding: 20px;
		border-radius: 8px;
		background: var(--bg-card);
		color: var(--text-primary);
	}

	/* Строка выше шрифта: у overflow обрезаются выносные элементы букв («р», «у», «д») */
	.page-head__title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		margin: 0;
		font-size: 30px;
		font-weight: 600;
		line-height: 38px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.posts-page__empty {
		margin-top: 28px;
		padding: 40px 20px;
		color: var(--text-muted);
		text-align: center;
	}

	@media (max-width: 859px) {
		.posts-page {
			padding: 0 0 16px;
		}

		/* На узком экране записи ленты во всю ширину и без скруглений, заголовок так же */
		.page-head {
			border-radius: 0;
		}

		.posts-page__empty {
			margin-top: 20px;
		}
	}

	@media (max-width: 639px) {
		.page-head {
			padding: 18px 16px;
		}
	}
</style>
