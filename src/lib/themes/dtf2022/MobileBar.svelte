<script lang="ts">
	import { resolve } from '$app/paths';
	import { isNewTabClick, isOnTop, openFeed, openNotifications, openOverlay } from '$lib/navigation';
	import { notifications } from '$lib/api/notifications.svelte';
	import { authStorage } from '$lib/storage/auth.svelte';
	import { currentUser } from '$lib/api/currentUser.svelte';
	import { refreshAccount } from '$lib/api/donationAccount.svelte';
	import { refreshWithIndicator } from '$lib/pullRefresh';
	import { haptics } from '$lib/haptics';
	import { activeTheme } from '$lib/themes/index.svelte';
	import { hasThemeComponent } from '$lib/themes/ThemeLoader.svelte';
	import { scrollBehavior } from '$lib/motion';
	import { animatedAvatar } from '$lib/actions/animatedAvatar.svelte';

	// Тема со страницей аккаунта ведёт на неё (гостю она сама предлагает войти), остальные — в настройки или во вход
	let hasAccountPage = $derived(hasThemeComponent(activeTheme.chain, 'AccountPage'));
	let notificationsOpen = $derived(isOnTop('notifications'));
	let accountOpen = $derived(isOnTop('account'));
	let avatarUrl = $derived(authStorage.isAuthenticated ? currentUser.value?.avatarUrl : undefined);

	function handleFeed(e: MouseEvent) {
		haptics.tick();
		openFeed(e);
	}

	function handleNotifications(e: MouseEvent) {
		if (isNewTabClick(e)) return;
		haptics.tick();
		if (notificationsOpen) {
			e.preventDefault();
			window.scrollTo({ top: 0, behavior: scrollBehavior() });
			if (authStorage.isAuthenticated) refreshWithIndicator(() => notifications.load());
		} else {
			openNotifications(e);
		}
	}

	function openAccount() {
		haptics.tick();
		if (hasAccountPage) {
			// Повторное нажатие на открытой странице — наверх и обновить данные (с загрузкой, как после жеста), а не ещё один слой
			if (accountOpen) {
				window.scrollTo({ top: 0, behavior: scrollBehavior() });
				if (authStorage.isAuthenticated) refreshWithIndicator(refreshAccount);
			} else openOverlay({ type: 'account' });
		} else if (authStorage.isAuthenticated) {
			openOverlay({ type: 'settings' });
		} else {
			openOverlay({ type: 'login' });
		}
	}
</script>

<nav class="mobile-bar-container" aria-label="Навигация">
	<div class="mobile-bar">
		<div class="mobile-bar__link-wrapper">
			<a href={resolve('/')} class="mobile-bar__link" aria-label="Главная" onclick={handleFeed}>
				<svg height="28" width="28" class="icon" aria-hidden="true">
					<use href="#v_home"></use>
				</svg>
			</a>
		</div>
		<!-- TODO: мессенджер у DTF по подписке, на аккаунте без неё его запросы не снять -->
		<div class="mobile-bar__link-wrapper">
			<button class="mobile-bar__link" aria-label="Сообщения" onclick={() => haptics.tick()}>
				<svg height="28" width="28" class="icon" aria-hidden="true">
					<use href="#v_messenger"></use>
				</svg>
			</button>
		</div>
		<div class="mobile-bar__link-wrapper">
			<!-- На мобильном вместо попапа — страница уведомлений -->
			<a href={resolve('/notifications')} class="mobile-bar__link mobile-bar__notifications" aria-label="Уведомления" onclick={handleNotifications}>
				<svg height="28" width="28" class="icon" aria-hidden="true">
					<use href="#v_bell"></use>
				</svg>
				{#if notifications.unread > 0}
					<span class="mobile-bar__badge">{notifications.unread}</span>
				{/if}
			</a>
		</div>
		<div>
			<button class="mobile-bar__link" aria-label={hasAccountPage ? 'Аккаунт' : authStorage.isAuthenticated ? 'Настройки' : 'Войти'} onclick={openAccount}>
				<!-- Как у DTF 2023: вошедшему — аватарка, гостю — значок входа; на открытой странице аккаунта — подсветка -->
				{#if avatarUrl}
					<span class={['mobile-bar__profile-avatar', { 'mobile-bar__profile-avatar--is-active': accountOpen }]} style:background-image="url('{avatarUrl}')" {@attach animatedAvatar(avatarUrl)}></span>
				{:else}
					<svg height="28" width="28" class={['icon', { 'mobile-bar__account--is-active': accountOpen }]} aria-hidden="true">
						<use href="#v_login"></use>
					</svg>
				{/if}
			</button>
		</div>
	</div>
</nav>

<style>
	.mobile-bar-container {
		display: none;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 100;
	}

	.mobile-bar {
		--touch-zone-size: calc(var(--mobile-bar-height-raw) - 2px * 2);
		--padding-x: calc(24px - (var(--touch-zone-size) - 28px) / 2);
		display: flex;
		justify-content: space-between;
		align-items: center;
		background-color: var(--bg-card);
		border-top: 1px solid var(--border-subtle-2);
		padding: 0 var(--padding-x) env(safe-area-inset-bottom);
		height: var(--mobile-bar-height);
	}

	.mobile-bar__link-wrapper {
		position: relative;
	}

	.mobile-bar__link {
		display: flex;
		height: var(--touch-zone-size);
		width: var(--touch-zone-size);
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		color: inherit;
		cursor: pointer;
	}

	.mobile-bar__notifications {
		position: relative;
	}

	.mobile-bar__profile-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--border-color) 50% 50% / cover no-repeat;
	}

	.mobile-bar__profile-avatar--is-active {
		box-shadow:
			0 0 0 1px var(--bg-card),
			0 0 0 3px var(--color-accent);
	}

	.mobile-bar__account--is-active {
		color: var(--color-accent);
	}

	.mobile-bar__badge {
		position: absolute;
		left: 50%;
		top: 18%;
		min-width: 12px;
		padding: 3px 5px;
		border-radius: 4px;
		background-color: var(--color-badge);
		color: var(--text-on-accent);
		font-size: 12px;
		line-height: 1em;
	}

	@media (max-width: 719px) {
		.mobile-bar-container {
			display: block;
		}
	}
</style>
