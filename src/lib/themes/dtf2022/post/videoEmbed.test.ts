import { describe, expect, it } from 'vitest';
import { videoEmbedSrc } from './videoEmbed';

describe('videoEmbedSrc', () => {
	it('собирает адрес для youtube и coub', () => {
		expect(videoEmbedSrc({ name: 'youtube', id: 'abc_1-Z' })).toBe('https://www.youtube-nocookie.com/embed/abc_1-Z?autoplay=1');
		expect(videoEmbedSrc({ name: 'coub', id: '45bzpr' })).toBe('https://coub.com/embed/45bzpr?autostart=true&muted=false');
	});

	it('отбрасывает чужие сервисы и мусорный id', () => {
		expect(videoEmbedSrc({ name: 'vimeo', id: '1' })).toBeNull();
		expect(videoEmbedSrc({ name: 'coub', id: '../x?y' })).toBeNull();
		expect(videoEmbedSrc(undefined)).toBeNull();
	});
});
