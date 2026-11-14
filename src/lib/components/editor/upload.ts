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
