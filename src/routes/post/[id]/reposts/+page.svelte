<script lang="ts">
	import { page } from '$app/state';
	import RepostsContent from '$lib/components/RepostsContent.svelte';

	let postId = $derived(Number(page.params.id));
</script>

<svelte:head>
	<title>Репосты - reDTF</title>
</svelte:head>

{#key postId}
	<RepostsContent {postId} />
{/key}
