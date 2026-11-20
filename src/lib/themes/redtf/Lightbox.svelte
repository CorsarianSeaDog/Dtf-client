<script lang="ts">
	import LightboxOverlay from '$lib/components/overlays/LightboxOverlay.svelte';
	import type { LightboxIcons } from '$lib/components/overlays/lightbox';
	import type { ThemeComponents } from '../contract';

	/*
	 * Медиа-просмотрщик темы redtf: PhotoSwipe с оформлением в духе Re:DTF / Adwaita OSD
	 * (матовые круглые кнопки с тонким кольцом, символические контурные иконки, парящая подпись)
	 * и отступами вокруг кадра по умолчанию, пока пользователь не приблизит изображение.
	 */
	let props: ThemeComponents['Lightbox'] = $props();

	const svg = (inner: string) =>
		`<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

	const ICONS: LightboxIcons = {
		close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
		zoom: svg(
			'<circle cx="10.75" cy="10.75" r="6.25"/>' +
			'<path d="M15.5 15.5l4.25 4.25"/>' +
			'<path class="pswp__zoom-icn-bar-h" d="M8.25 10.75h5"/>' +
			'<path class="pswp__zoom-icn-bar-v" d="M10.75 8.25v5"/>'
		),
		arrowPrev: svg('<path d="M14.5 6.5L9 12l5.5 5.5"/>'),
		arrowNext: svg('<path d="M9.5 6.5L15 12l-5.5 5.5"/>'),
		download: svg('<path d="M12 4.5v10M7.5 10.5L12 15l4.5-4.5M5 19h14"/>'),
		check: svg('<path d="M5.5 12.5l4.2 4.2L18.5 7.5"/>')
	};
</script>

<LightboxOverlay {...props} mainClass="pswp--redtf" bgOpacity={0.96} framed animateSlides icons={ICONS} />

<style>
	/* Токены Adwaita OSD в духе reDTF: нейтральный тёмный холст и матовые плашки с тонкой обводкой */
	:global(.pswp.pswp--redtf) {
		--pswp-bg: #111215;
		--pswp-placeholder-bg: #1c1d21;
		--pswp-icon-color: #f3f3f5;
		--pswp-icon-color-secondary: transparent;
		--pswp-icon-stroke-color: transparent;
		--pswp-icon-stroke-width: 0;
		--pswp-error-text-color: rgba(243, 243, 245, 0.78);

		--lv-surface: rgba(30, 31, 36, 0.78);
		--lv-surface-hover: rgba(46, 48, 56, 0.9);
		--lv-surface-active: rgba(60, 63, 73, 0.96);
		--lv-border: rgba(255, 255, 255, 0.13);
		--lv-border-strong: rgba(255, 255, 255, 0.22);
		--lv-shadow: 0 4px 16px rgba(0, 0, 0, 0.34), 0 1px 2px rgba(0, 0, 0, 0.22);
		--lv-media-shadow: 0 18px 52px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.06);
		--lv-blur: blur(18px) saturate(165%);
		--lv-text: #f3f3f5;
		--lv-accent: var(--color-accent, #299ef0);
		--lv-success: #4cd964;
		--lv-success-bg: rgba(52, 199, 73, 0.24);
		--lv-success-border: rgba(76, 217, 100, 0.52);
		--lv-radius-media: 10px;
		--lv-btn: 40px;

		font-family: var(--font-family, 'Roboto', system-ui, sans-serif);
	}

	/* Палитра AMOLED: истинно чёрный фон и более плотные капсулы с чёткой границей */
	:global(:root[data-palette='amoled'] .pswp.pswp--redtf) {
		--pswp-bg: #000000;
		--pswp-placeholder-bg: #0e0e11;
		--lv-surface: rgba(18, 18, 22, 0.86);
		--lv-surface-hover: rgba(34, 34, 40, 0.94);
		--lv-surface-active: rgba(46, 46, 54, 0.98);
		--lv-border: rgba(255, 255, 255, 0.15);
	}

	/* Выключенные эффекты прозрачности: чистые непрозрачные поверхности без backdrop-filter */
	:global(:root[data-transparency='false'] .pswp.pswp--redtf) {
		--lv-surface: #222328;
		--lv-surface-hover: #30323a;
		--lv-surface-active: #3c3f49;
		--lv-blur: none;
	}

	:global(:root[data-palette='amoled'][data-transparency='false'] .pswp.pswp--redtf) {
		--lv-surface: #121215;
		--lv-surface-hover: #202026;
		--lv-surface-active: #2c2c34;
	}

	/* Общая матовая OSD-поверхность для всех плавающих элементов управления */
	:global(.pswp.pswp--redtf .pswp__counter),
	:global(.pswp.pswp--redtf .pswp__preloader--active),
	:global(.pswp.pswp--redtf .pswp__button),
	:global(.pswp.pswp--redtf .pswp__redtf-caption:not(:empty)) {
		border: 1px solid var(--lv-border);
		background: var(--lv-surface);
		backdrop-filter: var(--lv-blur);
		box-shadow: var(--lv-shadow);
		color: var(--lv-text);
	}

	/* Кадр в исходном положении: скругление и мягкая тень; при приближении уходят, кадр становится на весь экран */
	:global(.pswp.pswp--redtf .pswp__img),
	:global(.pswp.pswp--redtf .pswp__content video) {
		border-radius: var(--lv-radius-media);
		box-shadow: var(--lv-media-shadow);
		transition: border-radius 220ms ease, box-shadow 220ms ease;
	}

	:global(.pswp.pswp--redtf .pswp__content video) {
		background: #000;
		object-fit: contain;
	}

	:global(.pswp.pswp--redtf.pswp--zoomed-in .pswp__img) {
		border-radius: 0;
		box-shadow: none;
	}

	/* Верхняя панель */
	:global(.pswp.pswp--redtf .pswp__top-bar) {
		top: 0;
		height: auto;
		align-items: center;
		gap: 8px;
		padding: calc(12px + env(safe-area-inset-top, 0px))
			calc(14px + env(safe-area-inset-right, 0px))
			0
			calc(14px + env(safe-area-inset-left, 0px));
	}

	/* Счётчик кадров: парящая капсула в высоту кнопок */
	:global(.pswp.pswp--redtf .pswp__counter) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 36px;
		margin: 0;
		padding: 0 14px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		text-shadow: none;
		opacity: 1;
	}

	/* Индикатор загрузки: тонкое кольцо reDTF внутри круглого OSD-диска */
	:global(.pswp.pswp--redtf .pswp__preloader) {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		margin: 0 auto 0 0;
		border-radius: 50%;
		pointer-events: none;
	}

	:global(.pswp.pswp--redtf .pswp__preloader .pswp__icn) {
		display: none;
	}

	:global(.pswp.pswp--redtf .pswp__preloader::before) {
		content: '';
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: conic-gradient(from 0deg, transparent 8%, var(--lv-accent));
		mask: radial-gradient(farthest-side, transparent calc(100% - 2.4px), #000 calc(100% - 1.9px));
		opacity: 0;
		transition: opacity 180ms ease;
	}

	:global(.pswp.pswp--redtf .pswp__preloader--active::before) {
		opacity: 1;
		animation: -global-pswp-spin 0.8s linear infinite;
	}

	/* Круглые OSD-кнопки (Adwaita / ScreenBar) */
	:global(.pswp.pswp--redtf .pswp__button) {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--lv-btn);
		height: var(--lv-btn);
		margin: 0;
		padding: 0;
		border-radius: 50%;
		opacity: 1;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			color 150ms ease,
			scale 150ms cubic-bezier(0.165, 0.84, 0.44, 1);
	}

	:global(.pswp.pswp--redtf:not(.pswp--zoom-allowed) .pswp__button--zoom),
	:global(.pswp.pswp--redtf.pswp--one-slide .pswp__counter),
	:global(.pswp.pswp--redtf.pswp--one-slide .pswp__button--arrow),
	:global(.pswp.pswp--redtf .pswp__button--arrow:disabled) {
		display: none;
	}

	:global(.pswp.pswp--redtf .pswp__icn) {
		position: static;
		width: 20px;
		height: 20px;
		margin: 0;
		fill: none;
		stroke: currentColor;
		color: inherit;
		transform: none;
	}

	@media (hover: hover) {
		:global(.pswp.pswp--redtf .pswp__button:hover) {
			border-color: var(--lv-border-strong);
			background: var(--lv-surface-hover);
			color: #ffffff;
		}
	}

	:global(.pswp.pswp--redtf .pswp__button:active) {
		border-color: var(--lv-border-strong);
		background: var(--lv-surface-active);
		scale: 0.92;
	}

	:global(.pswp.pswp--redtf .pswp__button:focus-visible) {
		outline: 2px solid var(--lv-accent);
		outline-offset: 2px;
	}

	/* Увеличенные зоны касания на сенсорных экранах */
	@media (pointer: coarse) {
		:global(.pswp.pswp--redtf) {
			--lv-btn: 44px;
		}

		:global(.pswp.pswp--redtf .pswp__counter) {
			height: 40px;
		}
	}

	/* Кнопка скачивания: цветовое состояние подтверждения */
	:global(.pswp.pswp--redtf .pswp__button--download[data-state='loading']) {
		cursor: progress;
	}

	:global(.pswp.pswp--redtf .pswp__button--download[data-state='done']),
	:global(.pswp.pswp--redtf .pswp__button--download[data-state='done']:hover) {
		border-color: var(--lv-success-border);
		background: var(--lv-success-bg);
		color: var(--lv-success);
	}

	/* Боковые стрелки перелистывания на десктопе */
	:global(.pswp.pswp--redtf .pswp__button--arrow) {
		position: absolute;
		top: 50%;
		width: 44px;
		height: 44px;
		margin-top: -22px;
	}

	:global(.pswp.pswp--redtf .pswp__button--arrow--prev) {
		left: calc(16px + env(safe-area-inset-left, 0px));
	}

	:global(.pswp.pswp--redtf .pswp__button--arrow--next) {
		right: calc(16px + env(safe-area-inset-right, 0px));
	}

	:global(.pswp.pswp--redtf .pswp__button--arrow .pswp__icn) {
		width: 22px;
		height: 22px;
	}

	/* На узком экране стрелки легли бы поверх кадра: там листают свайпом */
	@media (max-width: 719px) {
		:global(.pswp.pswp--redtf .pswp__button--arrow) {
			display: none;
		}
	}

	/* Парящая карточка подписи внизу; при приближении мягко убирается, чтобы не мешать деталям */
	:global(.pswp.pswp--redtf .pswp__redtf-caption:not(:empty)) {
		inset: auto 0 calc(16px + env(safe-area-inset-bottom, 0px));
		width: fit-content;
		max-width: min(600px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
		max-height: 28vh;
		margin-inline: auto;
		padding: 10px 16px;
		overflow-y: auto;
		border-radius: 14px;
		font-size: 14px;
		line-height: 1.45;
		text-align: center;
		transition: opacity 200ms ease, transform 200ms ease;
	}

	:global(.pswp.pswp--redtf .pswp__redtf-caption a) {
		color: color-mix(in srgb, var(--lv-accent) 72%, white);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	:global(.pswp.pswp--redtf.pswp--zoomed-in .pswp__redtf-caption:not(:empty)) {
		opacity: 0;
		transform: translateY(6px);
		pointer-events: none;
	}

	/* Системный высококонтрастный режим */
	@media (forced-colors: active) {
		:global(.pswp.pswp--redtf .pswp__button),
		:global(.pswp.pswp--redtf .pswp__counter),
		:global(.pswp.pswp--redtf .pswp__redtf-caption:not(:empty)) {
			border: 1px solid ButtonText;
			color: ButtonText;
		}

		:global(.pswp.pswp--redtf .pswp__button:focus-visible) {
			outline-color: Highlight;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.pswp.pswp--redtf .pswp__button),
		:global(.pswp.pswp--redtf .pswp__img),
		:global(.pswp.pswp--redtf .pswp__content video),
		:global(.pswp.pswp--redtf .pswp__redtf-caption:not(:empty)) {
			transition: none;
		}
	}
</style>
