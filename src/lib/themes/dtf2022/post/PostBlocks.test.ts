import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { render } from 'svelte/server';
import PostBlocks from './PostBlocks.svelte';
import { activeTheme } from '../../index.svelte';
import { getThemeSettings } from '../../settings.svelte';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

it('собирает один медиаблок в галерею с пятью плитками и сохраняет отдельное фото', () => {
	const items = Array.from({ length: 7 }, (_, i) => ({ image: { data: { uuid: `photo-${i}` } } }));
	const { body } = render(PostBlocks, { props: {
		variant: 'page',
		blocks: [
			{ type: 'media', anchor: 'gallery', data: { items: [null, ...items] } },
			{ type: 'media', data: { items: [{ image: { data: { uuid: 'standalone' } } }] } }
		]
	} });

	expect(body).toMatch(/<figure[^>]*id="gallery"[^>]*>/);
	expect(body.match(/class="media-gallery__tile\s/g)).toHaveLength(5);
	expect(body).toContain('+2');
	expect(body).not.toContain('photo-5');
	expect(body).toContain('standalone');
});

describe('PostBlocks DTF link handling', () => {
	it('содержит обработчик кликов по ссылкам DTF и разметку блоков ссылок', () => {
		const svelteContent = fs.readFileSync(path.join(__dirname, 'PostBlocks.svelte'), 'utf8');

		expect(svelteContent).toContain('openDtfLink');
		expect(svelteContent).toContain('handleContainerClick');
		expect(svelteContent).toContain('onclick={handleContainerClick}');
		expect(svelteContent).toContain('onauxclick={handleContainerClick}');
		expect(svelteContent).toContain('dtfTargetToPath');
		expect(svelteContent).toContain('parseDtfUrl(link.url)');
	});

	it('не отображает блок заголовка для пустых заголовков', () => {
		const svelteContent = fs.readFileSync(path.join(__dirname, 'PostBlocks.svelte'), 'utf8');

		expect(svelteContent).toContain('{#if title?.trim()}');
		expect(svelteContent).toContain('post-block post-block--title');
	});

	it('поддерживает якоря блоков и отступ прокрутки под шапку', () => {
		const svelteContent = fs.readFileSync(path.join(__dirname, 'PostBlocks.svelte'), 'utf8');

		expect(svelteContent).toContain('anchorId');
		expect(svelteContent).toContain('scroll-margin-top: calc(var(--header-height, 60px) + 8px)');
	});

	it('ограничивает подписи полноширинных медиа на странице поста шириной контента', () => {
		const svelteContent = fs.readFileSync(path.join(__dirname, 'PostBlocks.svelte'), 'utf8');

		expect(svelteContent).toContain('.post-blocks--page > .media-figure:not(.media-figure--column) > .media-caption');
		expect(svelteContent).toContain('max-width: min(var(--inner-content-width), calc(100% - 2 * var(--text-gap, 0px)))');
		expect(svelteContent).toContain('margin-inline: auto');
		expect(svelteContent).toContain('padding-inline: 16px');
	});

	it('не применяет стили ссылок блоков к встроенному посту (osnovaEmbed)', () => {
		const svelteContent = fs.readFileSync(path.join(__dirname, 'PostBlocks.svelte'), 'utf8');

		expect(svelteContent).toContain('.post-block:not(.post-block--embed) :global(a)');
		expect(svelteContent).not.toMatch(/^\s*\.post-block\s+:global\(a\)/m);
	});

	it('не перебивает отступ списка в карточке базовым правилом отступов блока', () => {
		const svelteContent = fs.readFileSync(path.join(__dirname, 'PostBlocks.svelte'), 'utf8');

		expect(svelteContent).toContain('.post-blocks--card > .post-block:where(:not(.post-block--media, .post-block--audio, .post-block--quiz))');
		expect(svelteContent).toContain('.post-blocks--embed > .post-block:where(:not(.post-block--audio, .post-block--quiz))');
		expect(svelteContent).toContain('padding-left: calc(var(--island-offset-x, 16px) + 1.5em)');
	});

	it('задаёт списку и его пунктам вертикальные отступы как в оригинале DTF', () => {
		const svelteContent = fs.readFileSync(path.join(__dirname, 'PostBlocks.svelte'), 'utf8');

		expect(svelteContent).toMatch(/\.post-block--list\s*\{[^}]*margin:\s*12px 0;/);
		expect(svelteContent).toMatch(/\.post-block--list li\s*\{[^}]*margin:\s*10px 0;/);
		expect(svelteContent).toContain('.post-blocks--card > .post-block:not(.post-block--title, :last-child)');
	});

	it('нигде в src нет img с srcset и sizes: Blink удерживает по ним оторванный слой поста', () => {
		const src = path.resolve(__dirname, '../../../..');
		const offenders = (fs.readdirSync(src, { recursive: true }) as string[])
			.filter((file) => file.endsWith('.svelte'))
			.filter((file) => /(srcset|sizes)=/.test(fs.readFileSync(path.join(src, file), 'utf8')));

		expect(offenders).toEqual([]);
	});
});

describe('PostBlocks: настройка postMediaWidth в redtf', () => {
	afterEach(() => {
		activeTheme.set('redtf');
		getThemeSettings('redtf').patch({ postMediaWidth: 'full' });
	});

	const sampleBlocks = [
		{ type: 'media', data: { items: [{ image: { data: { uuid: 'wide', width: 1200, height: 675 } } }] } },
		{ type: 'media', data: { items: [{ image: { data: { uuid: 'tall', width: 600, height: 1000 } } }] } },
		{ type: 'media', data: { items: [{ image: { data: { uuid: 'g1' } } }, { image: { data: { uuid: 'g2' } } }] } }
	];

	it('по умолчанию (full) горизонтальное медиа и галерея выходят на всю ширину, без скругления', () => {
		activeTheme.set('redtf');
		const { body } = render(PostBlocks, { props: { variant: 'page', blocks: sampleBlocks } });

		const figures = [...body.matchAll(/<figure class="([^"]+)"/g)].map((m) => m[1]);
		expect(figures).toHaveLength(3);
		expect(figures[0]).not.toContain('media-figure--column');
		expect(figures[1]).toContain('media-figure--column');
		expect(figures[2]).not.toContain('media-figure--column');
		expect(body).not.toContain('media-figure--rounded');
	});

	it('при postMediaWidth: content на странице поста все медиа выравниваются по контенту и скругляются на 8px', () => {
		activeTheme.set('redtf');
		getThemeSettings('redtf').patch({ postMediaWidth: 'content' });
		const { body } = render(PostBlocks, { props: { variant: 'page', blocks: sampleBlocks } });

		const figures = [...body.matchAll(/<figure class="([^"]+)"/g)].map((m) => m[1]);
		expect(figures).toHaveLength(3);
		for (const cls of figures) {
			expect(cls).toContain('media-figure--column');
			expect(cls).toContain('media-figure--rounded');
		}
		// Горизонтальное медиа не сжимается по 460px
		expect(body).toContain('--media-max-w: 1200px');
		// Вертикальное сохраняет ограничение по высоте 460px
		expect(body).toContain('--media-max-w: 276px');

		const svelteContent = fs.readFileSync(path.join(__dirname, 'PostBlocks.svelte'), 'utf8');
		expect(svelteContent).toContain('.media-figure--rounded > .media-frame');
		expect(svelteContent).toContain('.media-figure--rounded > .media-gallery');
		expect(svelteContent).toContain('border-radius: 8px;');
	});

	it('в теме dtf2022 отображение всегда остаётся полноширинным без скруглений', () => {
		activeTheme.set('dtf2022');
		const { body } = render(PostBlocks, { props: { variant: 'page', blocks: sampleBlocks } });

		const figures = [...body.matchAll(/<figure class="([^"]+)"/g)].map((m) => m[1]);
		expect(figures).toHaveLength(3);
		expect(figures[0]).not.toContain('media-figure--column');
		expect(figures[1]).toContain('media-figure--column');
		expect(figures[2]).not.toContain('media-figure--column');
		expect(body).not.toContain('media-figure--rounded');
	});

	it('в ленте (card) и встроенном посте (embed) классы скругления страницы не применяются', () => {
		activeTheme.set('redtf');
		getThemeSettings('redtf').patch({ postMediaWidth: 'content' });

		const cardBody = render(PostBlocks, { props: { variant: 'card', blocks: [sampleBlocks[0]] } }).body;
		const embedBody = render(PostBlocks, { props: { variant: 'embed', blocks: [sampleBlocks[0]] } }).body;

		expect(cardBody).not.toContain('media-figure--rounded');
		expect(embedBody).not.toContain('media-figure--rounded');
	});
});
