<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import type { Post } from '$lib/api/types';
	import { appendUnique, postKey } from '$lib/api/utils';
	import { preloadThemeComponent } from '$lib/themes/ThemeLoader.svelte';
	import { activeTheme } from '$lib/themes/index.svelte';
	import Reveal from './Reveal.svelte';
	import NetworkErrorState from './NetworkErrorState.svelte';

	/*
	 * Экран с одной страницей записей без подгрузки (тег, репосты). Грузит записи, держит ошибку и повтор,
	 * а панель экрана и компонент темы рисуют снаружи через сниппеты.
	 */
	let {
		source,
		load,
		component,
		errorTitle,
		bar,
		children
	}: {
		/** От чего зависит список: при смене запрос идёт заново */
		source: unknown;
		load: () => Promise<Post[]>;
		/** Компонент темы, который рисует список: его подгружают заранее, чтобы не было спиннера */
		component: string;
		errorTitle: string;
		bar: Snippet;
		children: Snippet<[Post[]]>;
	} = $props();

	let posts = $state.raw<Post[]>([]);
	let loading = $state(true);
	let error = $state<unknown>();
	// Номер запроса: ответ прежнего источника не должен перетереть новый
	let requestId = 0;

	async function run() {
		const id = ++requestId;
		loading = true;
		error = undefined;
		const componentReady = preloadThemeComponent(activeTheme.chain, component);
		try {
			const result = await load();
			if (id === requestId) posts = appendUnique([], result, postKey);
		} catch (e) {
			if (id === requestId) error = e;
		} finally {
			if (id === requestId) {
				if (!error) await componentReady;
				if (id === requestId) loading = false;
			}
		}
	}

	$effect(() => {
		void source;
		untrack(run);
	});
</script>

<div class="post-list-screen">
	{@render bar()}
	<Reveal ready={!loading} anim="contentIn">
		{#if error}
			<NetworkErrorState {error} title={errorTitle} onretry={run} />
		{:else}
			{@render children(posts)}
		{/if}
	</Reveal>
</div>

<style>
	.post-list-screen {
		width: 100%;
	}
</style>
