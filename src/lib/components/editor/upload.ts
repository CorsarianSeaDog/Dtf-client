import { api } from '$lib/api/index.svelte';
import { editorMediaUrl } from './mapper';

/** Загружает файл на DTF и возвращает его в виде файла блока редактора (см. `mapper.ts`) */
export async function uploadToFile(file: File) {
	const result = await api.uploadMedia(file);
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
