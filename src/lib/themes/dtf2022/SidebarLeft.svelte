<script lang="ts">
	import { resolve } from '$app/paths';
	import { feed, openFeedTab, type FeedName } from '$lib/feed.svelte';
	import { getProfilePath, getSidebarActive, openFeed, openPost, openProfile, openSettings, openSupport } from '$lib/navigation';
	import { contextMenu } from '$lib/contextMenu.svelte';
	import { pinnedSubsites } from '$lib/storage/pinnedSubsites.svelte';
	import { pinnedSubsiteMenu, startWriting } from './actions.svelte';
	import { clickOnKey } from './a11y';
	import { sidebar } from './sidebar.svelte';
	import { Button } from './ui';

	const feeds: { id: FeedName; label: string; icon: string }[] = [
		{ id: 'popular', label: 'Популярное', icon: 'ui_sidebar_feed' },
		{ id: 'new', label: 'Свежее', icon: 'ui_sidebar_recent_big' },
		{ id: 'my', label: 'Подписки', icon: 'ui_sidebar_subscriptions' }
	];

	let node = $state<HTMLElement>();
	let active = $derived(getSidebarActive());

	$effect(() => {
		if (node) return sidebar.attach(node);
	});

	// Под открытой панелью страница не скроллится
	$effect(() => {
		if (!sidebar.open) return;
		document.body.style.overflow = 'hidden';
		return () => (document.body.style.overflow = '');
	});

	/** В режиме панели переход по любой кнопке или ссылке её закрывает */
	function closeOnNavigate(e: MouseEvent) {
		if ((e.target as Element).closest('button, a')) sidebar.close();
	}
</script>

<svelte:window
	onresize={() => sidebar.closeIfDocked()}
	onkeydown={(e) => {
		if (e.key === 'Escape') sidebar.close();
	}}
/>

<aside
	class={['sidebar-left', { 'sidebar-left--open': sidebar.open, 'sidebar-left--collapsed': sidebar.collapsed }]}
	bind:this={node}
>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="tint" onclick={() => sidebar.close()}></div>

	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="panel" onclick={closeOnNavigate}>
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
			<nav class="feed-switcher" aria-label="Ленты">
				{#each feeds as item (item.id)}
					<button
						class={['switch-button', { active: active.feed === item.id }]}
						aria-current={active.feed === item.id ? 'page' : undefined}
						onclick={() => openFeedTab(item.id)}
					>
						<svg height="24" width="24" class="icon" aria-hidden="true">
							<use href="#{item.icon}"></use>
						</svg>
						<span class="label">{item.label}</span>
					</button>
				{/each}
			</nav>

			<!-- Только в выдвижной панели: на широком экране «Создать» есть в шапке -->
			<div class="sidebar-write">
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
</aside>

<style>
	.sidebar-left {
		width: 100%;
		max-width: var(--sidebar-left-width);
		flex-shrink: 0;

		/* Липкая панель со своим скроллом */
		position: sticky;
		top: var(--header-height);
		height: calc(100vh - var(--header-height));
		justify-self: start;
	}

	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow-y: auto;
	}

	.panel-burger {
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

	.feed-switcher {
		padding: 12px 10px;
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
	}

	.switch-button:hover {
		background: var(--bg-sidebar-hover);
	}

	.switch-button .icon {
		margin-right: 12px;
		border-radius: 6px;
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

	.switch-button.active {
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

	/* Свёрнутая бургером колонка; в режиме панели ниже это правило перекрывается */
	.sidebar-left--collapsed {
		display: none;
	}

	/* Выдвижная панель: у DTF колонка уходит ≤859px, на странице профиля — ≤1219px */
	@media (max-width: 859px) {
		.sidebar-left {
			position: fixed;
			top: 0;
			left: 0;
			width: 80%;
			max-width: 300px;
			height: 100%;
			z-index: 110;
			display: none;
		}

		.sidebar-left--open {
			display: block;
		}

		.tint {
			display: block;
			position: absolute;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100%;
			z-index: 1;
			background: var(--bg-tint-overlay);
		}

		.panel {
			position: relative;
			z-index: 2;
			background: var(--bg-main);
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

	@media (max-width: 719px) {
		.panel-burger,
		.panel-logo {
			padding-left: 16px;
		}

		.panel-logo .icon {
			width: 95px;
		}
	}
</style>
