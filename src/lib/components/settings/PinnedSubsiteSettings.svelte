<script lang="ts">
	import { onDestroy } from 'svelte';
	import { api } from '$lib/api/index.svelte';
	import { appendUnique } from '$lib/api/utils';
	import { SEARCH_DEBOUNCE, SEARCH_MIN_LENGTH, searchableQuery } from '$lib/search';
	import {
		PINNED_SUBSITES_LIMIT,
		STANDARD_SUBSITES,
		pinnedSubsites,
		pinSubsite,
		unpinSubsite,
		type PinnedSubsite
	} from '$lib/storage/pinnedSubsites.svelte';
	import { normalizeSearchText } from './settingsSearch';
	import SettingsButton from './SettingsButton.svelte';
	import SettingsGroup from './SettingsGroup.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import SettingsSegmented from './SettingsSegmented.svelte';
	import SettingsSwitch from './SettingsSwitch.svelte';

	type SearchScope = 'topics' | 'blogs';
	type SearchState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; items: PinnedSubsite[] };

	const scopes: { value: SearchScope; title: string }[] = [
		{ value: 'topics', title: 'Темы' },
		{ value: 'blogs', title: 'Блоги' }
	];
	let query = $state('');
	let scope = $state<SearchScope>('topics');
	let topics = $state.raw<SearchState | null>(null);
	let blogs = $state.raw<SearchState | null>(null);
	let lastBlogQuery = '';
	let blogTimer: ReturnType<typeof setTimeout> | undefined;
	let needle = $derived(normalizeSearchText(query));
	let search = $derived(scope === 'topics' ? (needle || topics?.status === 'error' ? topics : null) : blogs);
	let items = $derived(pinnedSubsites.value.items);
	let atLimit = $derived(items.length >= PINNED_SUBSITES_LIMIT);
	let pinnedIds = $derived(new Set(items.map((item) => item.id)));
	let available = $derived(STANDARD_SUBSITES.filter((item) => !pinnedIds.has(item.id)));
	let matches = $derived(search?.status === 'done'
		? search.items.filter((item) => scope === 'blogs' || normalizeSearchText(item.name).includes(needle))
		: []);
	let results = $derived(matches.filter((item) => !pinnedIds.has(item.id)));

	onDestroy(() => clearTimeout(blogTimer));

	async function loadTopics(force = false) {
		if (!force && (topics?.status === 'loading' || topics?.status === 'done')) return;
		topics = { status: 'loading' };
		try {
			const items = await api.getTopics();
			topics = { status: 'done', items: appendUnique([], items, (item) => item.id) };
		} catch (error) {
			topics = { status: 'error', message: error instanceof Error ? error.message : 'Не удалось загрузить темы DTF.' };
		}
	}

	function scheduleBlogSearch(force = false) {
		clearTimeout(blogTimer);
		const text = searchableQuery(query);
		if (scope !== 'blogs' || !text) {
			lastBlogQuery = '';
			blogs = null;
			return;
		}
		if (!force && text === lastBlogQuery && blogs && blogs.status !== 'error') return;
		lastBlogQuery = text;

		const pending = { status: 'loading' } as const;
		blogs = pending;
		const run = async () => {
			try {
				const { items } = await api.searchSubsites(text, false);
				if (blogs === pending) blogs = { status: 'done', items: appendUnique([], items, (item) => item.id) };
			} catch (error) {
				if (blogs === pending) blogs = { status: 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить поиск.' };
			}
		};
		if (force) void run();
		else blogTimer = setTimeout(run, SEARCH_DEBOUNCE);
	}

	function syncSearch() {
		if (scope === 'topics') {
			if (query.trim()) void loadTopics();
		} else {
			scheduleBlogSearch();
		}
	}

	function setScope(value: SearchScope) {
		if (scope === value) return;
		if (scope === 'blogs') {
			clearTimeout(blogTimer);
			if (blogs?.status === 'loading') {
				lastBlogQuery = '';
				blogs = null;
			}
		}
		scope = value;
		syncSearch();
	}
</script>

{#snippet subsiteRow(item: PinnedSubsite, pinned = false)}
	<SettingsRow title={item.name}>
		{#snippet prefix()}
			<span class="avatar" aria-hidden="true">
				{#if item.avatarUrl}
					<img src={item.avatarUrl} alt="" width="28" height="28" loading="lazy" />
				{/if}
			</span>
		{/snippet}
		{#if pinned}
			<SettingsButton label="Открепить: {item.name}" onclick={() => unpinSubsite(item.id)}>Открепить</SettingsButton>
		{:else}
			<SettingsButton label="Закрепить: {item.name}" disabled={atLimit} onclick={() => pinSubsite(item)}>Закрепить</SettingsButton>
		{/if}
	</SettingsRow>
{/snippet}

<div class="pinned-settings">
	<SettingsGroup>
		<SettingsRow title="Показывать в боковом меню" tag="label">
			<SettingsSwitch checked={pinnedSubsites.value.visible} onchange={(visible) => pinnedSubsites.patch({ visible })} />
		</SettingsRow>
	</SettingsGroup>

	<SettingsGroup title="Подсайты в меню" description="{items.length} из {PINNED_SUBSITES_LIMIT}{atLimit ? ' · Открепите подсайт, чтобы добавить другой.' : ''}">
		{#each items as item (item.id)}
			{@render subsiteRow(item, true)}
		{:else}
			<SettingsRow title="Пока ничего не закреплено" />
		{/each}
	</SettingsGroup>

	<SettingsGroup title="Стандартные подсайты">
		{#each available as item (item.id)}
			{@render subsiteRow(item)}
		{:else}
			<SettingsRow title="Все стандартные подсайты закреплены" />
		{/each}
	</SettingsGroup>

	<SettingsGroup title="Поиск подсайтов DTF">
		<div class="search-field">
			<SettingsSegmented options={scopes} value={scope} label="Где искать" onchange={setScope} />
			<input
				type="search"
				aria-label="Название подсайта"
				placeholder="Название подсайта"
				onfocus={() => { if (scope === 'topics') void loadTopics(); }}
				bind:value={() => query, (value) => {
					query = value;
					syncSearch();
				}}
			/>
		</div>
		{#if scope === 'blogs' && query.trim() && !searchableQuery(query)}
			<p class="message" role="status">Введите минимум {SEARCH_MIN_LENGTH} символа</p>
		{:else if search?.status === 'loading'}
			<p class="message" role="status">{scope === 'topics' ? 'Загружаем темы…' : 'Ищем…'}</p>
		{:else if search?.status === 'error'}
			<p class="message" role="alert">{search.message}</p>
			<SettingsRow title={scope === 'topics' ? 'Каталог тем' : 'Поиск блогов'}>
				<SettingsButton onclick={() => scope === 'topics' ? void loadTopics(true) : scheduleBlogSearch(true)}>Повторить</SettingsButton>
			</SettingsRow>
		{:else if search?.status === 'done'}
			{#each results as item (item.id)}
				{@render subsiteRow(item)}
			{:else}
				<p class="message" role="status">{matches.length ? 'Все найденные подсайты уже закреплены.' : 'Ничего не найдено.'}</p>
			{/each}
		{/if}
	</SettingsGroup>
</div>

<style>
	.pinned-settings {
		--row-text-basis: 100px;
		overflow-wrap: anywhere;
	}

	.avatar {
		flex: none;
		width: 28px;
		height: 28px;
		overflow: hidden;
		border-radius: 6px;
		background: var(--st-track);
	}

	.search-field {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		padding: 12px 20px;
	}

	input {
		flex: 1 1 240px;
		min-width: 0;
		min-height: 38px;
		padding: 0 12px;
		border-radius: 19px;
		background: var(--st-button);
		color: inherit;
		font: inherit;
	}

	input:focus-visible {
		outline: 2px solid var(--st-accent);
		outline-offset: 2px;
	}

	.message {
		padding: 0 20px 12px;
		color: var(--st-muted);
		font-size: 14px;
	}
</style>
