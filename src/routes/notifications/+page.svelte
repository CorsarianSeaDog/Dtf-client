<script lang="ts">
	import { page } from '$app/state';
	import ThemeLoader from '$lib/themes/ThemeLoader.svelte';

	const isActive = $derived(!page.state.overlays?.some((o) => o.presentation === 'page'));
</script>

<svelte:head>
	<title>reDTF - Уведомления</title>
</svelte:head>

<ThemeLoader componentName="Notifications" active={isActive} />
