<script lang="ts">
	import { onMount } from 'svelte';
	import { downloadImage, getLeonardoOriginalUrl, getLeonardoUrl, hasNativeDownload } from '$lib/api/utils';
	import { haptics } from '$lib/haptics';
	import { closeOverlay, preloadLightbox, takeLightboxOrigins } from '$lib/navigation';
	import { sanitizeHtml } from '$lib/sanitize';

	type DownloadState = 'idle' | 'loading' | 'done';

	/** Просмотр медиа на весь экран через PhotoSwipe */
	let {
		images,
		index
	}: Extract<App.OverlayData, { type: 'lightbox' }>['data'] = $props();

	const MAX_WIDTH = 2048;

	const DEFAULT_DOWNLOAD_SVG =
		'<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32">' +
		'<use class="pswp__icn-shadow" xlink:href="#pswp__icn-download"></use>' +
		'<path d="M15 6h2v9h4l-5 5-5-5h4V6zM7 21v4h18v-4h2v6H5v-6h2z" id="pswp__icn-download"/></svg>';

	const DEFAULT_CHECK_SVG =
		'<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="M5.5 12.5l4.2 4.2L18.5 7.5"/></svg>';

	let statusText = $state('');

	onMount(() => {
		let origins = takeLightboxOrigins();
		let closed = false;
		let pswp: import('photoswipe').default | undefined;
		let downloadBtn: HTMLButtonElement | undefined;
		let announceFrame = 0;

		const downloads = new Map<string, { state: DownloadState; timer?: ReturnType<typeof setTimeout> }>();

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

				pswp = new PhotoSwipe({
					index,
					// Стандартные 0.8 просвечивают страницу под просмотром
					bgOpacity: 0.92,
					closeTitle: 'Закрыть',
					zoomTitle: 'Увеличить',
					arrowPrevTitle: 'Предыдущее',
					arrowNextTitle: 'Следующее',
					errorMsg: 'Не удалось загрузить изображение',
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
							`<span class="pswp__download-icon pswp__download-icon--idle" aria-hidden="true">${DEFAULT_DOWNLOAD_SVG}</span>` +
							'<span class="pswp__download-icon pswp__download-icon--loading" aria-hidden="true"></span>' +
							`<span class="pswp__download-icon pswp__download-icon--done" aria-hidden="true">${DEFAULT_CHECK_SVG}</span>`,
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
					if (pswp && pswp.currIndex !== lastIndex) {
						lastIndex = pswp.currIndex;
						haptics.tick();
					}
				});

				// Закрыли крестиком, Esc или свайпом: шаг истории назад
				pswp.on('destroy', () => {
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
			clearTimers();
			origins = undefined;
			pswp?.destroy();
			pswp = undefined;
		};
	});
</script>

<!-- Невидимый барьер, пока PhotoSwipe инициализируется: блокирует повторные клики сквозь оверлей -->
<div class="pswp-barrier" aria-hidden="true"></div>
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
		pointer-events: auto;
	}
</style>
