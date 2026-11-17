<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { currentUser } from '$lib/api/currentUser.svelte';
	import { donationAccount, loadAccount } from '$lib/api/donationAccount.svelte';
	import { authStorage } from '$lib/storage/auth.svelte';
	import { getProfilePath, openBookmarks, openDrafts, openOverlay, openProfile, openSettings } from '$lib/navigation';
	import { donationsNote } from './format';
	import { animatedAvatar } from '$lib/actions/animatedAvatar.svelte';

	/*
	 * Страница /account, куда в DTF 2023 вела кнопка профиля в нижней панели: меню аккаунта на весь экран
	 * (account-menu/default-view.vue → itemGroupsMobile, обёртка .account-menu--fullpage).
	 * Из пунктов оригинала оставлены те, что есть в re:DTF. Нет: «Создать сообщество», «Подписки»,
	 * «Подписка Plus», «Кабинет», «Вакансии», «Рейтинг DTF». Донаты ведут в CloudTips, куда их перенёс DTF (не подключены —
	 * на их подключение); баланс — второй строкой пункта (`subLabel` оригинала).
	 */

	let user = $derived(authStorage.isAuthenticated ? currentUser.value : null);

	onMount(() => {
		if (authStorage.isAuthenticated) loadAccount();
	});

	type Item = { icon: string; label: string; sub?: string; href: string; external?: boolean; action?: (e: MouseEvent) => void };

	let donationsSub = $derived(donationsNote(donationAccount.value));

	// Группы оригинала; пустые (у гостя) не рисуются
	let groups = $derived<Item[][]>(
		[
			user
				? [
						{ icon: 'v_pen', label: 'Черновики', href: resolve('/drafts'), action: openDrafts },
						{ icon: 'v_bookmark', label: 'Закладки', href: resolve('/bookmarks'), action: openBookmarks },
						{ icon: 'v_gear', label: 'Настройки', href: resolve('/settings'), action: (e: MouseEvent) => openSettings(e) }
					]
				: [],
			user ? [{ icon: 'v_rouble', label: 'Донаты', sub: donationsSub ?? '', href: donationAccount.href, external: true }] : [],
			[{ icon: 'v_info', label: 'О проекте', href: `${resolve('/settings')}?page=about`, action: (e: MouseEvent) => openSettings(e, 'about') }]
		].filter((group) => group.length)
	);

	function openMe(e: MouseEvent) {
		if (user) openProfile(e, user.id);
	}
</script>

<div class="account-menu-root">
	<div class="account-menu">
		<p class="account-menu__title">Мой профиль</p>

		{#if user}
			<a class="account-menu__user-card" href={resolve(getProfilePath(user.id) as any)} onclick={openMe}>
				<div class="user-card">
					<div class="user-card__avatar" style:background-image={user.avatarUrl ? `url('${user.avatarUrl}')` : undefined} {@attach animatedAvatar(user.avatarUrl)}></div>
					<span class="user-card__text">{user.name}</span>
				</div>
			</a>
		{:else}
			<button type="button" class="account-menu__user-card account-menu__login-button" onclick={() => openOverlay({ type: 'login' })}>
				<div class="anon-card">
					<div class="anon-card__icon-container">
						<svg class="icon" width="28" height="28" aria-hidden="true"><use href="#v_login"></use></svg>
					</div>
					<span class="anon-card__text">Вход и регистрация</span>
				</div>
			</button>
		{/if}

		{#each groups as group, i (i)}
			<div class="account-menu__items-group">
				{#each group as item (item.label)}
					<div class="account-menu__item-wrapper">
						<a
							class="account-menu__item"
							href={item.href}
							target={item.external ? '_blank' : undefined}
							rel={item.external ? 'noopener noreferrer' : undefined}
							onclick={item.action}
						>
							<svg class="icon account-menu__item-icon" width="24" height="24" aria-hidden="true"><use href="#{item.icon}"></use></svg>
							<div class="account-menu__item-label">
								<span>{item.label}</span>
								{#if item.sub !== undefined}
									<p class="sub" aria-hidden={!item.sub || undefined}>{item.sub || '\u00A0'}</p>
								{/if}
							</div>
						</a>
					</div>
				{/each}
			</div>
		{/each}

		{#if user}
			<div class="account-menu__items-group">
				<div class="account-menu__item-wrapper">
					<button type="button" class="account-menu__item" onclick={() => authStorage.logout()}>
						<svg class="icon account-menu__item-icon" width="24" height="24" aria-hidden="true"><use href="#v_logout"></use></svg>
						<span class="account-menu__item-label">Выйти</span>
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Размеры — из стилей чанка account-menu DTF 2023 (мобильные по умолчанию, десктопные от 720px) */
	.account-menu-root {
		width: 100%;
		max-width: var(--content-width);
		background: var(--bg-card);
		color: var(--text-primary);
		font-size: 17px;
		line-height: 26px;
	}

	@media (max-width: 719px) {
		.account-menu-root {
			min-height: calc(100vh - var(--header-height) - var(--mobile-bar-height));
		}
	}

	.account-menu {
		padding: 16px 6px;
	}

	.account-menu__title {
		display: none;
		margin-bottom: 8px;
		padding: 0 10px;
		font-size: 15px;
		line-height: 24px;
		font-weight: 500;
	}

	.account-menu__items-group {
		margin-top: 16px;
	}

	.account-menu__item-wrapper {
		padding: 4px 0;
	}

	.account-menu__user-card,
	.account-menu__item {
		display: block;
		border-radius: 8px;
		color: var(--text-primary);
	}

	.account-menu__login-button {
		width: 100%;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.account-menu__item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 8px 10px;
		font: inherit;
		font-weight: 400;
		cursor: pointer;
	}

	.account-menu__item-icon {
		flex-shrink: 0;
		margin-right: 16px;
	}

	.account-menu__item-label {
		text-align: left;
	}

	.account-menu__item-label .sub {
		color: var(--text-muted);
		font-size: 13px;
		line-height: 18px;
	}

	.user-card,
	.anon-card {
		display: flex;
		align-items: center;
		padding: 8px 10px;
	}

	.user-card__avatar,
	.anon-card__icon-container {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		margin-right: 16px;
		border-radius: 50%;
		background: var(--bg-card-hover) 50% 50% / cover no-repeat;
		box-shadow: inset 0 0 0 1px var(--border-avatar);
	}

	.anon-card__icon-container {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.user-card__text,
	.anon-card__text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 20px;
		line-height: 24px;
		font-weight: 500;
	}

	@media (min-width: 720px) {
		.account-menu {
			padding: 12px 6px 8px;
		}

		.account-menu__title {
			display: block;
		}

		.account-menu__items-group {
			margin-top: 8px;
		}

		.account-menu__item:hover,
		.account-menu__user-card:hover {
			background: var(--bg-card-hover);
		}

		.user-card__avatar {
			width: 44px;
			height: 44px;
			margin-right: 12px;
		}

		.user-card__text {
			font-size: 17px;
			line-height: 26px;
			font-weight: 400;
		}
	}
</style>
