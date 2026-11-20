import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMediaContextMenu } from './mediaContextMenu';
import * as utils from '$lib/api/utils';
import { notify } from '$lib/themes/dtf2022/ui/notify.svelte';

const capacitorMock = vi.hoisted(() => ({
	isNative: vi.fn().mockReturnValue(false)
}));

vi.mock('$lib/capacitor', () => ({
	isNative: capacitorMock.isNative
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
	});

	it('скачивает mp4-оригинал, копирует ссылку и включает «Открыть в новой вкладке» в вебе', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });

		const payload = buildMediaContextMenu({ uuid: 'gif-uuid-1', isGif: true });
		expect(payload.title).toBe('GIF');
		expect(payload.items.map((item) => item.id)).toEqual(['download', 'open-tab', 'copy-link']);

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
