import type { Comment, DtfEditorBlock, DtfEditorEntry } from './types';

/** Собирает запись редактора для `POST /v2.31/editor` со значениями по умолчанию */
export function buildEditorEntry(blocks: DtfEditorBlock[], original?: Partial<DtfEditorEntry>): DtfEditorEntry {
	return {
		id: original?.id || 0,
		...(original?.user_id !== undefined ? { user_id: original.user_id } : {}),
		type: original?.type ?? 1,
		subsite_id: original?.subsite_id || 0,
		title: original?.title || '',
		is_published: original?.is_published ?? false,
		is_adult: original?.is_adult ?? false,
		is_enabled_comments: original?.is_enabled_comments ?? true,
		is_enabled_likes: original?.is_enabled_likes ?? true,
		is_enabled_ad: original?.is_enabled_ad ?? true,
		...(original?.repostId ? { repostId: original.repostId, repostData: null } : {}),
		entry: { blocks }
	};
}

/** Уникальный ключ записи для списков и дедупликации */
export const postKey = (post: { sourceId: string; id: number }) => `${post.sourceId}_${post.id}`;

/** Дописывает элементы без повторов по ключу (убирает дубли и внутри новой страницы, и между страницами) */
export function appendUnique<T>(existing: readonly T[], incoming: readonly T[], keyOf: (item: T) => string | number): T[] {
	const seen = new Set(existing.map(keyOf));
	const fresh: T[] = [];
	for (const item of incoming) {
		const key = keyOf(item);
		if (seen.has(key)) continue;
		seen.add(key);
		fresh.push(item);
	}
	return existing.length ? [...existing, ...fresh] : fresh;
}

/** Вместо текста сервер отдаёт заглушку: комментарий удалён, автор заморожен или комментарий скрыт баном */
export function isStubComment(c: Comment): boolean {
	return !!(c.isRemoved || c.author.isFrozen || c.isHiddenByBan);
}

export function getLeonardoUrl(
	uuid: string,
	options: { format?: string; width?: number; scale_crop?: string; original?: boolean; animated?: boolean } = {}
): string {
	if (!uuid) return '';
	if (uuid.startsWith('http://') || uuid.startsWith('https://')) return uuid;
	if (options.original) {
		return `https://leonardo.osnova.io/${uuid}/`;
	}

	let url = `https://leonardo.osnova.io/${uuid}/-`;

	if (options.width) {
		url += `/preview/${options.width}/-`;
	} else if (options.scale_crop) {
		url += `/scale_crop/${options.scale_crop}/-`;
	}

	const format = options.format || 'webp';
	url += `/format/${format}/`;

	if (options.animated) url += '#video';

	return url;
}

/** Определяет, является ли медиа-запись DTF анимированной (GIF / MP4) */
export function isAnimatedMedia(media: any): boolean {
	const type = media?.data?.type?.toLowerCase();
	return Boolean(
		media?.type === 'movie' ||
		media?.data?.isVideo ||
		type === 'gif' ||
		type === 'mp4' ||
		type === 'webm' ||
		media?.data?.duration
	);
}

/** Для меню медиа: анимированный ролик без звуковой дорожки считаем GIF, со звуком — видео */
export function isGifMedia(media: any): boolean {
	return isAnimatedMedia(media) && !media?.data?.has_audio;
}

/** Если адрес помечен `#video`, возвращает ссылку на MP4 в Leonardo */
export function getAnimatedVideoUrl(url?: string): string | undefined {
	if (!url?.endsWith('#video')) return undefined;
	const match = /^https:\/\/leonardo\.osnova\.io\/([^/]+)\//.exec(url);
	return match ? `https://leonardo.osnova.io/${match[1]}/-/format/mp4/` : undefined;
}

/** Файл блока audio: Leonardo отдаёт его с Range, плееру этого хватает */
export function getAudioUrl(uuid: string, filename: string): string {
	return `https://leonardo.osnova.io/audio/${uuid}/${encodeURIComponent(filename)}`;
}

/** Получить прямую ссылку на оригинал изображения без сжатия и ресайза */
export function getLeonardoOriginalUrl(uuid: string): string {
	return getLeonardoUrl(uuid, { original: true });
}

/** Определение расширения файла по MIME-типу с запасным типом из данных блока */
export function resolveImageExtension(mime?: string, type?: string): string {
	if (mime && mime !== 'application/octet-stream') {
		if (mime.includes('png')) return 'png';
		if (mime.includes('gif')) return 'gif';
		if (mime.includes('webp')) return 'webp';
		if (mime.includes('avif')) return 'avif';
		if (mime.includes('svg')) return 'svg';
		if (mime.includes('mp4')) return 'mp4';
		if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
	}
	if (type) {
		const clean = type.replace(/^\./, '').toLowerCase();
		return clean === 'jpeg' ? 'jpg' : clean;
	}
	return 'jpg';
}

/** Построение имени файла для скачивания оригинала */
export function getDownloadFilename(uuid: string, ext: string): string {
	if (uuid.startsWith('http://') || uuid.startsWith('https://')) {
		try {
			const pathname = new URL(uuid).pathname;
			const lastSegment = pathname.split('/').filter(Boolean).pop();
			if (lastSegment && lastSegment.includes('.')) {
				return lastSegment;
			}
		} catch {
			// fallback к uuid.ext
		}
	}
	return `${uuid}.${ext}`;
}

/** Доступен ли системный загрузчик Android (DownloadManager через мост оболочки) */
export function hasNativeDownload(): boolean {
	return typeof window !== 'undefined' && typeof (window as any).AndroidBridge?.download === 'function';
}

/** Скачать файл изображения по прямой ссылке в полном качестве. Возвращает `false`, если пользователь отменил сохранение */
export async function downloadImage(url: string, uuid: string, fallbackType?: string): Promise<boolean> {
	if (typeof window === 'undefined') return false;

	const ext = resolveImageExtension(undefined, fallbackType);
	const filename = getDownloadFilename(uuid, ext);
	const mime = ext === 'mp4' ? 'video/mp4' : ext === 'gif' ? 'image/gif' : `image/${ext}`;

	// В нативном приложении Capacitor (Android) передаём загрузку системному DownloadManager
	if (hasNativeDownload()) {
		const queued = (window as any).AndroidBridge.download(url, filename, mime);
		if (queued) return true;
	}

	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const blob = await res.blob();
		const resolvedExt = resolveImageExtension(blob.type, fallbackType);
		const resolvedFilename = getDownloadFilename(uuid, resolvedExt);

		if (typeof navigator !== 'undefined' && 'canShare' in navigator) {
			try {
				const file = new File([blob], resolvedFilename, { type: blob.type });
				if (navigator.canShare?.({ files: [file] })) {
					await navigator.share({ files: [file], title: resolvedFilename });
					return true;
				}
			} catch (e: any) {
				if (e?.name === 'AbortError') return false;
			}
		}

		const blobUrl = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = blobUrl;
		link.download = resolvedFilename;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
		return true;
	} catch {
		const fallbackFilename = getDownloadFilename(uuid, ext);
		const link = document.createElement('a');
		link.href = url;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.download = fallbackFilename;
		document.body.appendChild(link);
		link.click();
		link.remove();
		return true;
	}
}

