import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import PostBlocks from './PostBlocks.svelte';
import { spotifyEmbedSrc, spotifyHeight } from './spotify';

it('трек и эпизод — компактный плеер, остальное — высокий', () => {
	expect(spotifyHeight('https://open.spotify.com/embed/track/abc')).toBe(152);
	expect(spotifyHeight('https://open.spotify.com/embed/episode/abc')).toBe(152);
	expect(spotifyHeight('https://open.spotify.com/embed/playlist/abc')).toBe(352);
});

describe('spotifyEmbedSrc', () => {
	it('вставляет /embed и отбрасывает query и префикс локали', () => {
		const id = '25KN5IFew2JifHoqx5Q7Z7';
		const embed = `https://open.spotify.com/embed/track/${id}`;
		expect(spotifyEmbedSrc({ url: `https://open.spotify.com/track/${id}?si=abc&utm_source=copy-link` })).toBe(embed);
		expect(spotifyEmbedSrc({ url: `https://open.spotify.com/intl-ru/track/${id}` })).toBe(embed);
		expect(spotifyEmbedSrc({ src: `${embed}?utm_source=generator`, url: 'мусор' })).toBe(embed);
	});

	it('чужой хост и неизвестный тип — null', () => {
		expect(spotifyEmbedSrc({ src: 'https://evil.example/embed/track/abc' })).toBeNull();
		expect(spotifyEmbedSrc({ src: 'http://open.spotify.com/embed/track/abc' })).toBeNull();
		expect(spotifyEmbedSrc({ src: 'https://open.spotify.com/user/abc' })).toBeNull();
		expect(spotifyEmbedSrc(undefined)).toBeNull();
	});
});

it('рисует блок spotify iframe-плеером, а с чужим адресом ничего', () => {
	const box = (src: string) => ({ type: 'spotify', data: { spotify: { data: { box_data: { src } } } } });
	const ok = render(PostBlocks, { props: { variant: 'page', blocks: [box('https://open.spotify.com/embed/playlist/7Ku4Aze53dlh9nbYIvQw8o')] } });
	expect(ok.body).toContain('<iframe');
	expect(ok.body).toContain('src="https://open.spotify.com/embed/playlist/7Ku4Aze53dlh9nbYIvQw8o"');

	const bad = render(PostBlocks, { props: { variant: 'card', blocks: [box('https://evil.example/embed/track/abc')] } });
	expect(bad.body).not.toContain('<iframe');
});
