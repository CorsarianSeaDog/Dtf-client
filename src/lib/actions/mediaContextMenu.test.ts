import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMediaContextMenu } from './mediaContextMenu';
import { api } from '$lib/api/index.svelte';
import * as utils from '$lib/api/utils';
import { openOverlay } from '$lib/navigation';
import { notify } from '$lib/themes/dtf2022/ui/notify.svelte';

const capacitorMock = vi.hoisted(() => ({
	isNative: vi.fn().mockReturnValue(false)
}));

const authMock = vi.hoisted(() => ({
	isAuthenticated: true
}));

vi.mock('$lib/capacitor', () => ({
	isNative: capacitorMock.isNative
}));

vi.mock('$lib/api/index.svelte', () => ({
	api: {
		addFavoriteGif: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/navigation', () => ({
	openOverlay: vi.fn()
}));

vi.mock('$lib/storage/auth.svelte', () => ({
	authStorage: {
		get isAuthenticated() {
			return authMock.isAuthenticated;
		}
	}
}));

vi.mock('$lib/api/utils', async () => {
	const actual = await vi.importActual<typeof utils>('$lib/api/utils');
	return {
		...actual,
		downloadImage: vi.fn().mockResolvedValue(undefined)
	};
});

vi.mock('$lib/themes/dtf2022/ui/notify.svelte', () => ({
	notify: {
		success: vi.fn(),
		error: vi.fn()
	}
}));

describe('buildMediaContextMenu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		capacitorMock.isNative.mockReturnValue(false);
		authMock.isAuthenticated = true;
	});

	it('добавляет в избранное, скачивает mp4-оригинал, копирует ссылку и включает «Открыть в новой вкладке» в вебе', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });

		const payload = buildMediaContextMenu({ uuid: 'gif-uuid-1', width: 320, height: 240, size: 1234, isGif: true });
		expect(payload.title).toBe('GIF');
		expect(payload.items.map((item) => item.id)).toEqual(['favorite', 'download', 'open-tab', 'copy-link']);

		await payload.items.find((item) => item.id === 'favorite')!.action!();
		expect(api.addFavoriteGif).toHaveBeenCalledWith({ uuid: 'gif-uuid-1', width: 320, height: 240, size: 1234 });
		expect(notify.success).toHaveBeenCalledWith('GIF добавлена в избранное');

		const openTabItem = payload.items.find((item) => item.id === 'open-tab')!;
		expect(openTabItem.href).toBe('https://leonardo.osnova.io/gif-uuid-1/');
		expect(openTabItem.target).toBe('_blank');

		await payload.items.find((item) => item.id === 'download')!.action!();
		expect(utils.downloadImage).toHaveBeenCalledWith('https://leonardo.osnova.io/gif-uuid-1/', 'gif-uuid-1', 'mp4');
		expect(notify.success).toHaveBeenCalledWith('Загрузка началась');

		await payload.items.find((item) => item.id === 'copy-link')!.action!();
		expect(writeText).toHaveBeenCalledWith('https://leonardo.osnova.io/gif-uuid-1/');
		expect(notify.success).toHaveBeenCalledWith('Ссылка скопирована');
	});

	it('при попытке добавить GIF в избранное без входа открывает окно авторизации', async () => {
		authMock.isAuthenticated = false;
		const payload = buildMediaContextMenu({ uuid: 'gif-uuid-1', isGif: true });
		await payload.items.find((item) => item.id === 'favorite')!.action!();
		expect(openOverlay).toHaveBeenCalledWith({ type: 'login' });
		expect(api.addFavoriteGif).not.toHaveBeenCalled();
	});

	it('показывает «Удалить из избранного» вместо добавления, если передан onRemoveFavorite', async () => {
		const onRemoveFavorite = vi.fn().mockResolvedValue(undefined);
		const payload = buildMediaContextMenu({ uuid: 'gif-uuid-1', isGif: true, onRemoveFavorite });
		expect(payload.items.map((item) => item.id)).toEqual(['download', 'open-tab', 'copy-link', 'unfavorite']);

		const unfavorite = payload.items.find((item) => item.id === 'unfavorite')!;
		expect(unfavorite.danger).toBe(true);
		expect(unfavorite.separatorBefore).toBe(true);
		await unfavorite.action!();
		expect(onRemoveFavorite).toHaveBeenCalledTimes(1);
	});

	it('скрывает «Открыть в новой вкладке» в нативном приложении и добавляет «Поделиться» при navigator.share', async () => {
		capacitorMock.isNative.mockReturnValue(true);
		const share = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });

		const payload = buildMediaContextMenu({ uuid: 'video-uuid-1', isGif: false });
		expect(payload.title).toBe('Видео');
		expect(payload.items.map((item) => item.id)).toEqual(['download', 'copy-link', 'share']);

		await payload.items.find((item) => item.id === 'share')!.action!();
		expect(share).toHaveBeenCalledWith({
			title: 'Видео',
			url: 'https://leonardo.osnova.io/video-uuid-1/'
		});
	});
});
