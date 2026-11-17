import { api } from '$lib/api/index.svelte';
import type { UploadOptions } from '$lib/api/types';
import { editorMediaUrl } from './mapper';

/** Загружает файл на DTF и возвращает его в виде файла блока редактора (см. `mapper.ts`) */
export async function uploadToFile(file: File, options?: UploadOptions) {
	const result = await api.uploadMedia(file, options);
	const isVideo =
		!!result.isVideo ||
		['movie', 'video/mp4', 'video/webm', 'mp4', 'gif'].includes(result.type ?? '') ||
		file.type.startsWith('video/');

	return {
		url: editorMediaUrl(result.uuid, isVideo),
		uuid: result.uuid,
		width: result.width,
		height: result.height,
		type: result.type || (isVideo ? 'movie' : 'image'),
		size: result.size,
		color: result.color,
		...(isVideo && { isVideo: true, duration: result.duration, has_audio: result.has_audio })
	};
}

export function isAbortError(err: unknown): boolean {
	return err instanceof DOMException && err.name === 'AbortError';
}

export function createMediaEl(
	src: string,
	isVideo: boolean,
	className: string,
	preview = false
): HTMLImageElement | HTMLVideoElement {
	const el = document.createElement(isVideo ? 'video' : 'img');
	el.className = className;
	el.src = src;
	if (el instanceof HTMLVideoElement) {
		el.muted = true;
		el.playsInline = true;
		if (preview) {
			el.preload = 'metadata';
		} else {
			el.loop = true;
			el.autoplay = true;
		}
	}
	return el;
}

export function waitMediaReady(el: HTMLImageElement | HTMLVideoElement, timeoutMs = 4000): Promise<void> {
	if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) return Promise.resolve();
	if (el instanceof HTMLVideoElement && el.readyState >= 2) return Promise.resolve();

	return new Promise((resolve) => {
		const readyEvent = el instanceof HTMLVideoElement ? 'loadeddata' : 'load';
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			el.removeEventListener(readyEvent, finish);
			el.removeEventListener('error', finish);
			resolve();
		};
		const timer = setTimeout(finish, timeoutMs);
		el.addEventListener(readyEvent, finish, { once: true });
		el.addEventListener('error', finish, { once: true });
	});
}

/** Типы файлов, которые блок картинки берёт при вставке и перетаскивании (то же, что в выборе файла, см. `config.ts`) */
export const MEDIA_MIME_TYPES = ['image/*', 'video/mp4', 'video/webm', 'video/quicktime'];

/**
 * Адрес картинки отдельной строкой. EditorJS сверяет с шаблоном всю вставленную строку целиком,
 * поэтому пробелы по краям и параметры запроса (`?w=640&h=480`) учтены здесь.
 */
export const IMAGE_URL_PATTERN = /^\s*https?:\/\/\S+\.(gif|jpe?g|png|webp|avif)(\?\S*)?(#\S*)?\s*$/i;

/**
 * Скачивает картинку или видео по адресу и отдаёт файлом, который уходит в обычную загрузку.
 * DTF принимает только файлы (`uploader/upload`), поэтому скачивает браузер: чужие сайты без CORS откажут.
 */
export async function mediaFromUrl(url: string, load: typeof fetch = fetch): Promise<File> {
	let blob: Blob;
	try {
		const response = await load(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		blob = await response.blob();
	} catch {
		throw new Error('Не удалось скачать файл по адресу: сайт не разрешает загрузку. Сохраните файл и перетащите его в редактор');
	}
	if (!/^(image|video)\//.test(blob.type)) throw new Error('По этому адресу не картинка и не видео');

	const name = decodeURIComponent(new URL(url, 'https://x.invalid').pathname.split('/').pop() || '') || 'image';
	return new File([blob], name, { type: blob.type });
}
