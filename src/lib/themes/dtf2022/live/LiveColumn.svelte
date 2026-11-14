<script lang="ts">
	import { activeThemeSettings } from '../../settings.svelte';
	import { clickOnKey } from '../a11y';
	import { themeSettings } from '../themeSettings.svelte';
	import LiveItem from './LiveItem.svelte';
	import { liveFeed } from './live.svelte';
	import { visibleItems } from './liveModel';

	let now = $state(Date.now());
	let collapsed = $derived(themeSettings.liveCollapsed);
	let list = $derived(visibleItems(liveFeed.items, themeSettings.liveContent));

	// Даты в карточках обновляются раз в полминуты
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

	function toggle() {
		activeThemeSettings().patch({ liveCollapsed: !collapsed });
	}
</script>

<div class={['live', { 'live--collapsed': collapsed }]}>
	<section class="comments" aria-label="Комментарии">
		<div class="header" role="button" tabindex="0" aria-expanded={!collapsed} onclick={toggle} onkeydown={clickOnKey}>
			<div class="heading">
				<div class="title">Комментарии</div>
				<div class="arrow">
					<svg class="icon" width="20" height="20" aria-hidden="true">
						<use href="#v_chevron_right"></use>
					</svg>
				</div>
			</div>
		</div>

		<div class="scrollable">
			<div class="content">
				{#each list as item, i (item.hash)}
					<LiveItem {item} {now} first={i === 0} ondismiss={(hash) => liveFeed.dismiss(hash)} />
				{/each}
			</div>
		</div>
	</section>
</div>

<style>
	.live {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.comments {
		position: sticky;
		top: var(--header-height);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		height: calc(100vh - var(--header-height));
	}

	.header {
		flex-shrink: 0;
		padding-right: 20px;
		padding-left: 30px;
		cursor: pointer;
		user-select: none;
	}

	.heading {
		display: flex;
		align-items: center;
		height: 74px;
	}

	.title {
		font-size: 18px;
		line-height: 26px;
		font-weight: 500;
	}

	.arrow {
		margin: 1px 0 0 4px;
	}

	.arrow .icon {
		display: block;
	}

	/* Полоса прокрутки уезжает за правый край колонки: блок вдвое шире, контент остаётся 304px */
	.scrollable {
		flex: 1;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		width: 200%;
	}

	.content {
		width: 304px;
	}

	/* Свёрнутая колонка 80px: заголовок поворачивается и стоит вдоль неё, стрелка смотрит вверх */
	.live--collapsed {
		width: 80px;
	}

	.live--collapsed .header {
		position: absolute;
		top: -40px;
		right: 50%;
		transform: rotate(-90deg);
		transform-origin: 100% 50%;
	}

	.live--collapsed .scrollable {
		display: none;
	}

	.live--collapsed .arrow {
		margin-left: 8px;
		transform: rotate(-90deg);
		transform-origin: 50% 50%;
	}
</style>
