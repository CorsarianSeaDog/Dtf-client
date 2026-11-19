<script lang="ts">
	import AccountGate from './AccountGate.svelte';
	import FilterChips from './FilterChips.svelte';
	import SettingsGroup from './SettingsGroup.svelte';
	import { api } from '$lib/api/index.svelte';
	import type { IgnoredSubsite } from '$lib/api/types';
	import { animatedAvatar } from '$lib/actions/animatedAvatar.svelte';
	import { filterSettings, unhideUser } from '$lib/storage/filter.svelte';

	/*
	 * Страница «Чёрный список»:
	 * 1. Скрытые пользователи: локальный чёрный список без авторизации на DTF.
	 * 2. Серверный ЧС: пользователи и темы DTF (с кнопкой «Убрать», которая на мобиле становится круглой с крестиком и всегда остаётся справа).
	 */
	let items = $state<IgnoredSubsite[]>();
	let error = $state<string>();

	api.getIgnoredSubsites().then(
		(value) => (items = value),
		(e: Error) => (error = e.message)
	);

	let users = $derived(items?.filter((item) => !item.isCommunity) ?? []);
	let communities = $derived(items?.filter((item) => item.isCommunity) ?? []);

	async function restore(item: IgnoredSubsite) {
		if (!items) return;
		const before = items;
		items = items.filter((other) => other.id !== item.id);
		error = undefined;
		try {
			await api.setSubsiteIgnored(item.id, false);
		} catch (e) {
			items = before;
			error = (e as Error).message;
		}
	}
</script>

{#snippet list(title: string, subsites: IgnoredSubsite[])}
	{#if subsites.length}
		<SettingsGroup {title}>
			{#each subsites as item (item.id)}
				<div class="ignored-row">
					<span class="avatar" style:background-image={item.avatarUrl ? `url(${item.avatarUrl})` : undefined} {@attach animatedAvatar(item.avatarUrl)}></span>
					<div class="ignored-row__info">
						<span class="ignored-row__name">{item.name}</span>
						{#if item.description}
							<span class="ignored-row__desc">{item.description}</span>
						{/if}
					</div>
					<button
						class="unignore-btn"
						type="button"
						aria-label="Убрать {item.name} из чёрного списка"
						onclick={() => restore(item)}
					>
						<span class="unignore-btn__text">Убрать</span>
						<svg class="unignore-btn__icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
							<path d="M4 4l8 8M12 4l-8 8" />
						</svg>
					</button>
				</div>
			{/each}
		</SettingsGroup>
	{/if}
{/snippet}

<!-- Локально скрытые пользователи -->
<SettingsGroup
	title="Скрытые пользователи"
	description="Их записи, комментарии и уведомления от них не показываются. Работает локально без авторизации на DTF."
>
	<div class="users-card">
		<FilterChips
			items={filterSettings.value.users.map((user) => ({
				key: user.id,
				label: user.name,
				removeLabel: `Показывать ${user.name}`
			}))}
			label="Скрытые пользователи"
			emptyHint="Нет скрытых пользователей. Скрыть можно из меню «⋯» у записи, комментария или в профиле."
			onremove={unhideUser}
		/>
	</div>
</SettingsGroup>

<!-- Серверный ЧС DTF -->
<h3 class="section-title">Чёрный список на DTF</h3>
<AccountGate>
	{#if items}
		{@render list('Пользователи', users)}
		{@render list('Темы и подсайты', communities)}
		{#if !items.length}
			<p class="status">В аккаунте DTF никого не скрыто.</p>
		{/if}
	{:else if !error}
		<p class="status">Загрузка с DTF…</p>
	{/if}
	{#if error}<p class="status status--error">{error}</p>{/if}
</AccountGate>

<style>
	.section-title {
		margin: 36px 4px 12px;
		font-size: 17px;
		font-weight: 500;
		line-height: 24px;
	}

	.section-title + :global(.group) {
		margin-top: 12px;
	}

	.users-card {
		padding: 16px 20px;
	}

	/* Строка списка ЧС DTF: гарантированно 1 строка, кнопка всегда справа */
	.ignored-row {
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: 12px;
		min-height: 56px;
		padding: 10px 20px;
	}

	.ignored-row:not(:first-child) {
		border-top: 1px solid var(--st-separator);
	}

	.ignored-row__info {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	.ignored-row__name {
		font-size: 15px;
		line-height: 20px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ignored-row__desc {
		color: var(--st-muted);
		font-size: 13px;
		line-height: 18px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.avatar {
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--st-field) 50% 50% / cover no-repeat;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
	}

	/* Кнопка «Убрать»: на десктопе с текстом, на узких экранах круглая с крестиком */
	.unignore-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		margin-left: auto;
		height: 32px;
		padding: 0 14px;
		border-radius: 16px;
		background: var(--st-button);
		color: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--duration-base), color var(--duration-base);
	}

	.unignore-btn:hover {
		background: var(--st-button-hover);
		color: var(--st-danger);
	}

	.unignore-btn__icon {
		display: none;
	}

	@container (max-width: 719px) {
		.users-card {
			padding: 14px 16px;
		}

		.ignored-row {
			padding: 10px 16px;
		}

		.unignore-btn {
			width: 34px;
			height: 34px;
			padding: 0;
			border-radius: 50%;
		}

		.unignore-btn__text {
			display: none;
		}

		.unignore-btn__icon {
			display: block;
		}
	}

	.status {
		margin: 0 4px 24px;
		color: var(--st-muted);
		font-size: 14px;
	}

	.status--error {
		color: var(--st-danger);
	}
</style>
