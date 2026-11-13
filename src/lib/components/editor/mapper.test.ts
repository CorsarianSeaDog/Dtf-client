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

	it('url превью персоны не уходит на сервер', () => {
		const image = { uuid: 'u', width: 1, height: 1 };
		const out = editorJsToDtf({
			blocks: [{ type: 'person', data: { title: 't', description: 'd', image: { ...image, url: 'http://x' } } }]
		} as any);
		expect((out.entry.blocks[0].data as any).image.data).toEqual(image);
	});
});
