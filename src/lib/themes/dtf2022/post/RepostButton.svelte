<script lang="ts">
	import type { Post } from '$lib/api/types';
	import { api } from '$lib/api/index.svelte';
	import { openOverlay } from '$lib/navigation';
	import Popover from '../ui/Popover.svelte';
	import PostButton from './PostButton.svelte';
	import { repostPost } from '../actions.svelte';
	import { themeSettings } from '../themeSettings.svelte';

	/*
	 * Кнопка репоста. Число открывает репосты записи: страницу с записями-ответами или, по настройке темы,
	 * короткий список под кнопкой (у DTF 2022–23 это был поповер у счётчика: аватар и название подсайта).
	 */
	let { post, iconSize, open = $bindable(false) }: { post: Post; iconSize?: number; open?: boolean } = $props();

	let reposts = $state<Post[]>();
	let error = $state('');
	// Номер запроса: при быстром «открыть, закрыть, открыть» ответ прежнего не должен перетереть новый
	let requestId = 0;

	let items = $derived(
		(reposts ?? []).map((repost) => {
			const place = repost.subsite && repost.subsite.id !== repost.author.id ? repost.subsite : undefined;
			return { value: repost.id, label: repost.author.name, image: repost.author.avatarUrl ?? '', details: place?.name };
		})
	);

	function toggleList() {
		open = !open;
		if (!open) return;
		error = '';
		const id = ++requestId;
		api.getReposts(post.id)
			.then((list) => id === requestId && (reposts = list))
			.catch((e) => id === requestId && (error = e.message));
	}

	function openRepost(id: number, event: MouseEvent | KeyboardEvent) {
		openOverlay({ type: 'post', data: { postId: id, sourceId: post.sourceId } }, event.currentTarget);
	}
</script>

{#snippet button(onvalueclick: () => void)}
	<PostButton kind="repost" title="Сделать репост" {iconSize} value={post.repostsCount} onclick={() => repostPost(post)} {onvalueclick} />
{/snippet}

{#if themeSettings.repostsView === 'list'}
	<Popover bind:open {items} width={240} align="center" label="Репосты" empty={error || (reposts ? 'Репостов пока нет' : 'Загрузка…')} onselect={openRepost}>
		{@render button(toggleList)}
	</Popover>
{:else}
	{@render button(() => openOverlay({ type: 'reposts', data: { postId: post.id } }))}
{/if}
