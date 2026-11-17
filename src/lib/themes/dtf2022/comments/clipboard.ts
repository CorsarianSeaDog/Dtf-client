/** Проверяет, является ли файл картинкой (по MIME-типу или расширению) */
export function isImageFile(file: File): boolean {
	return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(file.name);
}

export function isVideoFile(file: File): boolean {
	return file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
}

function isMediaFile(file: File | null): file is File {
	return file !== null && (isImageFile(file) || isVideoFile(file));
}

/** Извлекает изображения и видео из буфера обмена (через files или DataTransferItemList) */
export function extractMediaFiles(data: DataTransfer | null | undefined): File[] {
	if (!data) return [];

	const fromFiles = Array.from(data.files ?? []).filter(isMediaFile);
	if (fromFiles.length > 0) return fromFiles;

	return Array.from(data.items ?? [])
		.filter((item) => item.kind === 'file')
		.map((item) => item.getAsFile())
		.filter(isMediaFile);
}
