<script lang="ts">
	import { page } from '$app/state';
	import NotificationsContent from '$lib/components/NotificationsContent.svelte';

	const isActive = $derived(!page.state.overlays?.some((o) => o.presentation === 'page'));
</script>

<svelte:head>
	<title>reDTF - Уведомления</title>
</svelte:head>

<NotificationsContent active={isActive} />
