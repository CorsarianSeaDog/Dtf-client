<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { progressSwipe, swipe, translate } from '$lib/swipe';
	import AboutSettings from './AboutSettings.svelte';
	import AccountSettings from './AccountSettings.svelte';
	import FeedSettings from './FeedSettings.svelte';
	import FieldControl from './FieldControl.svelte';
	import HelpSettings from './HelpSettings.svelte';
	import NotificationSettings from './NotificationSettings.svelte';
	import PinnedSubsiteSettings from './PinnedSubsiteSettings.svelte';
	import SettingsButton from './SettingsButton.svelte';
	import SettingsEmptyState from './SettingsEmptyState.svelte';
	import SettingsGroup from './SettingsGroup.svelte';
	import SettingsIcon from './SettingsIcon.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import { activeTheme } from '$lib/themes/index.svelte';
	import { themeSettingsSchema } from '$lib/themes/registry';
	import { activeThemeSettings } from '$lib/themes/settings.svelte';
	import { settings } from '$lib/storage/settings.svelte';
	import { getCurrentDevice, hasTouchInput, MOBILE_BREAKPOINT } from '$lib/themes/types';
	import type { SettingDevice } from '$lib/themes/types';
	import { pushSubstate, popSubstate } from '$lib/navigation';
	import { isNative } from '$lib/capacitor';
	import { dev } from '$app/env';
	import {
		buildDeclarativePages,
		buildNavSearchPages,
		getPageTitle,
		getRootNavigation,
		INTERFACE_SUBNAV,
		resolveInitialNav,
		toSearchFieldGroups,
		type DeclarativeFieldEntry,
		type RootNavItem,
		type SoloBackTarget,
		type SubNavItem
	} from './settingsConfig';
	import {
		buildSettingsSearchIndex,
		scrollAndHighlightSetting,
		searchSettings,
		type SettingsSearchItem
	} from './settingsSearch';

	/*
	 * Окно настроек в духе libadwaita с двухуровневой навигацией:
	 * - Уровень 1 (Главное меню): категории и пункты настроек (страницы или папки).
	 * - Уровень 2 (Подменю раздела): шапка сайдбара меняется на имя раздела со стрелкой назад.
	 * - Режим Solo: скрытый сайдбар для сфокусированного просмотра (например, ЧС из Ленты).
	 */
	let {
		onclose,
		page,
		section,
		solo = false,
		device,
		touch
	}: {
		onclose: () => void;
		page?: string;
		section?: string;
		solo?: boolean;
		device?: SettingDevice;
		touch?: boolean;
	} = $props();

	let detectedDevice = $state<SettingDevice>(getCurrentDevice());
	let detectedTouch = $state(hasTouchInput());

	$effect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
		const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
		const touchMql = window.matchMedia('(any-pointer: coarse)');
		const update = () => {
			detectedDevice = mql.matches ? 'mobile' : 'desktop';
			detectedTouch = hasTouchInput();
		};
		update();
		mql.addEventListener('change', update);
		touchMql.addEventListener('change', update);
		return () => {
			mql.removeEventListener('change', update);
			touchMql.removeEventListener('change', update);
		};
	});

	let currentDevice = $derived(device ?? detectedDevice);
	let currentTouch = $derived(touch ?? detectedTouch);
	const isDevVisible = $derived(dev || Boolean(settings.value.devMode));
	const rootNavigation = $derived(getRootNavigation(isDevVisible));

	let themeFields = $derived(themeSettingsSchema(activeTheme.id));
	let themeValues = $derived(activeThemeSettings());
	let declarativePages = $derived(
		buildDeclarativePages(themeFields, themeValues, currentDevice, settings.value.clientBadges, currentTouch)
	);
	// Страницы подменю, на которых для текущей темы и устройства нечего показать, из меню и поиска убираем
	let emptyPageIds = $derived(new Set(declarativePages.filter((p) => !p.entries.length && !p.soloLink).map((p) => p.pageId)));

	const initial = untrack(() => resolveInitialNav(page, section, isDevVisible));

	let activeFolderId = $state<string | null>(initial.folderId);
	// Слой подменю «Интерфейс» строится при первом заходе в папку, а не вместе с окном
	let folderSeen = $state(initial.folderId !== null);

	function setFolder(id: string | null) {
		activeFolderId = id;
		if (id !== null) folderSeen = true;
	}
	let selectedPageId = $state<string | null>(initial.pageId);
	let activeSection = $state<string | undefined>(initial.section);
	let animationsUnavailable = $derived(selectedPageId === 'animations' && emptyPageIds.has(selectedPageId));

	let soloByUser = $state<boolean>();
	let isSolo = $derived(!animationsUnavailable && (soloByUser ?? solo));
	let soloBackTarget = $state<SoloBackTarget | null>(null);

	// На узком экране: false — список разделов, true — открытая страница
	let openedByUser = $state<boolean>();
	let opened = $derived(!animationsUnavailable && (openedByUser ?? (selectedPageId !== null && (!!page || isSolo))));

	// Слайд страницы на узком экране: 0 — виден список, 1 — страница. Пока палец ведёт страницу, значение задаёт жест
	let slide = $state<number>();
	// То же для подменю: 0 — главная, 1 — подменю (слайд работает и на десктопе)
	let folderSlide = $state<number>();
	let dragging = $state(false);
	let windowEl = $state<HTMLElement>();
	let gestures = $derived(activeTheme.gestures && currentDevice === 'mobile');

	let scroller = $state<HTMLElement>();
	let faded = $state(false);
	let peeking = $state(false);
	let searchQuery = $state('');
	let searchInputEl = $state<HTMLInputElement>();
	let hasSearch = $derived(searchQuery.trim().length > 0);
	let showSearchResults = $derived(activeFolderId === null && !isSolo && hasSearch);
	let cancelPendingHighlight: (() => void) | undefined;

	let activeDeclarativePage = $derived(
		selectedPageId ? declarativePages.find((p) => p.pageId === selectedPageId) : undefined
	);

	let searchIndex = $derived(
		buildSettingsSearchIndex({
			navPages: buildNavSearchPages(rootNavigation).filter((nav) => !emptyPageIds.has(nav.pageId)),
			fieldGroups: toSearchFieldGroups(declarativePages),
			currentDevice,
			hasTouch: currentTouch,
			isDevVisible,
			isNativePlatform: isNative(),
			hasGestures: Boolean(activeTheme.gestures)
		})
	);

	let searchResults = $derived(showSearchResults ? searchSettings(searchIndex, searchQuery) : []);

	let folderTitle = $derived(
		showSearchResults ? 'Настройки' : activeFolderId === 'interface' ? 'Интерфейс' : 'Настройки'
	);

	let pageTitle = $derived(getPageTitle(selectedPageId, folderTitle, rootNavigation));

	function resetSolo() {
		resetBackSwipe();
		soloByUser = false;
		soloBackTarget = null;
	}

	function performMobileBack() {
		resetSolo();
		openedByUser = false;
	}

	function openPage(targetPageId: string, targetFolderId: string | null = activeFolderId) {
		cancelPendingHighlight?.();
		activeSection = undefined;
		resetSolo();
		setFolder(targetFolderId);
		selectedPageId = targetPageId;
		openedByUser = true;
		scroller?.scrollTo({ top: 0 });
		if (currentDevice === 'mobile') {
			pushSubstate(performMobileBack);
		}
	}

	function handleRootItemClick(item: RootNavItem) {
		if (item.type === 'folder') {
			cancelPendingHighlight?.();
			activeSection = undefined;
			resetSolo();
			setFolder(item.id);
			selectedPageId = null;
			openedByUser = false;
			pushSubstate(performBackToRoot);
			return;
		}
		openPage(item.id, null);
	}

	function handleSubItemClick(item: SubNavItem) {
		openPage(item.id, activeFolderId);
	}

	async function handleSearchResultClick(item: SettingsSearchItem) {
		cancelPendingHighlight?.();
		searchQuery = '';
		activeSection = undefined;
		resetSolo();
		setFolder(item.folderId ?? null);
		selectedPageId = item.pageId;
		openedByUser = true;
		if (currentDevice === 'mobile') {
			pushSubstate(performMobileBack);
		}
		await tick();
		cancelPendingHighlight = scrollAndHighlightSetting(scroller, item);
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && searchQuery) {
			e.stopPropagation();
			searchQuery = '';
		} else if (e.key === 'Enter' && searchResults.length > 0) {
			e.preventDefault();
			handleSearchResultClick(searchResults[0].item);
		}
	}

	function performBackToRoot() {
		resetSolo();
		activeFolderId = null;
		selectedPageId = null;
		openedByUser = false;
	}

	function openSoloPage(
		targetPageId: string,
		backTarget: SoloBackTarget,
		targetFolderId: string | null = null
	) {
		soloBackTarget = backTarget;
		soloByUser = true;
		selectedPageId = targetPageId;
		setFolder(targetFolderId);
		openedByUser = true;
		scroller?.scrollTo({ top: 0 });
		pushSubstate(performReturnFromSolo);
	}

	function performReturnFromSolo() {
		resetBackSwipe();
		if (soloBackTarget) {
			setFolder(soloBackTarget.folderId);
			selectedPageId = soloBackTarget.pageId;
			openedByUser = true;
			soloBackTarget = null;
		}
		soloByUser = false;
		scroller?.scrollTo({ top: 0 });
	}

	const backSteps = { solo: performReturnFromSolo, page: performMobileBack, folder: performBackToRoot };

	function goBack(step: keyof typeof backSteps) {
		if (!popSubstate()) backSteps[step]();
	}

	// Слой и ширина не меняются до конца жеста, включая подхват во время доезда
	let backLayer: 'window' | 'page' | 'folder' | 'solo' = 'window';
	let backWidth = 0;
	const back = progressSwipe({
		width: () => backWidth = windowEl?.clientWidth ?? innerWidth,
		set(p) {
			dragging = true;
			if (backLayer === 'window' && windowEl) windowEl.style.transform = translate(p * backWidth);
			else if (backLayer === 'page') slide = 1 - p;
			else if (backLayer === 'folder') folderSlide = 1 - p;
		},
		commit(p) {
			if (!p) return resetBackSwipe();
			// Вложенный шаг истории меняется асинхронно: нижний слой остаётся видимым до обработчика возврата
			if (backLayer === 'window') {
				// modalOut возвращает transform к центру; visibility дети могут переопределить. Уехавшее окно больше не рисуем
				if (windowEl) windowEl.style.display = 'none';
				onclose();
			} else goBack(backLayer);
		}
	});

	function resetBackSwipe() {
		back.destroy();
		slide = folderSlide = undefined;
		dragging = false;
		if (windowEl) windowEl.style.transform = '';
	}

	const backSwipe = swipe({
		mobile: true,
		start: () => !dragging || back.active,
		begin(dx) {
			if (dx <= 0) return false;
			backLayer = opened ? (isSolo && soloBackTarget ? 'solo' : 'page') : activeFolderId ? 'folder' : 'window';
			return back.begin();
		},
		move: back.move,
		end(x, v) {
			const finish = back.end(x, v);
			// Solo заменяет содержимое на месте: без второго слоя движение пока не рисуем
			if (backLayer === 'solo') finish();
			return finish;
		},
		grab: back.grab,
		destroy: resetBackSwipe
	});

	function toggleFade() {
		faded = !faded;
		peeking = false;
	}

	function handleEyeEnter(e: PointerEvent) {
		if (e.pointerType === 'touch') return;
		if (!faded) peeking = true;
	}

	function handleEyeLeave(e: PointerEvent) {
		if (e.pointerType === 'touch') return;
		peeking = false;
	}
</script>

{#snippet fieldEntries(entries: DeclarativeFieldEntry[])}
	{#each entries as entry (entry.field.key)}
		<FieldControl field={entry.field} value={entry.getValue()} onchange={entry.setValue} />
	{/each}
{/snippet}

<div
	class="window"
	data-view={opened ? 'page' : 'list'}
	data-solo={isSolo ? 'true' : 'false'}
	data-fade={faded ? 'active' : (peeking ? 'peek' : undefined)}
	data-gestures={gestures || undefined}
	data-dragging={dragging || undefined}
	style:--slide={slide ?? (opened ? 1 : 0)}
	style:--folder={folderSlide ?? (activeFolderId !== null ? 1 : 0)}
	bind:this={windowEl}
	{@attach gestures ? backSwipe : undefined}
>
	<div class="panes">
		<!-- Левая колонка (Сайдбар) -->
		<nav class="sidebar" aria-label="Разделы настроек">
			<header class="side-bar">
				<!-- Заголовки лежат друг на друге и перетекают по --folder вместе со слайдом списка -->
				<div class="side-titles">
					<h2 class="side-title side-title--root">Настройки</h2>
					<div class="side-title side-title--folder" aria-hidden={activeFolderId === null}>Интерфейс</div>
				</div>
				<button
					class="icon-button folder-back"
					type="button"
					aria-label="Назад к разделам"
					inert={activeFolderId === null}
					onclick={() => goBack('folder')}
				>
					<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M10 3L5 8l5 5" />
					</svg>
				</button>
			</header>

				<div class="nav-container">
					<!-- Уровень 1: заставка (только на мобильном), поиск и главное меню — одним прокручиваемым списком -->
					<div
						class="nav-layer"
						inert={activeFolderId !== null}
					>
						<div class="nav">
							<div class="hero">
								<svg class="hero__logo" width="123" height="50" aria-hidden="true"><use href="#redtf_logo"></use></svg>
								<h1 class="hero__title">Настройки</h1>
							</div>

							<div class="nav__body">
								<div class="search-box">
									<svg class="search-box__icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<circle cx="7" cy="7" r="4.5" />
										<path d="M10.5 10.5L13.5 13.5" />
									</svg>
									<input
										bind:this={searchInputEl}
										class="search-box__input"
										type="search"
										aria-label="Поиск по настройкам"
										placeholder="Поиск по настройкам"
										bind:value={searchQuery}
										onkeydown={handleSearchKeydown}
									/>
									{#if searchQuery}
										<button
											class="search-box__clear"
											type="button"
											aria-label="Очистить поиск"
											onclick={() => {
												searchQuery = '';
												searchInputEl?.focus();
											}}
										>
											<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
												<path d="M4 4l8 8M12 4l-8 8" />
											</svg>
										</button>
									{/if}
								</div>

								{#if showSearchResults}
									<!-- Результаты поиска в стиле Android (пункт / найденный сеттинг) -->
									{#if searchResults.length > 0}
										<div class="nav__list">
											{#each searchResults as match (match.item.id)}
												<button
													class="search-result"
													type="button"
													onclick={() => handleSearchResultClick(match.item)}
												>
													<SettingsIcon name={match.item.icon} />
													<span class="search-result__body">
														<span class="search-result__path">
															{match.item.path}{#if match.matchedOption} · {match.matchedOption}{/if}
														</span>
														<span class="search-result__title">{match.item.title}</span>
													</span>
												</button>
											{/each}
										</div>
									{:else}
										<p class="search-empty">Ничего не найдено</p>
									{/if}
								{:else}
									{#each rootNavigation as group (group.title)}
										<section class="nav__section">
											<h3 class="nav__group">{group.title}</h3>
											<div class="nav__list">
												{#each group.items as item (item.id)}
													<button
														class={['nav__item', { 'nav__item--active': item.id === selectedPageId && activeFolderId === null }]}
														type="button"
														aria-current={item.id === selectedPageId && activeFolderId === null ? 'page' : undefined}
														onclick={() => handleRootItemClick(item)}
													>
														<SettingsIcon name={item.icon} />
														<span class="nav__title">{item.title}</span>
														{#if item.type === 'folder'}
															<svg class="nav__arrow nav__arrow--folder" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
																<path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
															</svg>
														{/if}
													</button>
												{/each}
											</div>
										</section>
									{/each}
								{/if}
							</div>
						</div>
					</div>

				<!-- Уровень 2: Подменю выбранной папки -->
				<div
					class="nav-layer"
					inert={activeFolderId === null}
				>
					{#if folderSeen}
					<div class="nav">
						{#each INTERFACE_SUBNAV as group (group.title)}
							<section class="nav__section">
								<h3 class="nav__group">{group.title}</h3>
								<div class="nav__list">
									{#each group.items as item (item.id)}
										{#if (!item.device || item.device === currentDevice) && !emptyPageIds.has(item.id)}
											<button
												class={['nav__item', { 'nav__item--active': item.id === selectedPageId }]}
												type="button"
												aria-current={item.id === selectedPageId ? 'page' : undefined}
												onclick={() => handleSubItemClick(item)}
											>
												<SettingsIcon name={item.icon} />
												<span class="nav__title">{item.title}</span>
											</button>
										{/if}
									{/each}
								</div>
							</section>
						{/each}
					</div>
					{/if}
				</div>
			</div>
		</nav>

		<!-- Правая колонка (Контент) -->
		<main class="content">
			<header class="bar">
				{#if isSolo && soloBackTarget}
					<!-- В соло-режиме с возвратом отображается только одна кнопка и на мобиле, и на десктопе -->
					<button class="solo-back-button" type="button" onclick={() => goBack('solo')}>
						<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M10 3L5 8l5 5" />
						</svg>
						<span>Назад к: {soloBackTarget.title}</span>
					</button>
				{:else}
					<!-- Кнопка «Назад» для мобильного режима -->
					<button
						class="icon-button back"
						type="button"
						aria-label="Назад к разделам"
						onclick={() => goBack('page')}
					>
						<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
							<path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</button>

					<!-- Кнопка возврата из Solo-режима на десктопе (когда открыли solo снаружи без цели возврата) -->
					{#if isSolo}
						<button class="solo-back-button solo-back-button--menu" type="button" onclick={() => goBack('solo')}>
							<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M10 3L5 8l5 5" />
							</svg>
							<span>Показать меню</span>
						</button>
					{/if}
				{/if}
			</header>

			<div class="scroller" bind:this={scroller}>
				{#if selectedPageId && !animationsUnavailable}
					<div class="page">
						<h2 class="page__title">{pageTitle}</h2>

						{#if selectedPageId === 'account'}
							<AccountSettings />
						{:else if selectedPageId === 'notifications'}
							<NotificationSettings />
						{:else if selectedPageId === 'ignored'}
							{#await import('./IgnoredSettings.svelte') then { default: Page }}
								<Page />
							{/await}
						{:else if selectedPageId === 'pinned'}
							<PinnedSubsiteSettings />
						{:else if selectedPageId === 'feed'}
							<FeedSettings
								onopencontent={() =>
									openSoloPage(
										'interface-content',
										{ folderId: null, pageId: 'feed', title: 'Моя лента' },
										'interface'
									)}
							/>
						{:else if selectedPageId === 'sources'}
							{#await import('$lib/components/sources/SourcesSettings.svelte') then { default: Page }}
								<Page />
							{/await}
						{:else if selectedPageId === 'network'}
							{#await import('./ProxySettings.svelte') then { default: Page }}
								<Page />
							{/await}
						{:else if selectedPageId === 'stats'}
							{#await import('./StatsSettings.svelte') then { default: Page }}
								<Page />
							{/await}
						{:else if selectedPageId === 'help'}
							<HelpSettings onopensupporters={() => { selectedPageId = 'supporters'; scroller?.scrollTo({ top: 0 }); }} />
						{:else if selectedPageId === 'supporters'}
							{#await import('./SupportersSettings.svelte') then { default: Page }}
								<Page />
							{/await}
						{:else if selectedPageId === 'about'}
							<AboutSettings section={activeSection} />
						{:else if selectedPageId === 'debug' && isDevVisible}
							{#await import('./DebugSettings.svelte') then { default: Page }}
								<Page ondisable={() => { selectedPageId = null; goBack('page'); }} />
							{/await}
						{:else if selectedPageId === 'reactions'}
							{#await import('./ReactionsSettings.svelte') then { default: Page }}
								<Page touch={currentTouch} />
							{/await}
						{:else if selectedPageId === 'app-icon'}
							{#await import('./AppIconSettings.svelte') then { default: Page }}
								<Page />
							{/await}
						{:else if activeDeclarativePage}
							{#if activeDeclarativePage.entries.length > 0}
								{#if activeDeclarativePage.cardsLayout}
									<div class="settings-cards">
										{@render fieldEntries(activeDeclarativePage.entries)}
									</div>
								{:else}
									{@render fieldEntries(activeDeclarativePage.entries)}
								{/if}
							{:else if activeDeclarativePage.emptyHint}
								<p class="section-hint">{activeDeclarativePage.emptyHint}</p>
							{/if}

							{#if activeDeclarativePage.soloLink}
								{@const link = activeDeclarativePage.soloLink}
								<SettingsGroup title={link.groupTitle}>
									<SettingsRow title={link.title} subtitle={link.subtitle}>
										<SettingsButton
											variant="suggested"
											onclick={() => openSoloPage(link.targetPageId, link.backTarget, link.targetFolderId ?? null)}
										>
											<span class="btn-text">
												{link.buttonLabel}
												<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
													<path d="M6 3l5 5-5 5" />
												</svg>
											</span>
										</SettingsButton>
									</SettingsRow>
								</SettingsGroup>
							{/if}
						{/if}
					</div>
				{:else}
					<!-- Ни один раздел не выбран — плейсхолдер по центру -->
					<SettingsEmptyState text={activeFolderId ? 'Выберите подраздел в меню слева' : 'Выберите раздел в меню слева'} />
				{/if}
			</div>
		</main>
	</div>

	<!-- Кнопка скрытия окна (fade/peek) -->
	<button
		class={['icon-button', 'peek', { 'peek--active': faded }]}
		type="button"
		aria-label={faded ? 'Показать настройки' : 'Скрыть настройки'}
		aria-pressed={faded}
		onclick={toggleFade}
		onpointerenter={handleEyeEnter}
		onpointerleave={handleEyeLeave}
	>
		<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M1.5 8C3.5 2 12.5 2 14.5 8C12.5 14 3.5 14 1.5 8z" />
			<circle cx="8" cy="8" r="2" />
		</svg>
	</button>

	<!-- Кнопка закрытия окна -->
	<button class="icon-button close" type="button" aria-label="Закрыть настройки" onclick={onclose}>
		<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
			<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
		</svg>
	</button>
</div>

<style>
	/* Окно в духе libadwaita: светлое, карточки приподняты мягкими тенями, отступы широкие */
	.window {
		--st-bg: var(--theme-st-bg, #fafafb);
		--st-side: var(--theme-st-side, #f3f3f5);
		--st-side-border: var(--theme-st-side-border, rgba(0, 0, 6, 0.07));
		--st-header: var(--theme-st-header, 48px);
		--st-card: var(--theme-st-card, #fff);
		--st-card-shadow-soft: var(--theme-st-card-shadow-soft, 0 0 0 1px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.05));
		--st-card-shadow: var(--theme-st-card-shadow, 0 0 0 1px rgba(0, 0, 0, 0.05), 0 1px 3px 1px rgba(0, 0, 0, 0.07), 0 2px 6px 2px rgba(0, 0, 0, 0.03));
		--st-separator: var(--theme-st-separator, rgba(0, 0, 0, 0.06));
		--st-hover: var(--theme-st-hover, rgba(0, 0, 0, 0.035));
		--st-button: var(--theme-st-button, rgba(0, 0, 0, 0.05));
		--st-button-hover: var(--theme-st-button-hover, rgba(0, 0, 0, 0.09));
		--st-field: var(--theme-st-field, rgba(0, 0, 0, 0.045));
		--st-track: var(--theme-st-track, #d6d6d6);
		--st-text: var(--theme-st-text, var(--text-primary, #1e1e1e));
		--st-muted: var(--theme-st-muted, var(--text-muted, #66646b));
		--st-accent: var(--theme-st-accent, var(--color-blue, #3584e4));
		--st-danger: var(--theme-st-danger, #c01c28);
		--st-ok: var(--theme-st-ok, #1f8a3b);
		--st-warn: var(--theme-st-warn, #a16207);
		--st-nav-active-bg: var(--theme-st-nav-active-bg, var(--st-card));
		--st-nav-active-shadow: var(--theme-st-nav-active-shadow, var(--st-card-shadow-soft));

		position: relative;
		container-type: inline-size;
		width: min(1040px, 100%);
		height: min(720px, calc(100dvh - 72px));
		overflow: hidden;
		border-radius: 18px;
		background: var(--st-bg);
		box-shadow: 0 1px 3px 1px rgba(0, 0, 0, 0.07), 0 12px 48px rgba(0, 0, 0, 0.2);
		color: var(--st-text);
		font-family: var(--font-family, system-ui, sans-serif);
		font-size: 15px;
		line-height: 22px;
	}

	/* Тёмная тема окна настроек (Libadwaita Dark) */
	:global(html[data-theme-mode='dark']) .window {
		--st-bg: var(--theme-st-bg, #242424);
		--st-side: var(--theme-st-side, #2e2e2e);
		--st-side-border: var(--theme-st-side-border, rgba(255, 255, 255, 0.08));
		--st-card: var(--theme-st-card, #303030);
		--st-card-shadow-soft: var(--theme-st-card-shadow-soft, 0 0 0 1px rgba(255, 255, 255, 0.07), 0 1px 2px rgba(0, 0, 0, 0.2));
		--st-card-shadow: var(--theme-st-card-shadow, 0 0 0 1px rgba(255, 255, 255, 0.07), 0 1px 3px 1px rgba(0, 0, 0, 0.3));
		--st-separator: var(--theme-st-separator, rgba(255, 255, 255, 0.08));
		--st-hover: var(--theme-st-hover, rgba(255, 255, 255, 0.06));
		--st-button: var(--theme-st-button, rgba(255, 255, 255, 0.08));
		--st-button-hover: var(--theme-st-button-hover, rgba(255, 255, 255, 0.12));
		--st-field: var(--theme-st-field, rgba(255, 255, 255, 0.06));
		--st-track: var(--theme-st-track, #4a4a4d);
		--st-muted: var(--theme-st-muted, #9a9996);
		--st-text: var(--theme-st-text, #ffffff);
		--st-accent: var(--theme-st-accent, var(--color-blue, #78aeed));
		--st-danger: var(--theme-st-danger, #e01b24);
		--st-ok: var(--theme-st-ok, #2ec27e);
		--st-warn: var(--theme-st-warn, #f5c542);
		--st-nav-active-bg: var(--theme-st-nav-active-bg, rgba(255, 255, 255, 0.12));
		--st-nav-active-shadow: var(--theme-st-nav-active-shadow, 0 0 0 1px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.25));
		box-shadow: 0 1px 3px 1px rgba(0, 0, 0, 0.4), 0 12px 48px rgba(0, 0, 0, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--st-text);
	}


	.panes {
		display: flex;
		height: 100%;
		overflow: hidden;
	}

	/* Боковая панель libadwaita: аккуратная, 260px, спокойный тон */
	.sidebar {
		display: flex;
		flex: none;
		flex-direction: column;
		width: 260px;
		background: var(--st-side);
		border-right: 1px solid var(--st-side-border);
		transition:
			margin-left 280ms var(--ease-smooth, cubic-bezier(0.2, 0, 0, 1)),
			opacity 220ms ease,
			transform 280ms var(--ease-smooth, cubic-bezier(0.2, 0, 0, 1));
	}

	/* В режиме Solo сайдбар плавно убирается влево */
	.window[data-solo='true'] .sidebar {
		margin-left: -260px;
		transform: translateX(-100%);
		opacity: 0;
		pointer-events: none;
	}

	/* Шапка сайдбара */
	.side-bar {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		height: var(--st-header);
		padding: 0 48px;
	}

	.side-titles {
		display: grid;
		min-width: 0;
	}

	.side-title {
		grid-area: 1 / 1;
		overflow: hidden;
		min-width: 0;
		font-size: 15px;
		font-weight: 700;
		line-height: 22px;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: var(--slide-move);
	}

	.side-title--root {
		opacity: calc(1 - var(--folder));
	}

	.side-title--folder {
		opacity: var(--folder);
	}

	/* Круглая кнопка возврата из подменю в шапке сайдбара: проявляется вместе со слайдом */
	.icon-button.folder-back {
		position: absolute;
		left: 12px;
		top: calc((var(--st-header) - 32px) / 2);
		width: 32px;
		height: 32px;
		opacity: var(--folder);
		transform: scale(calc(0.8 + 0.2 * var(--folder)));
		transition: var(--slide-move), background-color var(--duration-base);
	}

	.search-box {
		position: relative;
		display: flex;
		align-items: center;
		margin: 5px 4px 10px;
	}

	/* Заставка главной настроек: только на мобильном, прокручивается вместе со списком */
	.hero {
		display: none;
	}

	.hero__logo {
		width: 112px;
		height: auto;
	}

	.hero__title {
		font-size: 46px;
		font-weight: 300;
		letter-spacing: -0.02em;
		line-height: 52px;
	}

	.search-box__icon {
		position: absolute;
		left: 11px;
		color: var(--st-muted);
		pointer-events: none;
	}

	.search-box__input {
		width: 100%;
		min-width: 0;
		height: 34px;
		padding: 0 30px 0 32px;
		border: 1px solid transparent;
		border-radius: 10px;
		background: var(--st-field);
		color: var(--st-text);
		font: inherit;
		font-size: 13px;
		outline: none;
		appearance: none;
		transition: border-color var(--duration-base), background-color var(--duration-base);
	}

	.search-box__input::-webkit-search-cancel-button {
		appearance: none;
	}

	.search-box__input::placeholder {
		color: var(--st-muted);
	}

	.search-box__input:focus {
		border-color: var(--st-accent);
		background: var(--st-card);
	}

	.search-box__clear {
		position: absolute;
		right: 6px;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		color: var(--st-muted);
		cursor: pointer;
		transition: background-color var(--duration-base), color var(--duration-base);
	}

	.search-box__clear:hover {
		background: var(--st-button);
		color: var(--st-text);
	}

	.search-box__clear:focus-visible {
		outline: 2px solid var(--st-accent);
		outline-offset: 1px;
	}

	.search-result {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 9px 12px;
		border-radius: 10px;
		color: var(--st-text);
		text-align: left;
		cursor: pointer;
		transition: background-color var(--duration-base);
	}

	.search-result:hover {
		background: color-mix(in srgb, currentColor 6%, transparent);
	}

	.search-result:active {
		background: color-mix(in srgb, currentColor 14%, transparent);
	}

	.search-result:focus-visible {
		outline: 2px solid var(--st-accent);
		outline-offset: -2px;
	}

	.search-result__body {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		gap: 1px;
	}

	.search-result__path {
		overflow: hidden;
		color: var(--st-muted);
		font-size: 11px;
		line-height: 15px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.search-result__title {
		overflow: hidden;
		font-size: 13.5px;
		font-weight: 500;
		line-height: 18px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.search-empty {
		margin: 24px 12px;
		color: var(--st-muted);
		font-size: 13px;
		text-align: center;
	}

	/* Контейнер слоев навигации */
	.nav-container {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	/* Слайд слоёв: нижний уходит влево на треть, верхний выезжает справа. Положение --p: 0 — нижний, 1 — верхний.
	   Закрытый слой не получает фокус (inert) */
	.nav-container {
		--p: var(--folder);
		--layer-bg: var(--st-side);
	}

	.nav-layer {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		transition: var(--slide-move);
	}

	.nav-layer:first-child {
		transform: translateX(calc(var(--p) * -30%));
	}

	.nav-layer:nth-child(2) {
		background: var(--layer-bg);
		box-shadow: -12px 0 32px rgba(0, 0, 0, calc(0.18 * var(--p)));
		transform: translateX(calc((1 - var(--p)) * 100%));
	}

	/* Палец и пружинный доезд сами рисуют положение: CSS не должен догонять каждый их кадр */
	.window[data-dragging] :is(.nav-layer, .side-title, .folder-back, .sidebar, .content) {
		transition: none;
	}

	.nav {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 6px 14px;
	}

	.nav__body {
		display: contents;
	}

	/* Подписи категорий: спокойные, приглушенные, без капса */
	.nav__group {
		margin: 0;
		padding: 16px 14px 4px;
		color: var(--st-muted);
		font-size: 13px;
		font-weight: 400;
		line-height: 18px;
	}

	.nav__section:first-of-type .nav__group {
		padding-top: 2px;
	}

	.nav__list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* Строка пункта меню: компактная, без тяжелых подложек */
	.nav__item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 38px;
		padding: 0 12px;
		border-radius: 10px;
		color: color-mix(in srgb, var(--st-text) 80%, transparent);
		font-size: 14px;
		text-align: left;
		cursor: pointer;
		transition:
			background-color var(--duration-base),
			box-shadow var(--duration-base),
			color var(--duration-base);
	}

	.nav__title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nav__item:hover {
		color: var(--st-text);
		background: color-mix(in srgb, currentColor 6%, transparent);
	}

	.nav__item:active {
		background: color-mix(in srgb, currentColor 14%, transparent);
	}

	/* Активный пункт меню — спокойная Adwaita карточка */
	.nav__item--active,
	.nav__item--active:hover {
		background: var(--st-nav-active-bg);
		box-shadow: var(--st-nav-active-shadow);
		color: var(--st-text);
		font-weight: 500;
	}

	.nav__item--active :global(.glyph) {
		color: var(--st-accent);
	}

	.nav__item:focus-visible {
		outline: 2px solid var(--st-accent);
		outline-offset: -2px;
	}

	/* Стрелочка папки: деликатная, приглушённая */
	.nav__arrow--folder {
		flex: none;
		color: var(--st-muted);
		opacity: 0.45;
		transition: transform var(--duration-base), opacity var(--duration-base);
	}

	.nav__item:hover .nav__arrow--folder {
		opacity: 0.85;
		transform: translateX(2px);
	}

	/* Контентная панель справа */
	.content {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: none;
		height: var(--st-header);
		padding: 0 20px;
	}

	.solo-back-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 12px;
		border-radius: 16px;
		background: var(--st-button);
		color: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--duration-base);
	}

	.solo-back-button:hover {
		background: var(--st-button-hover);
	}

	.solo-back-button:focus-visible {
		outline: 2px solid var(--st-accent);
		outline-offset: 2px;
	}

	.scroller {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.page {
		width: 100%;
		max-width: 680px;
		margin: 0 auto;
		padding: 0 40px 48px;
		box-sizing: border-box;
		animation: pageFadeIn 180ms var(--ease-smooth, cubic-bezier(0.2, 0, 0, 1));
	}

	@keyframes pageFadeIn {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.page__title {
		margin-bottom: 28px;
		font-size: 34px;
		font-weight: 300;
		line-height: 42px;
	}

	.settings-cards {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 36px;
	}

	.settings-cards > :global(.group) {
		margin-bottom: 0;
	}

	.section-hint {
		margin: 8px 4px 16px;
		color: var(--st-muted);
		font-size: 14px;
	}

	.btn-text {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.icon-button {
		display: grid;
		flex: none;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		color: inherit;
		cursor: pointer;
		transition: background-color var(--duration-base), transform var(--duration-base);
	}

	.icon-button:hover {
		background: var(--st-button);
	}

	.icon-button:active {
		transform: scale(0.95);
	}

	.icon-button:focus-visible {
		outline: 2px solid var(--st-accent);
		outline-offset: 2px;
	}

	.icon-button.back {
		display: none;
	}

	.close {
		position: absolute;
		top: calc((var(--st-header) - 36px) / 2);
		right: 12px;
	}

	.peek {
		position: absolute;
		top: calc((var(--st-header) - 36px) / 2);
		right: 54px;
		z-index: 2;
		transition:
			background-color var(--duration-base),
			box-shadow var(--duration-base),
			color var(--duration-base);
	}

	.peek--active {
		background: var(--st-card);
		color: var(--st-text);
		box-shadow:
			var(--st-card-shadow);

		pointer-events: auto;
	}

	.peek--active:hover {
		background: var(--st-button-hover);
	}

	.peek--active:active {
		background: var(--st-button);
	}

	/* Широкое окно */
	@container (min-width: 720px) {
		.side-bar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 20px 10px 10px 18px;
			height: auto;
			min-height: 62px;
			box-sizing: border-box;
		}

		.icon-button.folder-back {
			position: static;
			margin-left: auto;
			margin-right: 0;
			flex: none;
		}

		.side-title {
			font-size: 22px;
			font-weight: 300;
			line-height: 32px;
		}
	}

	/* Узкое окно: двухшаговый режим drill-down */
	@container (max-width: 719px) {
		.panes {
			position: relative;
		}

		/* Список и страница лежат друг на друге: страница выезжает справа, список чуть уходит влево.
		   Положение задаёт --slide (0 — список, 1 — страница), невидимый слой прячется после слайда */
		.sidebar,
		.content {
			position: absolute;
			inset: 0;
			visibility: hidden;
			transition:
				var(--slide-move),
				visibility 0s linear 300ms;
		}

		.window[data-view='list'] .sidebar,
		.window[data-view='page'] .content,
		.window[data-dragging] .sidebar {
			visibility: visible;
			transition-delay: 0s;
		}

		.nav-container {
			--layer-bg: var(--st-bg);
		}

		.sidebar {
			width: auto;
			background: none;
			border: none;
			transform: translateX(calc(var(--slide) * -30%));
		}

		.content {
			background: var(--st-bg);
			box-shadow: -12px 0 32px rgba(0, 0, 0, calc(0.18 * var(--slide)));
			transform: translateX(calc((1 - var(--slide)) * 100%));
		}

		.window[data-solo='true'] .sidebar {
			margin-left: 0;
			transform: translateX(calc(var(--slide) * -30%));
			opacity: 1;
			pointer-events: auto;
		}

		.window[data-gestures],
		.window[data-gestures] :is(.scroller, .nav) {
			touch-action: pan-y pinch-zoom;
		}

		.hero {
			position: sticky;
			top: 0;
			z-index: 0;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 18px;
			min-height: 30dvh;
			margin-top: -12px;
			text-align: center;
		}

		.nav__body {
			position: relative;
			z-index: 1;
			display: flex;
			flex-direction: column;
			gap: 20px;
			margin: -20px -16px 0;
			padding: 20px 16px 0;
			background: var(--st-bg);
		}

		.side-title--root {
			visibility: hidden;
		}

		.search-box {
			margin: 0;
		}

		.nav {
			flex: 1;
			gap: 20px;
			padding: 12px 16px 24px;
		}

		.nav__group,
		.nav__section:first-of-type .nav__group {
			padding: 0 4px 8px;
		}

		.nav__list {
			display: block;
			overflow: hidden;
			border-radius: 12px;
			background: var(--st-card);
			box-shadow: var(--st-card-shadow-soft);
		}

		.nav__item {
			min-height: 48px;
			padding: 0 16px;
			border-radius: 0;
		}

		.nav__item:not(:first-child) {
			border-top: 1px solid var(--st-separator);
		}

		.search-box__input {
			height: 38px;
			border-radius: 12px;
			font-size: 14px;
		}

		.search-result {
			min-height: 54px;
			padding: 10px 16px;
			border-radius: 0;
		}

		.search-result:not(:first-child) {
			border-top: 1px solid var(--st-separator);
		}

		.search-result__path {
			font-size: 12px;
			line-height: 16px;
		}

		.search-result__title {
			font-size: 15px;
			line-height: 20px;
			white-space: normal;
		}

		.nav__arrow--folder {
			display: block;
			opacity: 0.7;
		}

		.nav__item--active,
		.nav__item--active:hover {
			background: none;
			box-shadow: none;
		}

		.nav__item--active :global(.glyph) {
			color: inherit;
		}

		.icon-button.back {
			display: grid;
			margin-left: -8px;
		}

		.solo-back-button--menu {
			display: none;
		}

		.solo-back-button {
			margin-left: -4px;
		}

		.bar {
			padding: 0 16px;
		}

		.page {
			padding: 20px 20px 32px;
		}

		.page__title {
			margin-bottom: 20px;
			font-size: 30px;
			line-height: 38px;
		}
	}

	/* Мобильный экран телефона: на весь экран */
	@media (max-width: 719px) {
		.window {
			position: fixed;
			inset: 0;
			width: auto;
			height: auto;
			padding-top: env(safe-area-inset-top);
			padding-bottom: env(safe-area-inset-bottom);
			border-radius: 0;
			box-shadow: none;
		}

		.close,
		.peek {
			top: calc(env(safe-area-inset-top, 0px) + (var(--st-header) - 36px) / 2);
		}
	}

	/* На телефоне в тёмной теме фон темнее, карточки на нём выделяются */
	@media (max-width: 719px) {
		:global(html[data-theme-mode='dark']) .window {
			--st-bg: color-mix(in srgb, var(--theme-st-bg, #242424) 50%, #000);
		}
	}

	/* Ползунок ползунка и эффекты полупрозрачности */
	.panes,
	.close {
		transition: opacity var(--fade);
	}

	.window {
		--slide-move:
			transform 300ms var(--ease-smooth, cubic-bezier(0.2, 0, 0, 1)),
			opacity 300ms var(--ease-smooth, cubic-bezier(0.2, 0, 0, 1)),
			box-shadow 300ms var(--ease-smooth, cubic-bezier(0.2, 0, 0, 1));
		--fade: 0.45s cubic-bezier(0.2, 0, 0, 1);
		transition:
			background-color var(--fade),
			border-color var(--fade),
			box-shadow var(--fade);
	}

	.window[data-fade='peek'] {
		background-color: color-mix(in srgb, var(--st-bg) 35%, transparent);
		box-shadow: 0 1px 3px 1px rgba(0, 0, 0, 0.02), 0 6px 24px rgba(0, 0, 0, 0.06);
	}

	.window[data-fade='peek'] .panes,
	.window[data-fade='peek'] .close {
		opacity: 0.35;
	}

	.window[data-fade='active'] {
		background-color: transparent;
		border-color: transparent;
		box-shadow: none;
		pointer-events: none;
	}

	.window[data-fade='active'] .panes,
	.window[data-fade='active'] .close {
		opacity: 0;
		pointer-events: none;
	}

	.window :global([data-slider-peer]) {
		transition: opacity var(--fade);
	}

	.window:global([data-slider-drag]) {
		background-color: transparent;
		border-color: transparent;
		box-shadow: none;
	}

	:global(.window[data-slider-drag] .scroller) {
		scrollbar-color: transparent transparent;
	}

	.window:global([data-slider-drag] [data-slider-peer]) {
		opacity: 0;
		pointer-events: none;
	}

	/* Вспышка подсветки при переходе из поиска */
	.window :global(.setting-search-highlight) {
		animation: settingFlash 1.8s var(--ease-smooth, cubic-bezier(0.2, 0, 0, 1));
	}

	@keyframes settingFlash {
		0% {
			background-color: transparent;
			box-shadow: inset 0 0 0 2px transparent;
		}
		15% {
			background-color: color-mix(in srgb, var(--st-accent) 16%, transparent);
			box-shadow: inset 0 0 0 2px var(--st-accent);
		}
		60% {
			background-color: color-mix(in srgb, var(--st-accent) 10%, transparent);
			box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--st-accent) 55%, transparent);
		}
		100% {
			background-color: transparent;
			box-shadow: inset 0 0 0 2px transparent;
		}
	}
</style>
