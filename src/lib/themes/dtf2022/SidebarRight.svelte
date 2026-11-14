<script lang="ts">
	import { untrack } from 'svelte';
	import { liveFeed } from './live/live.svelte';
	import LiveColumn from './live/LiveColumn.svelte';
	import { connectLive } from './live/source';
	import { themeSettings } from './themeSettings.svelte';

	let on = $derived(themeSettings.liveEnabled);

	// Источник событий включается вместе с колонкой и закрывается при выключении (см. live/source.ts).
	// Запись в поток идёт из источника, а не из эффекта; стартовую пачку кладём вне подписки.
	$effect(() => {
		if (!on) return;
		const stop = untrack(() => connectLive((events) => liveFeed.push(events)));
		return () => {
			stop();
			liveFeed.clear();
		};
	});
</script>

<aside class="sidebar-right">
	{#if on}
		<LiveColumn />
	{/if}
</aside>

<style>
	.sidebar-right {
		width: var(--sidebar-right-width);
		justify-self: end;
	}

	@media (max-width: 1179px) {
		.sidebar-right {
			display: none;
		}
	}
</style>
