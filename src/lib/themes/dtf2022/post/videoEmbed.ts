const ID = /^[\w-]+$/;

/** Адрес плеера внешнего видео (`external_service` блока video). Неизвестный сервис или мусорный id — null, чтобы в iframe не попал произвольный адрес */
export function videoEmbedSrc(service?: { name?: string; id?: string }): string | null {
	const id = service?.id;
	if (!id || !ID.test(id)) return null;
	if (service.name === 'youtube') return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
	if (service.name === 'coub') return `https://coub.com/embed/${id}?autostart=true&muted=false`;
	return null;
}
