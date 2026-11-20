<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { currentUser } from '$lib/api/currentUser.svelte';
	import { feed } from '$lib/feed.svelte';
	import { scrollBehavior } from '$lib/motion';
	import { closeOverlay, openFeed } from '$lib/navigation';
	import { authorMenuItems, runAuthorAction, shareLink, sharePost, startWriting, tagMenuItems, tagTitle, toggleIgnoredTag } from '../dtf2022/actions.svelte';
	import SearchBar from '../dtf2022/SearchBar.svelte';
	import { sidebar } from '../dtf2022/sidebar.svelte';
	import Popover from '../dtf2022/ui/Popover.svelte';
	import type { ThemeComponents } from '../contract';
	import { topToggle, watchBarScroll } from './barScroll';
	import { themeSettings } from './themeSettings.svelte';

	let { screen, title, post, profile, tag }: ThemeComponents['ScreenBar'] = $props();

	/** Экраны без панели: от неё остаётся полоска безопасной зоны, чтобы содержимое не уходило под системную строку */
	let bare = $derived(screen === 'notifications' || screen === 'account' || screen === 'messages');
	/** Уведомления и сообщения лежат на карточке --bg-card, а не прямо на фоне страницы */
	let bareCard = $derived(screen === 'notifications' || screen === 'messages');
	let isMe = $derived(!!profile && currentUser.value?.id === profile.id);
	let menuOpen = $state(false);

	// Заголовок поста появляется, когда его собственный заголовок ушёл за верх экрана
	let postTitleShown = $state(false);
	let shownTitle = $derived(screen === 'post' ? (postTitleShown ? post?.title : undefined) : (profile?.name ?? (tag ? `#${tagTitle(tag)}` : title)));

	/** Нажатие на пустое место панели — в начало экрана, повторное на том же экране — обратно; кнопки и меню остаются при своём */
	let pageKey = $derived(
		`${page.state.overlays?.findLast((o) => o.type !== 'lightbox')?.id ?? page.url?.pathname}:${page.url?.search}${page.url?.hash}:${screen === 'feed' ? `${feed.current}:${feed.sorting}:${feed.refreshCount}` : (post?.id ?? profile?.id ?? tag ?? '')}`
	);
	let lastPageKey: string | undefined;
	$effect(() => {
		if (pageKey === lastPageKey) return;
		lastPageKey = pageKey;
		topToggle.reset();
	});

	function toTop(event: MouseEvent) {
		if ((event.target as HTMLElement).closest('button, a, input, [role]:not(.screen-bar)')) return;
		const top = topToggle.tap(scrollY);
		if (top !== undefined) scrollTo({ top, behavior: scrollBehavior() });
	}

	/** Экран знает, что у него есть панель: от этого зависит высота шапки внутри него (`--header-height`) */
	function markScreen(bar: HTMLElement) {
		const owner = bar.parentElement;
		if (!owner) return;
		owner.dataset.screenBar = bare ? 'bare' : 'full';
		return () => delete owner.dataset.screenBar;
	}

	/** Скрытие при прокрутке: слушатель один на окно, панели только просят его включить */
	function hideOnScroll() {
		if (!bare && themeSettings.hideTopBarOnScroll) return watchBarScroll();
	}

	/** Один наблюдатель за заголовком поста; сам заголовок рисуется после загрузки, поэтому ищем его по кадрам */
	function watchPostTitle(bar: HTMLElement) {
		if (screen !== 'post' || !post || !themeSettings.postTitleInBar) return;
		let observer: IntersectionObserver | undefined;
		let frame = 0;
		let tries = 0;
		const find = () => {
			const heading = bar.parentElement?.querySelector('.post-block--title');
			if (!heading) {
				if (tries++ < 60) frame = requestAnimationFrame(find);
				return;
			}
			observer = new IntersectionObserver(([entry]) => {
				postTitleShown = !entry.isIntersecting && entry.boundingClientRect.bottom < entry.rootBounds!.top;
			}, { rootMargin: `-${Math.round(bar.getBoundingClientRect().height)}px 0px 0px 0px` });
			observer.observe(heading);
		};
		find();
		return () => {
			cancelAnimationFrame(frame);
			observer?.disconnect();
		};
	}
</script>

{#snippet icon(name: string)}
	<svg class="icon" width="24" height="24" aria-hidden="true"><use href="#{name}"></use></svg>
{/snippet}

{#snippet control(label: string, name: string, action: () => void, expanded?: boolean, popup?: 'listbox')}
	<button class="control" type="button" aria-label={label} aria-expanded={expanded} aria-haspopup={popup}
		onclick={action}>
		{@render icon(name)}
	</button>
{/snippet}

<div class={['screen-bar', { 'screen-bar--bare': bare, 'screen-bar--card': bareCard }]} role={bare ? 'presentation' : 'navigation'} aria-label={bare ? undefined : 'Верхняя панель'}
	{@attach markScreen} {@attach hideOnScroll} {@attach watchPostTitle}>
	{#if !bare}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="surface" onclick={toTop}>
			{#if screen === 'feed'}
				{@render control(sidebar.open ? 'Закрыть меню' : 'Открыть меню', 'v_menu', () => sidebar.toggle(), sidebar.open)}
			{:else if page.state.overlays?.length}
				{@render control('Назад', 'v_arrow_left', closeOverlay)}
			{:else}
				<a class="control" href={resolve('/')} aria-label="Назад в ленту" onclick={openFeed}>
					{@render icon('v_arrow_left')}
				</a>
			{/if}

			<span class={['title', { 'title--shown': !!shownTitle }]}>{shownTitle}</span>

			<div class="actions">
				{#if screen === 'feed'}
					<SearchBar>
						{#snippet trigger(expanded, toggle)}
							{@render control('Поиск', 'v_search', () => { sidebar.close(); toggle(); }, expanded)}
						{/snippet}
					</SearchBar>
					{@render control('Написать пост', 'v_pen', () => { sidebar.close(); startWriting(); })}
				{:else if screen === 'post' && post && !post.isDraft}
					{@const shared = post}
					{@render control('Поделиться постом', 'v_share', () => sharePost(shared))}
				{:else if screen === 'tag' && tag}
					{@const current = tag}
					<Popover bind:open={menuOpen} items={tagMenuItems(current)} onselect={() => toggleIgnoredTag(current)} width="max-content" label="Действия с тегом">
						{@render control('Больше', 'v_etc', () => (menuOpen = !menuOpen), menuOpen, 'listbox')}
					</Popover>
				{:else if screen === 'profile' && profile}
					{@const shared = profile}
					{#if isMe}
						{@render control('Написать пост', 'v_pen', startWriting)}
					{/if}
					{@render control('Поделиться профилем', 'v_share', () => shareLink(shared.url ?? `https://dtf.ru/u/${shared.id}`, shared.name))}
					{#if !isMe}
						<Popover
							bind:open={menuOpen}
							items={authorMenuItems(shared, { noun: '', blocked: !!currentUser.value && !!shared.isMuted })}
							onselect={(action) => runAuthorAction(action, shared)}
							width="max-content"
							label="Действия с профилем"
						>
							{@render control('Больше', 'v_etc', () => (menuOpen = !menuOpen), menuOpen, 'listbox')}
						</Popover>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.screen-bar {
		display: none;
		align-self: stretch;
		/* Переход и «заморозка» ограничивают высоту экрана: длинное содержимое сжало бы панель (и полоску безопасной зоны) до нуля */
		flex-shrink: 0;
		position: sticky;
		top: 0;
		z-index: 100;
		height: var(--screen-bar-height);
		pointer-events: none;
		transition: transform var(--duration-base) cubic-bezier(0.165, 0.84, 0.44, 1);
	}

	.screen-bar--bare {
		height: env(safe-area-inset-top, 0px);
		background: var(--bg-main);
	}

	.screen-bar--card {
		align-self: center;
		width: 100%;
		max-width: var(--content-width);
		background: var(--bg-card);
	}

	@media (max-width: 719px) {
		:global(:root[data-mobile-top-bar]) .screen-bar {
			display: block;
		}

		/* Панель уезжает за верх при прокрутке вниз (настройка); на переходах и свайпе она на месте */
		:global(:root[data-bar-hidden]:not([data-transitioning], [data-swiping])) .screen-bar:not(.screen-bar--bare) {
			transform: translateY(-100%);
		}
	}

	.surface {
		/* Иконка отстоит от края окна на 16px: кнопка шире иконки на 11px с каждой стороны */
		--screen-bar-padding-x: calc(16px - (var(--mobile-bar-button-size) - 24px) / 2);
		--search-overlay-background: var(--bg-card);
		--search-overlay-left: max(16px, env(safe-area-inset-left, 0px));
		--search-overlay-right: max(16px, env(safe-area-inset-right, 0px));
		position: relative;
		display: flex;
		align-items: center;
		gap: 4px;
		height: 100%;
		padding: env(safe-area-inset-top, 0px) max(var(--screen-bar-padding-x), env(safe-area-inset-right, 0px)) 0 max(var(--screen-bar-padding-x), env(safe-area-inset-left, 0px));
		background: var(--bg-card);
		/* Внешняя полоска фона панели закрывает строку пикселей содержимого, которая просвечивает на дробном масштабе */
		box-shadow: inset 0 -1px var(--border-subtle-2), 0 1px 0 var(--bg-card);
		color: var(--text-primary);
		pointer-events: auto;
	}

	:global(:root[data-mobile-top-bar='floating']) .screen-bar:not(.screen-bar--bare) {
		padding: max(var(--mobile-bar-gap), env(safe-area-inset-top, 0px)) max(var(--mobile-bar-gap), env(safe-area-inset-right, 0px)) var(--mobile-bar-gap) max(var(--mobile-bar-gap), env(safe-area-inset-left, 0px));
	}

	:global(:root[data-mobile-top-bar='floating']) .surface {
		/* Как у нижней плавающей панели: та же тень и скругление, иконки отстоят от скруглённого края на столько же (24px) */
		--screen-bar-padding-x: calc(24px - (var(--mobile-bar-button-size) - 24px) / 2);
		padding: 0 var(--screen-bar-padding-x);
		border-radius: var(--mobile-bar-radius);
		box-shadow: var(--shadow-dropdown);
	}

	@supports (backdrop-filter: blur(10px)) {
		:global(:root[data-header-blur='true']:not([data-transitioning])) .surface {
			/* Те же значения, что у нижней панели (redtf/theme.css) */
			background: var(--mobile-bar-blur-background);
			backdrop-filter: var(--mobile-bar-blur);
		}
	}

	/* Место под заголовок занято всегда: он только проявляется и кнопки справа не двигает */
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 17px;
		font-weight: 600;
		opacity: 0;
		transition: opacity var(--duration-base);
	}

	.title--shown {
		opacity: 1;
	}

	.actions {
		display: flex;
		--popover-max-width: calc(100vw - max(30px, env(safe-area-inset-left, 0px)) - max(30px, env(safe-area-inset-right, 0px)));
	}

	.control {
		display: grid;
		place-items: center;
		width: var(--mobile-bar-button-size);
		height: var(--mobile-bar-button-size);
		border-radius: 50%;
		color: inherit;
		cursor: pointer;
		/* Отклик нажатия тот же, что у кнопок шапки и нижней панели (redtf/theme.css) */
		transition: scale 0.15s cubic-bezier(0.165, 0.84, 0.44, 1);
	}

	.control:active {
		scale: 0.92;
	}

	.control:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

</style>
