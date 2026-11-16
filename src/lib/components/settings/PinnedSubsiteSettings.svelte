<script lang="ts">
	import { api } from '$lib/api/index.svelte';
	import { appendUnique } from '$lib/api/utils';
	import {
		PINNED_SUBSITES_LIMIT,
		STANDARD_SUBSITES,
		pinnedSubsites,
		pinSubsite,
		unpinSubsite,
		type PinnedSubsite
	} from '$lib/storage/pinnedSubsites.svelte';
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
	let search = $state.raw<SearchState | null>(null);
	let items = $derived(pinnedSubsites.value.items);
	let atLimit = $derived(items.length >= PINNED_SUBSITES_LIMIT);
	let pinnedIds = $derived(new Set(items.map((item) => item.id)));
	let available = $derived(STANDARD_SUBSITES.filter((item) => !pinnedIds.has(item.id)));
	let results = $derived(search?.status === 'done' ? search.items.filter((item) => !pinnedIds.has(item.id)) : []);

	async function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		const text = query.trim();
		if (!text || search?.status === 'loading') return;

		const pending = { status: 'loading' } as const;
		search = pending;
		try {
			const { items } = await api.searchSubsites(text, scope === 'topics');
			if (search === pending) search = { status: 'done', items: appendUnique([], items, (item) => item.id) };
		} catch (error) {
			if (search === pending) {
				search = { status: 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить поиск.' };
			}
		}
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
		<form onsubmit={submitSearch}>
			<SettingsSegmented options={scopes} value={scope} label="Где искать" onchange={(value) => {
				if (scope === value) return;
				scope = value;
				search = null;
			}} />
			<div class="search-field">
				<input
					type="search"
					aria-label="Название подсайта"
					placeholder="Название подсайта"
					bind:value={() => query, (value) => {
						query = value;
						search = null;
					}}
				/>
				<SettingsButton type="submit" variant="suggested" disabled={!query.trim() || search?.status === 'loading'}>Найти</SettingsButton>
			</div>
		</form>
		{#if search?.status === 'loading'}
			<p class="message" role="status">Ищем…</p>
		{:else if search?.status === 'error'}
			<p class="message" role="alert">{search.message}</p>
		{:else if search?.status === 'done'}
			{#each results as item (item.id)}
				{@render subsiteRow(item)}
			{:else}
				<p class="message" role="status">{search.items.length ? 'Все найденные подсайты уже закреплены.' : 'Ничего не найдено.'}</p>
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

	form,
	.search-field {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	form {
		flex-wrap: wrap;
		padding: 12px 20px;
	}

	.search-field {
		flex: 1 1 240px;
		min-width: 0;
	}

	input {
		flex: 1;
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
