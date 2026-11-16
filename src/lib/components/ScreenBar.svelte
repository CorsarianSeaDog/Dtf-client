<script lang="ts">
	import ThemeLoader, { hasThemeComponent } from '$lib/themes/ThemeLoader.svelte';
	import { activeTheme } from '$lib/themes/index.svelte';
	import type { ThemeComponents } from '$lib/themes/contract';

	/* Панель экрана: рисуется, только если она есть у темы. Экраны ставят её первым элементом своего корня */
	let props: ThemeComponents['ScreenBar'] = $props();
</script>

{#if hasThemeComponent(activeTheme.chain, 'ScreenBar')}
	<ThemeLoader componentName="ScreenBar" {...props} />
{/if}
