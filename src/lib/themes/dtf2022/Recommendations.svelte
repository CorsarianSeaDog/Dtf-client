<script lang="ts">
	import { onDestroy } from 'svelte';
	import { api } from '$lib/api/index.svelte';
	import type { Post, RecommendationsCursor } from '$lib/api/types';
	import { postKey } from '$lib/api/utils';
	import PostItem from './Post.svelte';
	import { loadOnVisible } from './loadOnVisible';
	import { Button, Preloader } from './ui';
	import { settings } from '$lib/storage/settings.svelte';
	import { seenSnapshot, trackInFeed, tracksFeed } from '$lib/storage/seen.svelte';

	/*
	 * Лента рекомендаций под комментариями: у DTF это обычная бесконечная лента карточек без заголовка,
	 * в конце — «горизонт» с прелоадером, пока грузится следующая страница.
	 * Первая страница грузится, когда горизонт подъезжает к экрану: длинный пост пользователь может и не дочитать.
	 * В режиме «По кнопке» вместо горизонта стоит кнопка, дальше лента подгружается как обычно.
	 */
	let { postId }: { postId: number } = $props();

	let posts = $state.raw<Post[]>([]);
	let hasMore = $state(true);
	let cursor: RecommendationsCursor | undefined;
	let loading = $state(false);
	let requested = $state(settings.value.recommendations === 'auto');
	let readPosts: Set<string> | undefined;
	let destroyed = false;
	onDestroy(() => (destroyed = true));
	// svelte-ignore state_referenced_locally
	const listedIds = new Set<number>([postId]);

	async function load() {
		if (loading || !hasMore) return;
		loading = true;
		const read = (readPosts ??= seenSnapshot('recommendations'));
		try {
			// Если вся страница скрыта, сразу берём следующую: низ списка не сдвинулся
			while (hasMore) {
				const res = await api.getRecommendations(postId, cursor);
				if (destroyed) return;
				cursor = res.cursor;
				hasMore = !!cursor;
				const fresh: Post[] = [];
				for (const post of res.items) {
					if (listedIds.has(post.id) || read.has(postKey(post))) continue;
					listedIds.add(post.id);
					fresh.push(post);
				}
				if (!fresh.length) continue;
				posts = [...posts, ...fresh];
				return hasMore;
			}
		} catch (e) {
			if (destroyed) return;
			// Тихо перестаём подгружать: страница поста не страдает
			console.warn('Рекомендации не загрузились', e);
			hasMore = false;
		} finally {
			loading = false;
		}
	}
</script>

<div class="recommendations" data-seen-feed="recommendations">
	{#each posts as post (post.sourceId + '_' + post.id)}
		{#if tracksFeed('recommendations')}
			<div {@attach (el) => trackInFeed(el, post, 'recommendations')}>
				<PostItem {post} />
			</div>
		{:else}
			<PostItem {post} />
		{/if}
	{/each}

	{#if hasMore}
		{#if requested}
			<div class="recommendations__horizon" {@attach loadOnVisible(load)}>
				{#if loading}<Preloader />{/if}
			</div>
		{:else}
			<div class="recommendations__button">
				<Button variant="blue" label="Показать рекомендации" onclick={() => (requested = true)} />
			</div>
		{/if}
	{/if}
</div>

<style>
	/* Колонка текста поста; отступы между карточками (28px, на узком 20px) и сверху задаёт сама карточка ленты */
	.recommendations {
		width: 100%;
		max-width: var(--inner-content-width);
		margin: 0 auto;
		/* Снизу тот же отступ, что между карточками: кнопка и последняя карточка не прилипают к низу страницы */
		padding-bottom: 28px;
		/* Внутри карточек рекомендаций поля 16px на любой ширине, в обычной ленте — 20px */
		--island-offset-x: 16px;
	}

	.recommendations__horizon {
		display: flex;
		justify-content: center;
		padding: 25px 0;
		margin-top: 28px;
	}

	/* Островок как у карточек ленты, кнопка размером с .ui-button из DTF 2023 */
	.recommendations__button {
		--btn-height: 34px;
		--btn-font-size: 15px;
		--btn-offset: 20px;

		display: flex;
		justify-content: center;
		padding: 20px 0;
		margin-top: 28px;
		border-radius: 8px;
		background-color: var(--bg-card);
	}

	@media (max-width: 859px) {
		.recommendations {
			padding-bottom: 20px;
		}

		.recommendations__horizon,
		.recommendations__button {
			margin-top: 20px;
		}
	}

	@media (max-width: 639px) {
		.recommendations__button {
			padding: 16px 0;
			border-radius: 0;
		}
	}
</style>
