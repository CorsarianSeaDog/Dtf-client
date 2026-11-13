import { describe, it, expect } from 'vitest';
import { dtfToEditorJs, editorJsToDtf } from './mapper';
import type { DtfEditorEntry } from '$lib/api/types';

const entryOf = (blocks: any[]) => ({ id: 1, entry: { blocks } }) as unknown as DtfEditorEntry;
const block = (type: string, data: any) => ({ type, data, cover: false, hidden: false, anchor: '' });
const roundTrip = (blocks: any[]) => editorJsToDtf(dtfToEditorJs(entryOf(blocks))).entry.blocks;

describe('editor mapper', () => {
	it('заголовки h2 и h3 проходят туда и обратно', () => {
		const blocks = [block('header', { style: 'h2', text: 'a' }), block('header', { style: 'h3', text: 'b' })];
		expect(roundTrip(blocks).map((b: any) => b.data.style)).toEqual(['h2', 'h3']);
	});

	it('галерея и неизвестные блоки уходят на сервер без служебных полей', () => {
		const gallery = block('media', { items: [{ title: '1' }, { title: '2' }] });
		const tweet = block('tweet', { tweet: { url: 'x' } });
		const [g, t] = roundTrip([gallery, tweet]);
		expect(g).toMatchObject({ type: 'media', data: gallery.data });
		expect(t).toMatchObject({ type: 'tweet', data: tweet.data });
		expect(JSON.stringify([g, t])).not.toContain('_isFallback');
	});

	it('галерея открывается блоком и уходит обратно с теми же картинками', () => {
		const image = (uuid: string) => ({ type: 'image', data: { uuid, width: 2, height: 1, size: 3, type: 'png', color: '000000' } });
		const media = block('media', { items: [1, 2, 3].map((n) => ({ title: `${n}`, image: image(`u${n}`) })) });
		expect(dtfToEditorJs(entryOf([media])).blocks[0].type).toBe('gallery');
		expect(roundTrip([media])[0].data).toEqual(media.data);
	});

	it('гифка остаётся видео: isVideo и длительность не теряются', () => {
		const gif = { uuid: 'g', width: 360, height: 362, size: 4, type: 'gif', color: '040404', isVideo: true, duration: 9.8, has_audio: false };
		const media = block('media', { items: [{ title: '', image: { type: 'image', data: gif } }] });
		const [out] = roundTrip([media]);
		expect((out.data as any).items[0].image).toEqual({ type: 'image', data: gif });
		expect((dtfToEditorJs(entryOf([media])).blocks[0].data as any).file.url).toMatch(/format\/mp4\/#\.mp4$/);
	});

	it('инлайн-теги текста проходят без изменений', () => {
		const text = '<p>Инлайн: <b>жирный</b>, <i>курсив</i>, <a href="http://example.com">ссылка</a></p>';
		expect(roundTrip([block('text', { text })])[0].data).toEqual({ text });
	});

	it('url превью персоны не уходит на сервер', () => {
		const image = { uuid: 'u', width: 1, height: 1 };
		const out = editorJsToDtf({
			blocks: [{ type: 'person', data: { title: 't', description: 'd', image: { ...image, url: 'http://x' } } }]
		} as any);
		expect((out.entry.blocks[0].data as any).image.data).toEqual(image);
	});
});
