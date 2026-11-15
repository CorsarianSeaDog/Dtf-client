import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { Comment } from '$lib/api/types';

vi.mock('$lib/sanitize', () => ({ sanitizeHtml: (html: string) => html }));

import SearchPage from './SearchPage.svelte';

const baseProps = {
	query: 'elden',
	tab: 'comments' as const,
	onTabChange: vi.fn(),
	sorting: 'relevance' as const,
	onSortingChange: vi.fn(),
	filters: { title: false, editorial: false, strict: false },
	onFiltersChange: vi.fn(),
	posts: [],
	comments: [] as Comment[],
	subsites: [],
	loaded: true,
	loading: false,
	error: undefined,
	hasMore: false,
	loadMore: vi.fn(),
	onretry: vi.fn()
};

const makeComment = (overrides: Partial<Comment> = {}): Comment => ({
	id: 101,
	sourceId: 'dtf',
	postId: 555,
	postTitle: 'Обзор игры',
	author: { id: 77, name: 'Автор коммента' },
	content: 'Обычный текст комментария',
	searchSnippet: 'Фрагмент <mark>elden</mark> ring',
	createdAt: '2026-11-14T10:00:00.000Z',
	...overrides
});

const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

describe('SearchPage (comments tab)', () => {
	it('рисует вкладку «Комментарии», только фильтр «Точное совпадение» и карточку комментария', () => {
		const { body } = render(SearchPage, {
			props: {
				...baseProps,
				totals: { comments: 42 },
				comments: [
					makeComment({
						media: [{ type: 'image', data: { uuid: 'img-1', width: 100, height: 100, size: 1000, type: 'jpg' } }]
					})
				]
			}
		});
		const html = stripComments(body);

		expect(html).toContain('Комментарии');
		expect(html).toContain('42');
		expect(html).toContain('По релевантности');
		expect(html).toContain('Точное совпадение');
		expect(html).not.toContain('Только в заголовках');
		expect(html).not.toContain('Новости редакции');
		expect(html).toContain('Обзор игры');
		expect(html).toContain('Автор коммента');
		expect(html).toMatch(/Фрагмент <mark[^>]*>elden<\/mark> ring/);
		expect(html).toContain('/post/555?comment=101');
		expect(html).toContain('Ответить');
		expect(html).toContain('https://leonardo.osnova.io/img-1/-/preview/800/-/format/webp/');
	});

	it('показывает content при отсутствии searchSnippet и заглушку при пустой выдаче', () => {
		const withText = render(SearchPage, {
			props: {
				...baseProps,
				comments: [makeComment({ searchSnippet: undefined, content: 'Запасной текст' })]
			}
		});
		expect(withText.body).toContain('Запасной текст');

		const empty = render(SearchPage, { props: baseProps });
		expect(empty.body).toContain('Ничего не найдено');
	});
});
