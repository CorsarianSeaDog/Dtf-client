<script lang="ts">
	import type { Post } from '$lib/api/types';
	import { openOverlay } from '$lib/navigation';
	import { authStorage } from '$lib/storage/auth.svelte';
	import NetworkErrorState from '$lib/components/NetworkErrorState.svelte';
	import PostCard from './post/PostCard.svelte';
	import { loadOnVisible } from './loadOnVisible';
	import { Button, Preloader } from './ui';

	/*
	 * Страница черновиков. У DTF она открывается по /u/me/drafts, в архиве 2023 года её нет (нужен вход),
	 * поэтому черновики рисуются карточками ленты. Сами карточки неактивны (оценки, закладки и меню сервер
	 * на черновике не принимает), а открыть черновик можно кнопками под ним: «Смотреть» и «Редактировать».
	 */
	let {
		posts,
		loaded,
		loading,
		error,
		hasMore,
		loadMore,
		onretry,
		onedit
	}: {
		posts: Post[];
		loaded: boolean;
		loading: boolean;
		error: unknown;
		hasMore: boolean;
		loadMore: () => void;
		onretry: () => void;
		onedit: (post: Post) => void;
	} = $props();
</script>

<div class="drafts-page">
	{#if !authStorage.isAuthenticated}
		<div class="drafts-empty">
			<p>Войдите, чтобы увидеть черновики</p>
			<Button label="Войти" onclick={() => openOverlay({ type: 'login' })} />
		</div>
	{:else if error && posts.length === 0}
		<NetworkErrorState {error} title="Не удалось загрузить черновики" {onretry} />
	{:else}
		{#each posts as post (post.id)}
			<PostCard {post} {onedit} />
		{/each}

		{#if loaded && posts.length === 0}
			<p class="drafts-empty">Черновиков нет</p>
		{/if}

		{#if hasMore}
			<div class="drafts-more" {@attach loadOnVisible(loadMore)}>
				{#if loading}<Preloader />{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.drafts-page {
		width: 100%;
		max-width: var(--content-width);
		padding: 16px 0;
		color: var(--text-primary);
	}

	/* Над первой карточкой отступа нет: заголовка у страницы нет */
	.drafts-page :global(.feed-item:first-child) {
		margin-top: 0;
	}

	.drafts-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 40px 20px;
		color: var(--text-muted);
		text-align: center;
	}

	.drafts-more {
		display: flex;
		justify-content: center;
		min-height: 40px;
		padding: 20px 0;
	}

	@media (max-width: 859px) {
		.drafts-page {
			padding: 0 0 16px;
		}
	}
</style>
