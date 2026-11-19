<script lang="ts">
	import type { Comment, Post } from '$lib/api/types';
	import { openOverlay } from '$lib/navigation';
	import { authStorage } from '$lib/storage/auth.svelte';
	import NetworkErrorState from '$lib/components/NetworkErrorState.svelte';
	import type { BookmarkItem, BookmarksTab } from '../contract';
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
		items,
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
		items: BookmarkItem[];
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
		{ value: 'all', label: 'Все' },
		{ value: 'posts', label: 'Статьи' },
		{ value: 'comments', label: 'Комментарии' }
	];

	const EMPTY_TEXT: Record<BookmarksTab, string> = {
		all: 'В закладках ничего нет',
		posts: 'В закладках нет статей',
		comments: 'В закладках нет комментариев'
	};

	let empty = $derived(tab === 'all' ? items.length === 0 : tab === 'posts' ? posts.length === 0 : comments.length === 0);
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
			{#if tab === 'all'}
				{#if items.length > 0}
					<div class={['bookmarks-all', { 'bookmarks-all--cards': CommentCard !== ProfileComment }]}>
						{#each items as entry (entry.kind === 'post' ? `p:${entry.item.id}` : `c:${entry.item.id}`)}
							{#if entry.kind === 'post'}
								{#if !isPostHidden(entry.item)}
									<PostCard post={entry.item} />
								{/if}
							{:else}
								<CommentCard comment={entry.item} />
							{/if}
						{/each}
					</div>
				{/if}
			{:else if tab === 'posts'}
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
				<p class="bookmarks-empty">{EMPTY_TEXT[tab]}</p>
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

	.bookmarks-all {
		display: flex;
		flex-direction: column;
		gap: 28px;
	}

	.bookmarks-all--cards {
		gap: 16px;
	}

	.bookmarks-all > :global(.feed-item),
	.bookmarks-all > :global(.profile-comment) {
		margin: 0;
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
		.bookmarks-all {
			gap: 20px;
		}

		.bookmarks-all--cards,
		.bookmarks-comments--cards {
			gap: 12px;
		}
	}
</style>
