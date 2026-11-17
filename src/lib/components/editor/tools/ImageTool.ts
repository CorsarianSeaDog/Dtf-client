import { activeTheme } from '$lib/themes/index.svelte';
import { play } from '$lib/motion';
import { mountUploadProgress, type UploadProgressHandle } from '$lib/components/mountUploadProgress.svelte';
import {
	IMAGE_URL_PATTERN,
	MEDIA_MIME_TYPES,
	createMediaEl,
	isAbortError,
	mediaFromUrl,
	uploadToFile,
	waitMediaReady
} from '../upload';

/**
 * Расширяет стандартный `@editorjs/image`:
 * - мгновенно показывает локальное превью через `URL.createObjectURL` (без задержки `FileReader` на видео);
 * - рисует единый индикатор прогресса загрузки и серверной обработки;
 * - плавно проявляет загруженное медиа через `mediaIn` темы.
 */
export function createImageTool(BaseImageTool: any) {
	return class ProgressImageTool extends BaseImageTool {
		private abortController: AbortController | null = null;
		private progressHandle: UploadProgressHandle | null = null;
		private previewUrl: string | null = null;
		private previewEl: HTMLElement | null = null;
		private uploading = false;
		private aborted = false;

		/**
		 * Вставка и перетаскивание: файлы (картинки и видео), адрес картинки отдельной строкой и `<img>` из страницы.
		 * Несколько файлов EditorJS раскладывает сам: на каждый файл свой блок.
		 */
		static get pasteConfig() {
			return {
				...super.pasteConfig,
				patterns: { image: IMAGE_URL_PATTERN },
				files: { mimeTypes: MEDIA_MIME_TYPES }
			};
		}

		constructor(params: any) {
			let runUpload: ((file: File) => Promise<any>) | undefined;
			super({
				...params,
				config: {
					...params.config,
					uploader: {
						uploadByFile: (file: File) => runUpload!(file),
						// DTF грузит только файлы: адрес сначала скачиваем (EditorJS зовёт его при вставке адреса и `<img>`)
						uploadByUrl: async (url: string) => runUpload!(await mediaFromUrl(url.trim()))
					}
				}
			});

			const ui = this.ui;
			const origShowPreloader = ui.showPreloader.bind(ui);
			const origHidePreloader = ui.hidePreloader.bind(ui);
			const origFillImage = ui.fillImage.bind(ui);

			ui.showPreloader = (src: string) => {
				// Игнорируем отложенный FileReader из базового класса во время нашей загрузки или после неё
				if (this.uploading || ui.nodes.wrapper.classList.contains('image-tool--filled')) return;
				origShowPreloader(src);
			};

			ui.hidePreloader = () => {
				this.clearUploadUi();
				origHidePreloader();
			};

			ui.fillImage = (url: string) => {
				origFillImage(url);
				const mediaEl = ui.nodes.imageEl as HTMLImageElement | HTMLVideoElement | undefined;
				if (!mediaEl) return;

				void waitMediaReady(mediaEl).then(async () => {
					const handle = this.progressHandle;
					this.progressHandle = null;
					ui.nodes.wrapper.classList.remove('dtf-image-uploading');
					this.clearPreview();
					play(mediaEl, activeTheme.motion?.mediaIn);
					await handle?.finish();
				});
			};

			runUpload = async (file: File) => {
				this.clearUploadUi();
				this.uploading = true;
				this.aborted = false;

				const controller = new AbortController();
				this.abortController = controller;

				ui.nodes.wrapper.classList.add('dtf-image-uploading');
				ui.toggleStatus('uploading');

				this.previewUrl = URL.createObjectURL(file);
				this.previewEl = createMediaEl(this.previewUrl, file.type.startsWith('video/'), 'dtf-upload-preview', true);
				ui.nodes.imageContainer.appendChild(this.previewEl);
				play(ui.nodes.imageContainer, activeTheme.motion?.uploadIn);

				this.progressHandle = mountUploadProgress(ui.nodes.imageContainer, {
					size: 'lg',
					oncancel: () => {
						this.aborted = true;
						controller.abort();
					}
				});

				try {
					const uploaded = await uploadToFile(file, {
						signal: controller.signal,
						onProgress: (info) => {
							this.progressHandle?.update({
								progress: info.progress,
								processing: !!info.processing
							});
						}
					});
					this.uploading = false;
					this.progressHandle?.update({ progress: 1, processing: true });
					return { success: 1, file: uploaded };
				} catch (err) {
					this.uploading = false;
					if (this.aborted || isAbortError(err)) {
						this.aborted = true;
					} else {
						console.error('Upload failed:', err);
					}
					throw err;
				}
			};
		}

		uploadingFailed(err: unknown) {
			this.clearUploadUi();
			if (this.aborted) {
				this.aborted = false;
				this.ui.hidePreloader();
				return;
			}
			super.uploadingFailed(err);
		}

		private clearPreview() {
			this.previewEl?.remove();
			this.previewEl = null;
			if (this.previewUrl) {
				URL.revokeObjectURL(this.previewUrl);
				this.previewUrl = null;
			}
		}

		private clearUploadUi() {
			this.uploading = false;
			this.abortController?.abort();
			this.abortController = null;
			this.progressHandle?.destroy();
			this.progressHandle = null;
			this.ui?.nodes?.wrapper?.classList.remove('dtf-image-uploading');
			this.clearPreview();
		}

		destroy() {
			this.aborted = true;
			this.clearUploadUi();
		}
	};
}
