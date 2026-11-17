<script lang="ts">
	import type { Block, Post } from '$lib/api/types';
	import PostBlocks from '../dtf2022/post/PostBlocks.svelte';
	import PostCard from '../dtf2022/post/PostCard.svelte';

	/*
	 * Предпросмотр записи: тот же PostBlocks, что рисует страницу поста, на тех же блоках,
	 * которые уйдут на сервер (mapper.ts). Только заголовок и блоки: шапка, оценки и комментарии
	 * появятся у записи после публикации. Сети не трогает: у опроса нет postId, он не грузит результаты.
	 */
	let { title, blocks, repost }: { title: string; blocks: Block[]; repost?: Post } = $props();

	// Экран редактора прячет своё тело по этой метке (theme.css). Метка, а не класс: класс экрана Svelte перезаписывает целиком
	const markScreen = (node: HTMLElement) => {
		const screen = node.closest('.writing');
		screen?.setAttribute('data-preview', '');
		return () => screen?.removeAttribute('data-preview');
	};
</script>

<div class="editor-preview" {@attach markScreen}>
	<div class="editor-preview__column">
		<PostBlocks {title} {blocks} variant="page" />

		{#if repost}
			<PostCard post={repost} embed subscribe={false} />
		{/if}

		{#if !title.trim() && !blocks.length && !repost}
			<p class="editor-preview__empty">Пока нечего показывать</p>
		{/if}
	</div>
</div>

<style>
	/* Как .post-page и .post-container страницы поста: колонка текста по центру, container-type нужен медиа на всю ширину (100cqw) */
	.editor-preview {
		width: 100%;
		max-width: var(--content-width);
		margin: 0 auto;
		padding: 24px 0 calc(120px + env(safe-area-inset-bottom, 0px));
		box-sizing: border-box;
		container-type: inline-size;
		font-size: 17px;
		line-height: 26px;
		overflow-wrap: break-word;
	}

	.editor-preview__column {
		width: 100%;
		max-width: min(var(--inner-content-width), calc(100% - 2 * var(--text-gap, 0px)));
		margin: 0 auto;
	}

	.editor-preview__empty {
		margin: 0;
		color: var(--text-placeholder);
		text-align: center;
	}
</style>
