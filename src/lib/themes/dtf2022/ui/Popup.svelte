<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { MediaQuery } from 'svelte/reactivity';
	import { backdropShow, modalShow, modalHide } from '$lib/components/overlays/modalMotion';
	import { sheetSwipe } from '$lib/swipe';
	import { activeTheme } from '$lib/themes/index.svelte';

	/**
	 * Окно поверх страницы, как v-popup у DTF: заголовок с крестиком, тело и подвал с кнопками.
	 * Ширина — Small 480, Medium 520, Large 880. На узких экранах это шторка снизу.
	 */
	let {
		title,
		width = 480,
		closable = true,
		onclose,
		children,
		footer
	}: {
		title: string;
		width?: number;
		closable?: boolean;
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const sheet = new MediaQuery('max-width: 859px');
	let canSwipeSheet = $derived(Boolean(activeTheme.gestures) && sheet.current && closable);

	/** Переносим подложку в <body>, чтобы предки с content-visibility / transform / containment не обрезали модалку */
	const portal: Attachment<HTMLElement> = (node) => {
		document.body.appendChild(node);
		backdropShow(node);
		modalShow(node);
		return () => {
			node.remove();
		};
	};
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && closable && onclose()} />

<!-- Закрытие кликом по фону; с клавиатуры закрывает Escape -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="popup-overlay"
	data-sheet={sheet.current ? '' : undefined}
	out:modalHide|global
	{@attach portal}
	onclick={(e) => e.target === e.currentTarget && closable && onclose()}
>
	<div
		class="popup"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		style:max-width="{width}px"
		{@attach sheetSwipe({
			enabled: () => canSwipeSheet,
			handleSelector: '.popup__header, [data-sheet-handle]',
			onclose
		})}
	>
		<div class={['popup__header', { 'popup__header--handle': activeTheme.gestures }]}>
			{#if activeTheme.gestures}
				<span class="popup__handle" data-sheet-handle aria-hidden="true"></span>
			{/if}
			{title}
			<button type="button" class="popup__close" aria-label="Закрыть" disabled={!closable} onclick={() => closable && onclose()}>
				<svg class="icon" width="24" height="24" aria-hidden="true">
					<use href="#v_close"></use>
				</svg>
			</button>
		</div>

		<div class={['popup__body', { 'popup__body--with-footer': footer }]}>
			{@render children()}
		</div>

		{#if footer}
			<div class="popup__footer">
				{@render footer()}
			</div>
		{/if}
	</div>
</div>

<style>
	.popup-overlay {
		position: fixed;
		inset: 0;
		z-index: 999;
		display: flex;
		padding: 36px 16px;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		background-color: var(--modal-backdrop);
	}

	.popup {
		width: 100%;
		margin: auto;
		border-radius: 8px;
		background-color: var(--bg-card);
		color: var(--text-primary);
		text-align: left;
	}

	.popup__header {
		position: relative;
		z-index: 1;
		min-height: 65px;
		padding: 20px 56px 16px;
		border-bottom: 1px solid var(--border-color);
		border-radius: 8px 8px 0 0;
		background-color: var(--bg-card);
		font-size: 20px;
		font-weight: 500;
		line-height: 28px;
		text-align: center;
	}

	.popup__close {
		position: absolute;
		top: 23px;
		right: 16px;
		color: var(--text-primary);
		opacity: 0.5;
		cursor: pointer;
	}

	.popup__handle {
		display: none;
	}

	.popup__close:hover {
		opacity: 1;
	}

	.popup__close .icon {
		display: block;
	}

	@media (pointer: coarse), (max-width: 859px) {
		.popup__close::after {
			content: '';
			position: absolute;
			top: 50%;
			left: 50%;
			width: 44px;
			height: 44px;
			transform: translate(-50%, -50%);
		}
	}

	.popup__body {
		display: flex;
		flex-direction: column;
		padding: 24px 32px 32px;
		border-radius: 0 0 8px 8px;
		line-height: 24px;
	}

	.popup__body--with-footer {
		padding-bottom: 16px;
		border-radius: 0;
	}

	.popup__footer {
		--btn-height: 40px;
		--btn-icon-size: 18px;
		--btn-icon-margin-left: 12px;
		--btn-icon-margin-right: -6px;
		--btn-offset: 14px;
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 8px 32px 32px;
	}

	@media (max-width: 859px) {
		.popup-overlay {
			align-items: flex-end;
			padding: 56px 0 0;
		}

		.popup {
			max-width: none !important;
			margin: 0;
			border-radius: 12px 12px 0 0;
		}

		.popup:has(.popup__handle) {
			border-radius: 16px 16px 0 0;
		}

		.popup__header {
			min-height: 56px;
			padding-top: 16px;
			padding-bottom: 11px;
			border-radius: 12px 12px 0 0;
		}

		.popup__header--handle {
			padding-top: 20px;
			padding-bottom: 12px;
			border-radius: 16px 16px 0 0;
			touch-action: none;
			user-select: none;
			cursor: grab;
		}

		.popup__header--handle:active {
			cursor: grabbing;
		}

		.popup__handle {
			position: absolute;
			top: 8px;
			left: 50%;
			display: block;
			width: 36px;
			height: 4px;
			border-radius: 999px;
			background-color: var(--text-placeholder);
			transform: translateX(-50%);
			pointer-events: none;
		}

		.popup__close {
			top: 18px;
		}

		.popup__header--handle .popup__close {
			top: 22px;
		}

		.popup__body {
			padding: 16px 16px calc(20px + env(safe-area-inset-bottom, 0px));
		}

		.popup__body--with-footer {
			padding-bottom: 0;
		}

		.popup__footer {
			flex-direction: column-reverse;
			padding: 24px 16px calc(24px + env(safe-area-inset-bottom, 0px));
		}

		.popup__footer :global(.btn) {
			width: 100%;
		}
	}
</style>
