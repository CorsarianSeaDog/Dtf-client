<script lang="ts">
	import type { Post } from '$lib/api/types';
	import { tagMenuItems, tagTitle, toggleIgnoredTag } from './actions.svelte';
	import Popover from './ui/Popover.svelte';
	import PostsPage from './ui/PostsPage.svelte';

	/*
	 * Страница тега: заголовок с названием (первая буква заглавная, как у DTF) и записи.
	 * У DTF под заголовком полоса «Все / Лучшие», а в заголовке меню «⋯» («Не показывать тег»). Полосы нет: API отдаёт тег
	 * одним списком без «Лучших», и одна «Все» ничего бы не делала. Метода скрытия тега в записях нет, поэтому «Не показывать
	 * тег» кладёт его в локальный чёрный список (он работает и без входа).
	 */
	let { tag, posts }: { tag: string; posts: Post[] } = $props();

	let title = $derived(tagTitle(tag));
	let menuOpen = $state(false);
</script>

<PostsPage title="#{title}" {posts} empty="Записей с таким тегом нет">
	{#snippet actions()}
		<Popover
			bind:open={menuOpen}
			items={tagMenuItems(tag)}
			onselect={() => toggleIgnoredTag(tag)}
			width="max-content"
			label="Действия с тегом"
		>
			<button type="button" class="tag-etc" title="Больше" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
				<svg class="icon" width="16" height="20" aria-hidden="true">
					<use href="#v_etc"></use>
				</svg>
			</button>
		</Popover>
	{/snippet}
</PostsPage>

<style>
	/* Как .etc_control у DTF: серая, при открытом меню чёрная */
	.tag-etc {
		position: relative;
		display: flex;
		align-items: center;
		margin-left: 14px;
		color: var(--text-muted);
		cursor: pointer;
	}

	.tag-etc::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 32px;
		height: 32px;
		transform: translate(-50%, -50%);
	}

	@media (pointer: coarse), (max-width: 859px) {
		.tag-etc::after {
			width: 44px;
			height: 44px;
		}
	}

	.tag-etc[aria-expanded='true'] {
		color: var(--text-primary);
	}
</style>
