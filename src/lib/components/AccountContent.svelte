<script lang="ts">
	import { resolve } from '$app/paths';
	import ThemeLoader, { isThemeComponentLoaded, preloadThemeComponent } from '$lib/themes/ThemeLoader.svelte';
	import { activeTheme } from '$lib/themes/index.svelte';
	import { isOnTop, openSettings } from '$lib/navigation';
	import { pullRefresh } from '$lib/pullRefresh';
	import { refreshAccount } from '$lib/api/donationAccount.svelte';
	import { authStorage } from '$lib/storage/auth.svelte';
	import Reveal from './Reveal.svelte';
	import ScreenBar from './ScreenBar.svelte';

	/*
	 * Страница аккаунта (оверлей account). Разметку рисует тема (AccountPage); у темы без неё,
	 * например после смены темы с открытой страницей, остаётся ссылка в настройки.
	 * Данные тема грузит сама (`loadAccount`); экран показывается, когда загружен компонент, иначе переход страниц показал бы спиннер.
	 */
	const preloaded = isThemeComponentLoaded(activeTheme.chain, 'AccountPage');
	let shown = $state(preloaded);
	if (!preloaded) preloadThemeComponent(activeTheme.chain, 'AccountPage').then(() => (shown = true));

	// Потянуть страницу вниз от самого верха — перечитать данные аккаунта (если тема рисует этот жест)
	const pull = pullRefresh({
		enabled: () => authStorage.isAuthenticated && isOnTop('account'),
		refresh: refreshAccount
	});
</script>

<div class="account-screen under-mobile-bar" {@attach pull}>
	<ScreenBar screen="account" />
	<Reveal ready={shown} anim="contentIn">
		<ThemeLoader componentName="AccountPage">
			<p class="account-fallback">
				В этой теме нет страницы аккаунта. Всё нужное есть в <a href={resolve('/settings')} onclick={openSettings}>настройках</a>.
			</p>
		</ThemeLoader>
	</Reveal>
</div>

<style>
	/* До низа экрана: страница короткая, а потянуть её можно и за пустое место под содержимым */
	.account-screen {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		width: 100%;
	}

	.account-screen > :global(.reveal) {
		width: 100%;
		max-width: var(--content-width);
	}

	@media (max-width: 719px) {
		.account-screen {
			padding-bottom: var(--mobile-bar-height);
		}
	}

	.account-fallback {
		padding: 24px 16px;
		color: var(--text-secondary);
	}

	.account-fallback a {
		color: var(--text-link);
	}
</style>
