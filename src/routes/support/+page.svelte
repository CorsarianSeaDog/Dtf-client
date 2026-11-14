<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { openOverlay } from '$lib/navigation';

	// Окно поддержки — оверлей поверх ленты. По прямой ссылке /support сначала открываем ленту, потом окно
	onMount(async () => {
		await goto(resolve('/'), { replace: true });
		openOverlay({ type: 'support' });
	});
</script>
