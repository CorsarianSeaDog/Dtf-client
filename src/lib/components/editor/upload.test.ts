import { describe, it, expect } from 'vitest';
import { IMAGE_URL_PATTERN, mediaFromUrl } from './upload';

// EditorJS принимает вставку как адрес, только если шаблон совпал со всей строкой
const wholeMatch = (text: string) => IMAGE_URL_PATTERN.exec(text)?.[0] === text;

describe('IMAGE_URL_PATTERN', () => {
	it('узнаёт адрес картинки отдельной строкой', () => {
		expect(wholeMatch('https://leonardo.osnova.io/abc/-/preview/1.jpg')).toBe(true);
		expect(wholeMatch('http://example.com/a/b.PNG')).toBe(true);
		expect(wholeMatch('https://example.com/a.webp?w=640&h=480')).toBe(true);
		expect(wholeMatch('  https://example.com/a.gif \n')).toBe(true);
	});

	it('не трогает остальной текст', () => {
		expect(wholeMatch('https://example.com/page')).toBe(false);
		expect(wholeMatch('https://example.com/a.jpg.html')).toBe(false);
		expect(wholeMatch('смотри https://example.com/a.jpg')).toBe(false);
		expect(wholeMatch('https://example.com/a.jpg и ещё')).toBe(false);
		expect(wholeMatch('a.jpg')).toBe(false);
	});
});

const respond = (body: Blob, ok = true) => (async () => ({ ok, status: ok ? 200 : 404, blob: async () => body })) as unknown as typeof fetch;

describe('mediaFromUrl', () => {
	it('отдаёт файл с именем из адреса и типом ответа', async () => {
		const file = await mediaFromUrl('https://example.com/img/cat%20one.png?w=1', respond(new Blob(['x'], { type: 'image/png' })));
		expect(file.name).toBe('cat one.png');
		expect(file.type).toBe('image/png');
	});

	it('отказывает, если там не картинка и не видео', async () => {
		await expect(mediaFromUrl('https://example.com/a.jpg', respond(new Blob(['<html>'], { type: 'text/html' })))).rejects.toThrow('не картинка');
	});

	it('сообщает про отказ сайта (CORS) и про ошибку ответа', async () => {
		const cors = (async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		await expect(mediaFromUrl('https://example.com/a.jpg', cors)).rejects.toThrow('не разрешает');
		await expect(mediaFromUrl('https://example.com/a.jpg', respond(new Blob(), false))).rejects.toThrow('не разрешает');
	});
});
