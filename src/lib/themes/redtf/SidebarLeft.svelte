<script lang="ts">
	import { resolve } from '$app/paths';
	import { MediaQuery } from 'svelte/reactivity';
	import { feed, openFeedTab, type FeedName } from '$lib/feed.svelte';
	import { prefetchFeed } from '$lib/feedCache';
	import { drawerSwipe, provideDrawer } from '$lib/drawerSwipe';
	import { activeTheme } from '$lib/themes/index.svelte';
	import { MOBILE_BREAKPOINT } from '$lib/themes/types';
	import { getProfilePath, getSidebarActive, openFeed, openPost, openProfile, openSettings, openSupport } from '$lib/navigation';
	import { contextMenu } from '$lib/contextMenu.svelte';
	import { pinnedSubsites } from '$lib/storage/pinnedSubsites.svelte';
	import { pinnedSubsiteMenu, startWriting } from '../dtf2022/actions.svelte';
	import { clickOnKey } from '../dtf2022/a11y';
	import { sidebar } from '../dtf2022/sidebar.svelte';
	import { Button } from '../dtf2022/ui';
	import { loadSettingsOverlay } from '$lib/components/settings/load';
	import { pushDrawer } from './pushDrawer';
	import { themeSettings } from './themeSettings.svelte';

	const feeds: { id: FeedName; label: string; icon: string }[] = [
		{ id: 'popular', label: 'Популярное', icon: 'ui_sidebar_feed' },
		{ id: 'new', label: 'Свежее', icon: 'ui_sidebar_recent_big' },
		{ id: 'my', label: 'Подписки', icon: 'ui_sidebar_subscriptions' }
	];

	let node = $state<HTMLElement>();
	let panel = $state<HTMLElement>();
	let items = $state<HTMLElement>();
	let active = $derived(getSidebarActive());
	let activeIndex = $derived(feeds.findIndex((item) => item.id === active.feed));

	$effect(() => {
		if (node) return sidebar.attach(node);
	});

	// На смартфоне панель лежит под страницей, а уезжает сама страница (pushDrawer.ts); шире — выдвижная панель поверх, на CSS
	const mobile = new MediaQuery(`max-width: ${MOBILE_BREAKPOINT}px`);
	$effect(() => {
		const drawerPanel = panel;
		if (!mobile.current || !drawerPanel || !items) return;
		const control = provideDrawer({
			width: () => drawerPanel.offsetWidth,
			set: pushDrawer(drawerPanel, items),
			commit(open) {
				if (open !== sidebar.open) sidebar.toggle();
			}
		});
		// Кнопка меню и закрытие по ссылке ведут тот же доезд, пока панель в мобильной раскладке.
		$effect(() => control.animate(sidebar.open));
		return control.destroy;
	});

	const closeSwipe = drawerSwipe(() => sidebar.open);

	function onResize() {
		if (!mobile.current) sidebar.closeIfDocked();
	}

	// Под открытой панелью страница не скроллится
	$effect(() => {
		if (!sidebar.open) return;
		// Из панели чаще всего идут в настройки: их код подтягиваем заранее
		loadSettingsOverlay();
		document.body.style.overflow = 'hidden';
		return () => (document.body.style.overflow = '');
	});

	/** В режиме панели переход по любой кнопке или ссылке её закрывает */
	function closeOnNavigate(e: MouseEvent) {
		if ((e.target as Element).closest('button, a')) sidebar.close();
	}
</script>

<svelte:window
	onresize={onResize}
	onkeydown={(e) => {
		if (e.key === 'Escape') sidebar.close();
	}}
/>

<aside
	class={['sidebar-left', { 'sidebar-left--open': sidebar.open, 'sidebar-left--collapsed': sidebar.collapsed }]}
	bind:this={node}
>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="tint" onclick={() => sidebar.close()} {@attach activeTheme.gestures ? closeSwipe : undefined}></div>

	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="panel" onclick={closeOnNavigate} bind:this={panel} {@attach activeTheme.gestures ? closeSwipe : undefined}>
		<!-- Своя обёртка со скроллом: на смартфоне пункты поднимаются из-под ленты отдельно от панели -->
		<div class="panel-scroll" bind:this={items}>
			<div class="panel-header">
				<div class="panel-burger" aria-label="Закрыть меню" role="button" tabindex="0" onclick={() => sidebar.close()} onkeydown={clickOnKey}>
					<svg class="icon" width="24" height="24" aria-hidden="true">
						<use href="#v_menu"></use>
					</svg>
				</div>
				<a href={resolve('/')} class="panel-logo" aria-label="re:DTF — на главную" onclick={openFeed}>
					<svg class="icon" height="50" width="128" aria-hidden="true">
						<use href="#redtf_logo"></use>
					</svg>
				</a>
			</div>

			<div class="sidebar-top">
				<nav class="feed-switcher" aria-label="Ленты" style:--i={activeIndex >= 0 ? activeIndex : 0}>
					<!-- Подсветка вкладки одна на всех: при выборе она переезжает на новое место -->
					<span class={['feed-indicator', { hidden: activeIndex < 0 }]} aria-hidden="true"></span>
					{#each feeds as item (item.id)}
						<button
							class={['switch-button', { active: active.feed === item.id }]}
							aria-current={active.feed === item.id ? 'page' : undefined}
							onpointerenter={() => prefetchFeed(item.id, feed.sortingOf(item.id))}
							onfocus={() => prefetchFeed(item.id, feed.sortingOf(item.id))}
							onclick={() => openFeedTab(item.id)}
						>
							<svg height="24" width="24" class="icon" aria-hidden="true">
								<use href="#{item.icon}"></use>
							</svg>
							<span class="label">{item.label}</span>
						</button>
					{/each}
				</nav>

				<div class={['sidebar-write', { 'sidebar-write--desktop': themeSettings.createButtonPos === 'sidebar' }]}>
					<Button label="Новая запись" fullWidth onclick={startWriting} />
				</div>

				{#if pinnedSubsites.value.visible && pinnedSubsites.value.items.length}
					<nav class="subsites-switcher" aria-label="Закреплённые подсайты">
						{#each pinnedSubsites.value.items as subsite (subsite.id)}
							<a
								class={['switch-button', { active: active.profileId === String(subsite.id) }]}
								aria-current={active.profileId === String(subsite.id) ? 'page' : undefined}
								href={resolve(getProfilePath(subsite.id) as any)}
								onclick={(e) => openProfile(e, subsite.id)}
								{@attach contextMenu(() => pinnedSubsiteMenu(subsite))}
							>
								<span class="icon subsite-avatar" aria-hidden="true">
									{#if subsite.avatarUrl}
										<img height="24" width="24" alt="" src={subsite.avatarUrl} />
									{/if}
								</span>
								<span class="label">{subsite.name}</span>
							</a>
						{/each}
					</nav>
				{/if}
			</div>

			<div class="sidebar-bottom">
				<div class="sidebar-footer">
					<div class="sidebar-footer__links">
						<a href={resolve('/settings')} onclick={openSettings}>Настройки</a>
						<a href="{resolve('/settings')}?page=about" onclick={(e) => openSettings(e, 'about')}>О проекте</a>
						<a href="https://github.com/re-dtf/client/releases/latest" target="_blank" rel="noreferrer">Скачать приложение</a>
						<a href={resolve('/support')} onclick={openSupport}>Поддержать развитие</a>
						<a href={resolve('/post/57431' as any)} onclick={(e) => openPost(e, { id: 57431, sourceId: 'dtf' })}>Правила DTF</a>
						<a href="{resolve('/settings')}?page=about&section=documents" onclick={(e) => openSettings(e, 'about', 'documents')}>Правовая информация</a>
						<a href="https://github.com/re-dtf/client/issues" target="_blank" rel="noreferrer">Сообщить о проблеме</a>
					</div>
				</div>
			</div>
		</div>
	</div>
</aside>

<style>
	.sidebar-left {
		width: 100%;
		max-width: var(--sidebar-left-width);
		min-width: 0;
		flex-shrink: 0;
		overflow: hidden;

		/* Липкая панель со своим скроллом */
		position: sticky;
		top: var(--header-height);
		height: calc(100vh - var(--header-height));
		justify-self: start;
		transition: visibility 0.3s;
	}

	.panel {
		width: var(--sidebar-left-width);
		min-width: var(--sidebar-left-width);
		height: 100%;
		transition:
			transform 0.3s cubic-bezier(0.165, 0.84, 0.44, 1),
			opacity 0.25s ease;
	}

	.panel-scroll {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow-y: auto;
	}

	.panel-burger {
		color: var(--text-primary);
		display: flex;
		align-items: center;
		padding-left: 20px;
		cursor: pointer;
	}

	.panel-burger:hover {
		opacity: 0.6;
	}

	.panel-logo {
		display: flex;
		align-items: center;
		padding-left: 15px;
	}

	/* Шапка и затемнение есть только у выдвижной панели */
	.tint,
	.panel-header,
	.sidebar-write {
		display: none;
	}

	.sidebar-write {
		--btn-height: 48px;
		--btn-font-size: 18px;
		padding: 0 15px;
		margin: 1px 0 20px;
	}

	@media (min-width: 860px) {
		.sidebar-write--desktop {
			display: block;
		}
	}

	.feed-switcher {
		--step: 47px;
		--item-height: 44px;
		position: relative;
		padding: 12px 10px;
	}

	.feed-indicator {
		position: absolute;
		top: 12px;
		left: 10px;
		right: 10px;
		height: var(--item-height);
		border-radius: 8px;
		background: var(--bg-card);
		translate: 0 calc(var(--i) * var(--step));
		transition:
			translate 0.4s cubic-bezier(0.165, 0.84, 0.44, 1),
			opacity 0.2s ease;
	}

	.feed-indicator.hidden {
		opacity: 0;
		pointer-events: none;
	}

	.subsites-switcher {
		padding: 12px 10px 48px 10px;
	}

	.subsite-avatar {
		flex: none;
		width: 24px;
		height: 24px;
		overflow: hidden;
		background: var(--bg-sidebar-hover);
	}

	.switch-button {
		position: relative;
		color: inherit;
		display: flex;
		align-items: center;
		height: 44px;
		font-size: 16px;
		cursor: pointer;
		margin-bottom: 3px;
		border-radius: 8px;
		padding: 0 10px;
		width: 100%;
		transition:
			background-color 0.2s ease,
			scale 0.15s cubic-bezier(0.165, 0.84, 0.44, 1);
	}

	.switch-button:hover {
		background: var(--bg-sidebar-hover);
	}

	.switch-button:active {
		scale: 0.97;
	}

	.switch-button .icon {
		margin-right: 12px;
		border-radius: 6px;
		transition: color 0.3s ease;
	}

	.switch-button .label {
		font-size: 16px;
		line-height: 16px;
		font-weight: 400;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 111px;
	}

	/* Фон активной вкладки ленты рисует переезжающая подсветка */
	.feed-switcher .switch-button.active,
	.feed-switcher .switch-button.active:hover {
		background: none;
	}

	.subsites-switcher .switch-button.active {
		background: var(--bg-card);
	}

	.switch-button.active .icon {
		color: var(--color-accent);
	}

	.sidebar-bottom {
		margin-top: auto;
		padding-top: 24px;
	}

	.sidebar-footer {
		padding: 5px 20px 11px;
	}

	.sidebar-footer__links {
		display: flex;
		flex-wrap: wrap;
		gap: 5px 12px;
		font-size: 14px;
		line-height: 23px;
		color: var(--text-secondary);
	}

	.sidebar-footer__links > :hover {
		color: var(--text-hover);
	}

	/* Свёрнутая бургером колонка на десктопе */
	@media (min-width: 860px) {
		.sidebar-left--collapsed {
			visibility: hidden;
			pointer-events: none;
		}

		.sidebar-left--collapsed .panel {
			transform: translateX(-100%);
			opacity: 0;
		}
	}

	/* Выдвижная панель: у DTF колонка уходит ≤859px, на странице профиля — ≤1219px */
	@media (max-width: 859px) {
		.sidebar-left {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			max-width: none;
			height: 100%;
			z-index: 110;
			overflow: visible;
			visibility: hidden;
			pointer-events: none;
			transition: visibility 0.3s;
		}

		.sidebar-left--open {
			visibility: visible;
			pointer-events: auto;
			transition: none;
		}

		.tint {
			display: block;
			position: fixed;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100%;
			z-index: 1;
			background: var(--bg-tint-overlay);
			opacity: 0;
			pointer-events: auto;
			transition: opacity 0.3s ease;
		}

		.sidebar-left--open .tint {
			opacity: 1;
		}

		.panel {
			position: relative;
			z-index: 2;
			width: 80%;
			max-width: 300px;
			min-width: 0;
			background: var(--bg-main);
			transform: translateX(-100%);
			opacity: 1;
			pointer-events: auto;
			transition: transform 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
		}

		.sidebar-left--open .panel {
			transform: translateX(0);
		}

		.panel-header {
			display: flex;
			flex-shrink: 0;
			height: var(--header-height, 60px);
			min-height: 60px;
		}

		.sidebar-write {
			display: block;
		}

		.feed-switcher {
			--step: 51px;
			--item-height: 48px;
		}

		.switch-button {
			height: 48px;
			font-size: 18px;
		}

		.switch-button .label {
			font-size: 18px;
			line-height: 18px;
			max-width: 180px;
		}
	}

	/*
	 * Смартфон: панель лежит под страницей, шапка остаётся на месте, а страница уезжает вправо (pushDrawer.ts ставит сдвиг
	 * и видимость панели). Узла у колонки нет: панель и ловушка касаний встают рядом со страницей, панель под ней, ловушка над ней.
	 * position: fixed у колонки остаётся: по нему sidebar.svelte.ts узнаёт режим панели
	 */
	@media (max-width: 719px) {
		.sidebar-left {
			display: contents;
		}

		.sidebar-left .panel {
			position: fixed;
			top: var(--header-height);
			bottom: 0;
			left: 0;
			z-index: 1;
			width: min(80vw, 300px);
			max-width: none;
			height: auto;
			visibility: hidden;
			background: var(--bg-sidebar-deep);
			transform: none;
			transition: none;
		}

		.panel-scroll {
			transform-origin: 0 50%;
		}

		/* Шапка страницы остаётся на экране: своей шапки панели не нужно */
		.sidebar-left .panel-header {
			display: none;
		}

		/* Панель экрана уезжает вместе со страницей, поэтому меню начинается от верха окна; содержимое стоит там же, где стояло под шапкой */
		:global(:root[data-mobile-top-bar]) .sidebar-left .panel {
			padding-top: var(--screen-bar-height);
		}

		/* Серая полоса сверху — продолжение верхней панели, уехавшей вправо вместе со страницей. Она не входит в пункты,
		   у которых масштаб и прозрачность: открывается ровно тем, что страница уезжает, без своих эффектов */
		:global(:root[data-mobile-top-bar]) .sidebar-left .panel::before {
			content: '';
			position: absolute;
			z-index: 1;
			inset: 0 0 auto;
			height: var(--screen-bar-height);
			background: var(--bg-card);
			box-shadow: inset 0 -1px var(--border-subtle-2);
			pointer-events: none;
		}

		:global(:root[data-mobile-top-bar='floating']) .sidebar-left .panel::before {
			inset: max(var(--mobile-bar-gap), env(safe-area-inset-top, 0px)) var(--mobile-bar-gap) auto 0;
			height: var(--mobile-bar-height-raw);
			border-radius: 0 var(--mobile-bar-radius) var(--mobile-bar-radius) 0;
			box-shadow: var(--shadow-dropdown);
		}

		/* Касание по уехавшей странице закрывает панель */
		.sidebar-left .tint {
			display: none;
		}

		.sidebar-left--open .tint {
			display: block;
			top: var(--header-height);
			left: min(80vw, 300px);
			width: auto;
			height: auto;
			right: 0;
			bottom: 0;
			z-index: 3;
			visibility: visible;
			background: none;
			opacity: 1;
			transition: none;
		}

		/* Свайп влево по панели и по странице закрывает панель; прокрутка панели по вертикали остаётся браузеру */
		:global(.app[data-gestures]) .panel {
			touch-action: pan-y pinch-zoom;
		}

		:global(.app[data-gestures]) .tint {
			touch-action: none;
		}

		.panel-burger,
		.panel-logo {
			padding-left: 16px;
		}

		.panel-logo .icon {
			width: 95px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sidebar-left,
		.tint,
		.panel {
			transition: none !important;
		}
	}
</style>
