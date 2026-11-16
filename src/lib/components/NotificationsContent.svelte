<script lang="ts">
	import { notifications } from '$lib/api/notifications.svelte';
	import { isOnTop } from '$lib/navigation';
	import { pullRefresh } from '$lib/pullRefresh';
	import { authStorage } from '$lib/storage/auth.svelte';
	import ThemeLoader, { isThemeComponentLoaded, preloadThemeComponent } from '$lib/themes/ThemeLoader.svelte';
	import { activeTheme } from '$lib/themes/index.svelte';
	import Reveal from './Reveal.svelte';
	import ScreenBar from './ScreenBar.svelte';

	/*
	 * Страница уведомлений (оверлей notifications). Разметку рисует тема (Notifications).
	 * Экран показывается, когда загружен компонент темы; список уведомлений тема грузит сама.
	 */
	let { active = true }: { active?: boolean } = $props();

	const preloaded = isThemeComponentLoaded(activeTheme.chain, 'Notifications');
	let shown = $state(preloaded);
	if (!preloaded) preloadThemeComponent(activeTheme.chain, 'Notifications').then(() => (shown = true));

	const pull = pullRefresh({
		enabled: () => authStorage.isAuthenticated && active && isOnTop('notifications'),
		refresh: () => notifications.load()
	});
</script>

<div class="notifications-screen" {@attach pull}>
	<ScreenBar screen="notifications" />
	<Reveal ready={shown} anim="contentIn">
		<ThemeLoader componentName="Notifications" {active} />
	</Reveal>
</div>

<style>
	.notifications-screen {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		width: 100%;
	}

	.notifications-screen > :global(.reveal) {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		width: 100%;
		max-width: var(--content-width);
	}

	.notifications-screen > :global(.reveal > .stage) {
		flex-grow: 1;
	}

	@media (max-width: 719px) {
		/* Компенсируем отступ .page-content на корне экрана, чтобы фон уходил под нижнюю панель и не обрезался при переходе */
		.notifications-screen {
			margin-bottom: calc(-1 * var(--mobile-bar-height));
		}
	}
</style>
