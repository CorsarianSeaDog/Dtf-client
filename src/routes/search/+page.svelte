<script lang="ts">
	import { page } from '$app/state';
	import SearchContent from '$lib/components/SearchContent.svelte';

	// Пока поверх /search открыт оверлей, адрес принадлежит оверлею — сохраняем текущий поисковый запрос
	let currentQuery = '';
	let query = $derived.by(() => {
		if (page.state.overlays?.length) return currentQuery;
		const q = page.url.searchParams.get('q')?.trim() ?? '';
		currentQuery = q;
		return q;
	});
</script>

<svelte:head>
	<title>{query ? `${query} - ` : ''}Поиск - reDTF</title>
</svelte:head>

{#if query}
	<SearchContent {query} />
{/if}
