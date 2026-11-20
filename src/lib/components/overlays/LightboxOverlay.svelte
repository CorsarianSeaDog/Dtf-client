<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { downloadImage, getLeonardoOriginalUrl, getLeonardoUrl, hasNativeDownload } from '$lib/api/utils';
	import { pushBackDriver } from '$lib/capacitor/back';
	import { haptics } from '$lib/haptics';
	import { reducedMotion } from '$lib/motion';
	import { closeOverlay, preloadLightbox, takeLightboxOrigins } from '$lib/navigation';
	import { sanitizeHtml } from '$lib/sanitize';
	import { settings } from '$lib/storage/settings.svelte';
	import {
		computeFramedZoom,
		createLightboxBackDriver,
		parseTranslateX,
		readSafeAreaInsets,
		slideDepthStyle,
		ZERO_INSETS,
		type LightboxIcons
	} from './lightbox';

	type DownloadState = 'idle' | 'loading' | 'done';

	/** Просмотр медиа на весь экран через PhotoSwipe */
	let {
		images,
		index,
		mainClass,
		bgOpacity = 0.92,
		framed = false,
		animateSlides = false,
		icons
	}: Extract<App.OverlayData, { type: 'lightbox' }>['data'] & {
		mainClass?: string;
		bgOpacity?: number;
		/** Отступы вокруг медиа в исходном состоянии; при приближении кадр занимает весь экран */
		framed?: boolean;
		/** Пружинное перелистывание по стрелкам/клавиатуре и эффект глубины при свайпе и смене кадра */
		animateSlides?: boolean;
		icons?: LightboxIcons;
	} = $props();

	const MAX_WIDTH = 2048;

	const DEFAULT_DOWNLOAD_SVG =
		'<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32">' +
		'<use class="pswp__icn-shadow" xlink:href="#pswp__icn-download"></use>' +
		'<path d="M15 6h2v9h4l-5 5-5-5h4V6zM7 21v4h18v-4h2v6H5v-6h2z" id="pswp__icn-download"/></svg>';

	const DEFAULT_CHECK_SVG =
		'<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="M5.5 12.5l4.2 4.2L18.5 7.5"/></svg>';

	let statusText = $state('');
	let barrierEl: HTMLDivElement | undefined;

	onMount(() => {
		let origins = takeLightboxOrigins();
		let closed = false;
		let pswp: import('photoswipe').default | undefined;
		let downloadBtn: HTMLButtonElement | undefined;
		let announceFrame = 0;
		let safeArea = ZERO_INSETS;

		const downloads = new Map<string, { state: DownloadState; timer?: ReturnType<typeof setTimeout> }>();

		const back = createLightboxBackDriver(
			() => (closed ? undefined : pswp),
			() => Boolean(settings.value.predictiveBack) && page.state.overlays?.at(-1)?.type === 'lightbox'
		);
		const releaseBackDriver = pushBackDriver(back.driver);

		const refreshSafeArea = () => {
			safeArea = readSafeAreaInsets(barrierEl);
		};

		const clearTimers = () => {
			for (const entry of downloads.values()) clearTimeout(entry.timer);
			downloads.clear();
			cancelAnimationFrame(announceFrame);
			announceFrame = 0;
		};

		const updateButtonState = () => {
			if (!downloadBtn || !pswp) return;
			const current = images[pswp.currIndex];
			const state: DownloadState = current?.uuid ? (downloads.get(current.uuid)?.state ?? 'idle') : 'idle';
			downloadBtn.dataset.state = state;
			if (state === 'loading') {
				downloadBtn.setAttribute('aria-disabled', 'true');
				downloadBtn.setAttribute('aria-busy', 'true');
			} else {
				downloadBtn.removeAttribute('aria-disabled');
				downloadBtn.removeAttribute('aria-busy');
			}
			downloadBtn.style.display = current?.uuid ? '' : 'none';
		};

		const setDownloadState = (uuid: string, state: DownloadState, resetAfterMs?: number) => {
			clearTimeout(downloads.get(uuid)?.timer);
			if (state === 'idle') {
				downloads.delete(uuid);
			} else {
				const timer = resetAfterMs
					? setTimeout(() => {
							downloads.delete(uuid);
							updateButtonState();
						}, resetAfterMs)
					: undefined;
				downloads.set(uuid, { state, timer });
			}
			updateButtonState();
		};

		const announceStatus = (message: string) => {
			cancelAnimationFrame(announceFrame);
			statusText = '';
			announceFrame = requestAnimationFrame(() => {
				announceFrame = 0;
				if (!closed) statusText = message;
			});
		};

		// Библиотека тяжёлая и нужна не всем: грузим при первом открытии (или берём из preload)
		(async () => {
			try {
				const res = await preloadLightbox();
				if (!res || closed) return;
				const [PhotoSwipeModule] = res;
				const PhotoSwipe = PhotoSwipeModule.default;

				if (framed) refreshSafeArea();

				const downloadSvg = icons?.download ?? DEFAULT_DOWNLOAD_SVG;
				const checkSvg = icons?.check ?? DEFAULT_CHECK_SVG;

				pswp = new PhotoSwipe({
					index,
					// Стандартные 0.8 просвечивают страницу под просмотром
					bgOpacity,
					...(mainClass && { mainClass }),
					closeTitle: 'Закрыть',
					zoomTitle: 'Увеличить',
					arrowPrevTitle: 'Предыдущее',
					arrowNextTitle: 'Следующее',
					errorMsg: 'Не удалось загрузить изображение',
					...(icons?.close && { closeSVG: icons.close }),
					...(icons?.zoom && { zoomSVG: icons.zoom }),
					...(icons?.arrowPrev && { arrowPrevSVG: icons.arrowPrev }),
					...(icons?.arrowNext && { arrowNextSVG: icons.arrowNext }),
					...(framed && {
						spacing: 0.08,
						initialZoomLevel: (z) => computeFramedZoom(z.elementSize, z.panAreaSize, z.fit, safeArea)
					}),
					dataSource: images.map(({ uuid, width, height, video }, i) => {
						if (video) return { type: 'video', width, height };
						// Картинка приходит не шире MAX_WIDTH, поэтому и размер заявляем такой, иначе приближение будет мыльным
						const scale = Math.min(1, MAX_WIDTH / width);
						const thumb = origins?.[i];
						return {
							src: getLeonardoUrl(uuid, { width: MAX_WIDTH }),
							width: Math.round(width * scale),
							height: Math.round(height * scale),
							...(thumb && {
								element: thumb,
								msrc: thumb.currentSrc,
								...(getComputedStyle(thumb).objectFit === 'cover' && { thumbCropped: true })
							})
						};
					})
				});

				const applySlideDepth = (scrollX: number) => {
					if (!pswp) return;
					const width = pswp.mainScroll.slideWidth;
					const skip = !width || reducedMotion() || Boolean(pswp.opener?.isClosing);
					for (const holder of pswp.mainScroll.itemHolders) {
						// Ставим scale/opacity на сам контент, а не на holder.el:
						// CSS-свойство scale применяется слева от transform: translate3d(holderX), иначе слайд съезжает на соседа
						const target = holder.slide?.content?.element;
						if (!target) continue;
						if (skip) {
							target.style.scale = '';
							target.style.opacity = '';
							continue;
						}
						const holderX = parseTranslateX(holder.el.style.transform);
						const { scale, opacity } = slideDepthStyle((holderX + scrollX) / width);
						target.style.scale = scale === 1 ? '' : String(scale);
						target.style.opacity = opacity === 1 ? '' : String(opacity);
					}
				};

				if (animateSlides) {
					// В PhotoSwipe 5 goTo/next/prev переключают слайд мгновенно; включаем штатную пружину mainScroll
					pswp.goTo = (targetIndex: number) => {
						pswp!.mainScroll.moveIndexBy(
							pswp!.getLoopedIndex(targetIndex) - pswp!.potentialIndex,
							!reducedMotion()
						);
					};
					pswp.on('moveMainScroll', ({ x }) => applySlideDepth(x));
					// mainScroll.resize() шлёт moveMainScroll до обновления transform у itemHolders — пересчитываем после ресайза
					pswp.on('resize', () => pswp && applySlideDepth(pswp.mainScroll.x));
				}

				if (framed) pswp.on('beforeResize', refreshSafeArea);

				pswp.on('contentLoad', (e) => {
					if (e.content.type !== 'video') return;
					e.preventDefault();
					const media = images[e.content.index];
					const slide = document.createElement('div');
					slide.className = 'pswp__content';
					const video = document.createElement('video');
					video.src = getLeonardoUrl(media.uuid, { format: 'mp4' });
					video.poster = getLeonardoUrl(media.uuid, { width: 680, format: 'jpg' });
					video.controls = true;
					video.playsInline = true;
					video.preload = 'metadata';
					video.style.width = video.style.height = '100%';
					slide.append(video);
					e.content.element = slide;
				});
				pswp.on('contentDeactivate', ({ content }) => {
					content.element?.querySelector('video')?.pause();
				});
				pswp.addFilter('preventPointerEvent', (prevent, event) =>
					prevent && !(event.target instanceof HTMLVideoElement)
				);

				// Подпись и кнопка скачивания оригинала в полном качестве
				pswp.on('uiRegister', () => {
					if (images.some(({ caption }) => caption)) {
						pswp?.ui?.registerElement({
							name: 'redtf-caption',
							appendTo: 'root',
							onInit: (el, viewer) => {
								const update = () => (el.innerHTML = sanitizeHtml(images[viewer.currIndex]?.caption ?? ''));
								viewer.on('change', update);
								update();
							}
						});
					}
					pswp?.ui?.registerElement({
						name: 'download',
						ariaLabel: 'Скачать оригинал',
						title: 'Скачать оригинал',
						order: 15,
						isButton: true,
						html:
							`<span class="pswp__download-icon pswp__download-icon--idle" aria-hidden="true">${downloadSvg}</span>` +
							'<span class="pswp__download-icon pswp__download-icon--loading" aria-hidden="true"></span>' +
							`<span class="pswp__download-icon pswp__download-icon--done" aria-hidden="true">${checkSvg}</span>`,
						onInit: (el) => {
							downloadBtn = el as HTMLButtonElement;
							updateButtonState();
						},
						onClick: async (e) => {
							e.stopPropagation();
							if (!pswp) return;
							const current = images[pswp.currIndex];
							if (!current?.uuid || downloads.get(current.uuid)?.state === 'loading') return;

							const uuid = current.uuid;
							// AndroidBridge ставит загрузку в очередь синхронно — сразу дадим финальный двойной импульс без наложения
							if (!hasNativeDownload()) haptics.tick();
							setDownloadState(uuid, 'loading');

							const originalUrl = getLeonardoOriginalUrl(uuid);
							const started = await downloadImage(originalUrl, uuid, current.video ? 'mp4' : current.type);
							if (closed) return;
							if (!started) {
								setDownloadState(uuid, 'idle');
								return;
							}
							haptics.double();
							setDownloadState(uuid, 'done', 2000);
							announceStatus('Загрузка началась');
						}
					});
				});

				pswp.on('afterInit', () => {
					if (pswp?.topBar) {
						pswp.topBar.setAttribute('role', 'toolbar');
						pswp.topBar.setAttribute('aria-label', 'Управление просмотром');
					}
				});

				let lastIndex = index;
				pswp.on('change', () => {
					updateButtonState();
					if (animateSlides && pswp) applySlideDepth(pswp.mainScroll.x);
					if (pswp && pswp.currIndex !== lastIndex) {
						lastIndex = pswp.currIndex;
						haptics.tick();
					}
				});

				// Прерываем доезд отмены predictive back, если пользователь снова коснулся экрана или начал закрытие
				pswp.on('pointerDown', back.finishFlight);
				pswp.on('close', () => back.stop(true));

				// Закрыли крестиком, Esc или свайпом: шаг истории назад
				pswp.on('destroy', () => {
					back.stop();
					releaseBackDriver();
					clearTimers();
					if (closed) return;
					closed = true;
					closeOverlay();
				});
				// «Назад» во время раскрытия PhotoSwipe пропускает: дожидаемся конца анимации
				pswp.on('openingAnimationEnd', () => closed && pswp?.destroy());
				pswp.init();
			} catch (e) {
				console.error(e);
				if (!closed) {
					closed = true;
					closeOverlay();
				}
			}
		})();

		// «Назад» в браузере: оверлея уже нет в истории, просто убираем просмотр
		return () => {
			closed = true;
			back.stop();
			releaseBackDriver();
			clearTimers();
			origins = undefined;
			pswp?.destroy();
			pswp = undefined;
		};
	});
</script>

<!-- Невидимый барьер, пока PhotoSwipe инициализируется: блокирует клики сквозь оверлей и отдаёт safe-area в px -->
<div class="pswp-barrier" aria-hidden="true" bind:this={barrierEl}></div>
<!-- Скрытая живая область: скринридер озвучивает результат скачивания, визуально достаточно самой кнопки -->
<div class="pswp-status" role="status" aria-live="polite" aria-atomic="true">{statusText}</div>

<style>
	:global(.pswp .pswp__top-bar) {
		top: env(safe-area-inset-top, 0px);
		padding-left: env(safe-area-inset-left, 0px);
		padding-right: env(safe-area-inset-right, 0px);
	}

	:global(.pswp .pswp__button--arrow--prev) {
		left: env(safe-area-inset-left, 0px);
	}

	:global(.pswp .pswp__button--arrow--next) {
		right: env(safe-area-inset-right, 0px);
	}

	:global(.pswp__redtf-caption:not(:empty)) {
		position: absolute;
		inset: auto 0 0;
		z-index: 1;
		padding: 8px calc(16px + env(safe-area-inset-right, 0px))
			calc(8px + env(safe-area-inset-bottom, 0px)) calc(16px + env(safe-area-inset-left, 0px));
		background: rgb(0 0 0 / 65%);
		color: white;
		text-align: center;
	}

	/* Состояния кнопки скачивания (база для всех тем) */
	:global(.pswp .pswp__download-icon) {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		pointer-events: none;
		opacity: 0;
		scale: 0.7;
		transition: opacity 160ms ease, scale 180ms cubic-bezier(0.165, 0.84, 0.44, 1);
	}

	:global(.pswp .pswp__download-icon .pswp__icn) {
		position: static;
	}

	:global(.pswp .pswp__button--download:not([data-state]) .pswp__download-icon--idle),
	:global(.pswp .pswp__button--download[data-state='idle'] .pswp__download-icon--idle),
	:global(.pswp .pswp__button--download[data-state='loading'] .pswp__download-icon--loading),
	:global(.pswp .pswp__button--download[data-state='done'] .pswp__download-icon--done) {
		opacity: 1;
		scale: 1;
	}

	:global(.pswp .pswp__download-icon--loading::before) {
		content: '';
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: conic-gradient(from 0deg, transparent 10%, currentColor);
		mask: radial-gradient(farthest-side, transparent calc(100% - 2.2px), #000 calc(100% - 1.8px));
		animation: -global-pswp-spin 0.75s linear infinite;
	}

	:global(.pswp .pswp__button--download[data-state='done']) {
		color: #4cd964;
	}

	.pswp-status {
		position: fixed;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		pointer-events: none;
	}

	@keyframes -global-pswp-spin {
		to {
			rotate: 360deg;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.pswp .pswp__download-icon) {
			transition: none;
		}

		:global(.pswp .pswp__download-icon--loading::before) {
			animation-duration: 1.6s;
		}
	}

	.pswp-barrier {
		position: fixed;
		inset: 0;
		z-index: 99999;
		padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
			env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
		pointer-events: auto;
	}
</style>
