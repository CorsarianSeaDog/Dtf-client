import { getLeonardoOriginalUrl, downloadImage } from '$lib/api/utils';
import { isNative } from '$lib/capacitor';
import { contextMenu, type ContextMenuItem, type ContextMenuPayload } from '$lib/contextMenu.svelte';
import { notify } from '$lib/themes/dtf2022/ui/notify.svelte';

export interface MediaContextOptions {
	uuid: string;
	isGif?: boolean;
}

/** Формирует пункты контекстного меню для GIF и видео */
export function buildMediaContextMenu({ uuid, isGif = false }: MediaContextOptions): ContextMenuPayload {
	const originalUrl = getLeonardoOriginalUrl(uuid);
	const title = isGif ? 'GIF' : 'Видео';

	const items: ContextMenuItem[] = [
		{
			id: 'download',
			label: isGif ? 'Сохранить GIF' : 'Сохранить видео',
			icon: 'ui_download',
			async action() {
				try {
					// Оригинал на Leonardo для гифок и видео отдаётся как video/mp4
					await downloadImage(originalUrl, uuid, 'mp4');
					notify.success('Загрузка началась');
				} catch {
					notify.error('Не удалось скачать файл');
				}
			}
		}
	];

	if (!isNative()) {
		items.push({
			id: 'open-tab',
			label: 'Открыть в новой вкладке',
			icon: 'v_external',
			href: originalUrl,
			target: '_blank',
			rel: 'noopener noreferrer'
		});
	}

	items.push({
		id: 'copy-link',
		label: 'Копировать ссылку',
		icon: 'v_link',
		async action() {
			try {
				await navigator.clipboard.writeText(originalUrl);
				notify.success('Ссылка скопирована');
			} catch {
				notify.error('Не удалось скопировать ссылку');
			}
		}
	});

	if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
		items.push({
			id: 'share',
			label: 'Поделиться',
			icon: 'v_share',
			async action() {
				try {
					await navigator.share({ title, url: originalUrl });
				} catch (e: unknown) {
					if ((e as { name?: string })?.name !== 'AbortError') {
						notify.error('Не удалось поделиться');
					}
				}
			}
		});
	}

	return {
		title,
		label: isGif ? 'Действия с GIF' : 'Действия с видео',
		items
	};
}

/** Контекстное меню (ПКМ и удержание) для видео и GIF */
export function mediaContextMenu(options: MediaContextOptions) {
	return contextMenu(() => buildMediaContextMenu(options));
}
