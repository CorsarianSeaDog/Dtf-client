<script lang="ts">
	import type { Comment, Post } from '$lib/api/types';
	import { openOverlay } from '$lib/navigation';
	import { authStorage } from '$lib/storage/auth.svelte';
	import NetworkErrorState from '$lib/components/NetworkErrorState.svelte';
	import type { BookmarksTab } from '../contract';
	import PostCard from './post/PostCard.svelte';
	import ProfileComment from './ProfileComment.svelte';
	import { isPostHidden } from './actions.svelte';
	import { loadOnVisible } from './loadOnVisible';
	import { Button, Preloader } from './ui';
	import SortingFilters from './ui/SortingFilters.svelte';

	/*
	 * Страница /bookmarks. В архиве DTF она есть только как «Ошибка 401» и её чанк не сохранился, поэтому собрана из того,
	 * что от неё осталось: над списком фильтр ленты (feed-sorting-filters, общий чанк закладок и ленты), записи —
	 * карточками ленты, комментарии — карточкой .profile_comment_favorite из main.css 2022 года.
	 */
	let {
		tab,
		onTabChange,
		posts,
		comments,
		loaded,
		loading,
		error,
		hasMore,
		loadMore,
		onretry,
		commentCard: CommentCard = ProfileComment
	}: {
		tab: BookmarksTab;
		onTabChange: (tab: BookmarksTab) => void;
		posts: Post[];
		comments: Comment[];
		loaded: boolean;
		loading: boolean;
		error: unknown;
		hasMore: boolean;
		loadMore: () => void;
		onretry: () => void;
		/** Карточка комментария: форк темы подставляет свою */
		commentCard?: typeof ProfileComment;
	} = $props();

	const TABS: { value: BookmarksTab; label: string }[] = [
		{ value: 'posts', label: 'Статьи' },
		{ value: 'comments', label: 'Комментарии' }
	];

	let empty = $derived(tab === 'posts' ? posts.length === 0 : comments.length === 0);
</script>

<div class="bookmarks-page">
	{#if !authStorage.isAuthenticated}
		<div class="bookmarks-empty">
			<p>Войдите, чтобы увидеть закладки</p>
			<Button label="Войти" onclick={() => openOverlay({ type: 'login' })} />
		</div>
	{:else}
		<SortingFilters items={TABS} selected={tab} label="Закладки" onselect={onTabChange} />

		{#if error && empty}
			<NetworkErrorState {error} title="Не удалось загрузить закладки" {onretry} />
		{:else}
			{#if tab === 'posts'}
				{#each posts as post (post.id)}
					{#if !isPostHidden(post)}
						<PostCard {post} />
					{/if}
				{/each}
			{:else}
				<div class={['bookmarks-comments', { 'bookmarks-comments--cards': CommentCard !== ProfileComment }]}>
					{#each comments as comment (comment.id)}
						<CommentCard {comment} />
					{/each}
				</div>
			{/if}

			{#if loaded && !loading && empty}
				<p class="bookmarks-empty">{tab === 'posts' ? 'В закладках нет статей' : 'В закладках нет комментариев'}</p>
			{/if}

			{#if hasMore}
				<div class="bookmarks-more" {@attach loadOnVisible(loadMore)}>
					{#if loading}<Preloader />{/if}
				</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.bookmarks-page {
		width: 100%;
		max-width: var(--content-width);
		padding-bottom: 16px;
		color: var(--text-primary);
	}

	.bookmarks-comments--cards {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.bookmarks-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 40px 20px;
		color: var(--text-muted);
		text-align: center;
	}

	.bookmarks-more {
		display: flex;
		justify-content: center;
		min-height: 40px;
		padding: 20px 0;
	}

	@media (max-width: 859px) {
		.bookmarks-comments--cards {
			gap: 12px;
		}
	}
</style>
