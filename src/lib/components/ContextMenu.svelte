<script lang="ts">
	import { fade } from 'svelte/transition';
	import {
		clampMenuPosition,
		contextMenuState,
		type ContextMenuItem,
		type ContextMenuState
	} from '$lib/contextMenu.svelte';
	import { reducedMotion } from '$lib/motion';
	import { appear, disappear } from '$lib/themes/appear';

	const hasPopover = typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');
	const canHover = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(hover: hover)') : null;

	const ms = (n: number) => (reducedMotion() ? 0 : n);

	let active = $derived(contextMenuState.current);
	let hasIcons = $derived(active?.items.some((item) => Boolean(item.icon)) ?? false);

	function restoreElementFocus(target: HTMLElement | null, keyboardRing: boolean) {
		if (!target?.isConnected) return;
		target.focus({
			preventScroll: true,
			...(keyboardRing ? {} : { focusVisible: false })
		} as FocusOptions);
	}

	function onMenuPointerMove(e: PointerEvent) {
		if (!canHover?.matches) return;
		const item = (e.target as Element | null)?.closest?.<HTMLElement>('.context-menu__item');
		if (!item || (item as HTMLButtonElement).disabled) return;
		if (document.activeElement !== item) {
			item.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
		}
	}

	function activateItem(item: ContextMenuItem, state: ContextMenuState, fromKeyboard: boolean) {
		if (item.disabled) return;
		if (item.href) {
			// Даём браузеру обработать переход по ссылке до размонтирования элемента (Safari/WebKit)
			setTimeout(() => contextMenuState.close(state.id), 0);
			item.action?.();
			return;
		}
		if (state.mode === 'popover') restoreElementFocus(state.returnFocusTo, fromKeyboard);
		contextMenuState.close(state.id);
		item.action?.();
	}

	function mountPopover(state: ContextMenuState) {
		return (menuEl: HTMLElement) => {
			const getMenuItems = () => [...menuEl.querySelectorAll<HTMLElement>('button:enabled, a[href]')];
			// В Firefox contextmenu может прийти до pointerup: auto-popover закрылся бы на отпускании ПКМ.
			if (hasPopover) menuEl.showPopover();
			const rect = menuEl.getBoundingClientRect();
			const { left, top, flipX, flipY } = clampMenuPosition(state.x, state.y, rect.width, rect.height, window.innerWidth, window.innerHeight);
			menuEl.style.left = `${left}px`;
			menuEl.style.top = `${top}px`;
			menuEl.style.transformOrigin = `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}`;
			appear('popoverIn')(menuEl);
			if (state.fromKeyboard) getMenuItems()[0]?.focus({ preventScroll: true });

			const close = () => contextMenuState.close(state.id);
			const listeners = new AbortController();

			function onKeyDown(e: KeyboardEvent) {
				if (contextMenuState.current?.id !== state.id) {
					listeners.abort();
					return;
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					e.stopPropagation();
					restoreElementFocus(state.returnFocusTo, true);
					close();
					return;
				}
				if (e.key === 'Tab') {
					restoreElementFocus(state.returnFocusTo, false);
					close();
					return;
				}
				const items = getMenuItems();
				if (!items.length) return;
				const currentIdx = items.indexOf(document.activeElement as HTMLElement);

				if (e.key === 'Home') {
					e.preventDefault();
					items[0].focus({ preventScroll: true });
					return;
				}
				if (e.key === 'End') {
					e.preventDefault();
					items[items.length - 1].focus({ preventScroll: true });
					return;
				}
				if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
					if (currentIdx < 0) {
						e.preventDefault();
						items[e.key === 'ArrowDown' ? 0 : items.length - 1].focus({ preventScroll: true });
						return;
					}
					e.preventDefault();
					e.stopImmediatePropagation();
					const delta = e.key === 'ArrowDown' ? 1 : -1;
					const next = (currentIdx + delta + items.length) % items.length;
					items[next].focus({ preventScroll: true });
				}
			}

			function onOutside(e: Event) {
				if (contextMenuState.current?.id !== state.id) {
					listeners.abort();
					return;
				}
				if (e.target instanceof Node && !menuEl.contains(e.target)) close();
			}

			const capture = { capture: true, signal: listeners.signal };
			window.addEventListener('keydown', onKeyDown, capture);
			window.addEventListener('scroll', onOutside, capture);
			window.addEventListener('resize', close, capture);
			window.addEventListener('blur', close, { signal: listeners.signal });
			window.addEventListener('popstate', close, capture);
			// На фазе захвата открывающий ПКМ уже прошёл window к моменту установки слушателя.
			window.addEventListener('contextmenu', onOutside, capture);
			window.addEventListener('pointerdown', onOutside, capture);
			document.addEventListener('focusin', onOutside, capture);
			return () => listeners.abort();
		};
	}

	function mountSheet(state: ContextMenuState) {
		return (dialogEl: HTMLDialogElement) => {
			dialogEl.showModal();

			const onKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					e.preventDefault();
					e.stopPropagation();
					contextMenuState.close(state.id);
				}
			};
			const onPopState = () => contextMenuState.close(state.id);

			window.addEventListener('keydown', onKeyDown, true);
			window.addEventListener('popstate', onPopState);
			return () => {
				window.removeEventListener('keydown', onKeyDown, true);
				window.removeEventListener('popstate', onPopState);
				dialogEl.close();
				if (!contextMenuState.current && document.activeElement === document.body) {
					restoreElementFocus(state.returnFocusTo, false);
				}
			};
		};
	}
</script>

{#snippet itemContent(item: ContextMenuItem, reserveIcon: boolean)}
	{#if reserveIcon}
		<span class="context-menu__icon" aria-hidden="true">
			{#if item.icon}
				<svg class="icon" width="20" height="20" aria-hidden="true">
					<use href="#{item.icon}"></use>
				</svg>
			{/if}
		</span>
	{/if}
	<span class="context-menu__label">{item.label}</span>
{/snippet}

{#snippet menuItems(items: ContextMenuItem[], itemClass: string, state: ContextMenuState, reserveIcon: boolean, keyboardMode: boolean)}
	{#each items as item, index (item.id)}
		{#if item.separatorBefore && index > 0}
			<hr class="context-menu__sep" />
		{/if}
		{#if item.href && !item.disabled}
			<a
				class={[itemClass, { 'context-menu__item--danger': item.danger }]}
				role={keyboardMode ? 'menuitem' : undefined}
				href={item.href}
				target={item.target}
				rel={item.rel}
				onclick={() => activateItem(item, state, false)}
			>
				{@render itemContent(item, reserveIcon)}
			</a>
		{:else}
			<button
				type="button"
				class={[itemClass, { 'context-menu__item--danger': item.danger }]}
				role={keyboardMode ? 'menuitem' : undefined}
				disabled={item.disabled}
				onclick={(e) => activateItem(item, state, keyboardMode && e.detail === 0)}
			>
				{@render itemContent(item, reserveIcon)}
			</button>
		{/if}
	{/each}
{/snippet}

{#if active}
	{#key active.id}
		{@const state = active}
		{#if state.mode === 'popover'}
			<div
				class="context-menu"
				role="menu"
				tabindex="-1"
				aria-label={state.label}
				onpointermove={onMenuPointerMove}
				popover={hasPopover ? 'manual' : undefined}
				oncontextmenu={(e) => e.preventDefault()}
				{@attach mountPopover(state)}
				out:disappear|global={'popoverOut'}
			>
				{@render menuItems(state.items, 'context-menu__item', state, hasIcons, true)}
			</div>
		{:else}
			<dialog
				class="context-menu-overlay"
				aria-label={state.label}
				{@attach mountSheet(state)}
				oncancel={(e) => { e.preventDefault(); contextMenuState.close(state.id); }}
				onclick={(e) => e.target === e.currentTarget && contextMenuState.close(state.id)}
				oncontextmenu={(e) => e.preventDefault()}
				in:fade={{ duration: ms(150) }}
				out:fade={{ duration: ms(100) }}
			>
				<div class="context-menu-sheet">
					{#if state.title}
						<div class="context-menu-sheet__header">
							<span class="context-menu-sheet__title">{state.title}</span>
						</div>
					{/if}
					<div class="context-menu-sheet__actions">
						{@render menuItems(state.items, 'context-menu-sheet__action', state, hasIcons, false)}
					</div>
					<div class="context-menu-sheet__footer">
						<button type="button" class="context-menu-sheet__cancel" onclick={() => contextMenuState.close(state.id)}>
							Отмена
						</button>
					</div>
				</div>
			</dialog>
		{/if}
	{/key}
{/if}

<style>
	.context-menu {
		position: fixed;
		inset: auto;
		margin: 0;
		min-width: min(196px, calc(100vw - 16px));
		max-width: min(280px, calc(100vw - 16px));
		box-sizing: border-box;
		max-height: min(320px, 60vh);
		padding: 6px;
		overflow-y: auto;
		overscroll-behavior: contain;
		border: 0;
		border-radius: 8px;
		background-color: var(--bg-card, #ffffff);
		box-shadow: var(--shadow-dropdown, 0 4px 12px rgba(0, 0, 0, 0.15));
		color: var(--text-primary, #000000);
		font-size: 15px;
		line-height: 1.4;
		text-align: left;
		user-select: none;
		z-index: 9999;
	}

	.context-menu__item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 7px 10px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		outline: 0;
	}

	.context-menu__item + .context-menu__item {
		margin-top: 2px;
	}

	.context-menu__item:not(:disabled):hover {
		background-color: var(--bg-card-hover, rgba(0, 0, 0, 0.05));
	}

	.context-menu__item:not(:disabled):focus-visible {
		background-color: var(--bg-card-hover, rgba(0, 0, 0, 0.05));
		outline: 2px solid var(--color-blue, #4683d9);
		outline-offset: -2px;
	}

	.context-menu__item:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.context-menu__icon {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
	}

	.context-menu__icon .icon {
		display: block;
	}

	.context-menu__label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.context-menu__sep {
		height: 1px;
		margin: 4px 6px;
		border: 0;
		background-color: var(--border-subtle-2, rgba(0, 0, 0, 0.1));
	}

	.context-menu-overlay {
		position: fixed;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		border: 0;
		margin: 0;
		inset: 0;
		z-index: 9999;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0;
		background-color: var(--modal-backdrop, rgba(0, 0, 0, 0.6));
		overscroll-behavior: contain;
	}

	.context-menu-overlay::backdrop { background: transparent; }

	.context-menu-sheet {
		width: 100%;
		max-width: 440px;
		max-height: 85dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin: 0;
		padding: 12px 16px max(16px, env(safe-area-inset-bottom, 16px));
		border-radius: 16px 16px 0 0;
		background-color: var(--bg-card, #ffffff);
		box-shadow: var(--shadow-dropdown, 0 -2px 16px rgba(0, 0, 0, 0.15));
		color: var(--text-primary, #000000);
		user-select: none;
		outline: 0;
	}

	.context-menu-sheet__header {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 8px 0 12px;
	}

	.context-menu-sheet__title {
		font-size: 14px;
		font-weight: 500;
		color: var(--text-muted, #595959);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.context-menu-sheet__actions {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.context-menu-sheet__action {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 44px;
		padding: 10px 16px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 16px;
		font-weight: 500;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition: background-color var(--duration-base, 150ms) ease;
	}

	.context-menu-sheet__action:not(:disabled):hover {
		background-color: var(--bg-card-hover, rgba(0, 0, 0, 0.05));
	}

	.context-menu-sheet__action:not(:disabled):active {
		background-color: var(--bg-card-active, rgba(0, 0, 0, 0.08));
	}

	.context-menu-sheet__action:not(:disabled):focus-visible {
		outline: 2px solid var(--color-blue, #4683d9);
		outline-offset: -2px;
	}

	.context-menu-sheet__action:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.context-menu-sheet__footer {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
	}

	.context-menu-sheet__cancel {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 44px;
		padding: 10px 16px;
		border: 0;
		border-radius: 8px;
		background: var(--bg-secondary, #f5f5f5);
		color: var(--text-primary, #000000);
		font: inherit;
		font-size: 16px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--duration-base, 150ms) ease;
	}

	.context-menu-sheet__cancel:active {
		background-color: var(--bg-card-active, rgba(0, 0, 0, 0.08));
	}

	.context-menu-sheet__cancel:focus-visible {
		outline: 2px solid var(--color-blue, #4683d9);
		outline-offset: -2px;
	}
	.context-menu__item--danger {
		color: var(--color-danger, #cd192e);
	}

	.context-menu__item--danger:not(:disabled):hover,
	.context-menu__item--danger:not(:disabled):focus-visible {
		background-color: var(--color-danger-bg, rgba(205, 25, 46, 0.1));
	}
</style>
