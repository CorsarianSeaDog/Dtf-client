import { describe, expect, it } from 'vitest';
import { extractMediaFiles, isImageFile } from './clipboard';

describe('clipboard', () => {
	it('определяет картинку по типу или расширению', () => {
		expect(isImageFile(new File([], 'pic.png', { type: 'image/png' }))).toBe(true);
		expect(isImageFile(new File([], 'photo.jpg', { type: '' }))).toBe(true);
		expect(isImageFile(new File([], 'doc.pdf', { type: 'application/pdf' }))).toBe(false);
	});

	it('извлекает картинки и видео из files', () => {
		const img = new File([], 'screenshot.png', { type: 'image/png' });
		const video = new File([], 'blob', { type: 'video/mp4' });
		const doc = new File([], 'doc.txt', { type: 'text/plain' });
		const data = {
			files: [img, doc, video]
		} as unknown as DataTransfer;

		expect(extractMediaFiles(data)).toEqual([img, video]);
	});

	it('извлекает файлы из items, если files пуст', () => {
		const img = new File([], 'blob.png', { type: 'image/png' });
		const video = new File([], 'clip.MOV');
		const data = {
			files: [],
			items: [
				{ kind: 'string', type: 'text/plain' },
				{ kind: 'file', type: 'image/png', getAsFile: () => img },
				{ kind: 'file', type: '', getAsFile: () => video },
				{ kind: 'file', type: 'video/mp4', getAsFile: () => null }
			]
		} as unknown as DataTransfer;

		expect(extractMediaFiles(data)).toEqual([img, video]);
	});

	it('возвращает пустой массив для пустого или невалидного буфера', () => {
		expect(extractMediaFiles(null)).toEqual([]);
		expect(extractMediaFiles(undefined)).toEqual([]);
		expect(extractMediaFiles({ files: [] } as unknown as DataTransfer)).toEqual([]);
	});
});
