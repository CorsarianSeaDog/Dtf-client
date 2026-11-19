import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { Comment, Post } from '$lib/api/types';
import { appendNewBookmarks } from '$lib/components/BookmarksContent.svelte';
import { authStorage } from '$lib/storage/auth.svelte';
import BookmarksPage from './BookmarksPage.svelte';

const makePost = (id: number, createdAt: string): Post => ({
	id,
	sourceId: 'dtf',
	title: `Пост ${id}`,
	blocks: [],
	author: { id: 1, name: 'Автор' },
	commentsCount: 0,
	createdAt
});

const makeComment = (id: number, createdAt: string): Comment => ({
	id,
	sourceId: 'dtf',
	postId: 77,
	postTitle: 'Пост комментария',
	author: { id: 2, name: 'Комментатор' },
	content: `Коммент ${id}`,
	createdAt
});

describe('appendNewBookmarks', () => {
	it('сортирует первую пачку от свежих к старым и дописывает новые пачки в конец без дублей', () => {
		const pOld = makePost(1, '2026-11-01T10:00:00.000Z');
		const pNew = makePost(2, '2026-11-03T10:00:00.000Z');
		const cMid = makeComment(10, '2026-11-02T10:00:00.000Z');

		const first = appendNewBookmarks([], [pOld, pNew], [cMid]);
		expect(first.map((entry) => `${entry.kind}:${entry.item.id}`)).toEqual(['post:2', 'comment:10', 'post:1']);

		// Вторая страница: даже если дата новее pOld, она добавляется в конец, чтобы список не прыгал выше экрана
		const cPage2 = makeComment(11, '2026-11-02T12:00:00.000Z');
		const pPage2 = makePost(3, '2026-10-30T10:00:00.000Z');
		const second = appendNewBookmarks(first, [pOld, pNew, pPage2], [cMid, cPage2]);
		expect(second.map((entry) => `${entry.kind}:${entry.item.id}`)).toEqual([
			'post:2',
			'comment:10',
			'post:1',
			'comment:11',
			'post:3'
		]);
	});
});

describe('BookmarksPage', () => {
	beforeEach(() => {
		authStorage.session = { accessToken: 'tok', refreshToken: 'ref', expiresAt: 0 } as any;
	});

	afterEach(() => {
		authStorage.session = null;
	});

	const baseProps = {
		onTabChange: vi.fn(),
		items: [],
		posts: [],
		comments: [],
		loaded: true,
		loading: false,
		error: undefined,
		hasMore: false,
		loadMore: vi.fn(),
		onretry: vi.fn()
	};

	it('на вкладке «Все» рисует и посты, и комментарии, а пустую заглушку показывает только при отсутствии обоих', () => {
		const post = makePost(1, '2026-11-03T10:00:00.000Z');
		const comment = makeComment(10, '2026-11-02T10:00:00.000Z');

		const mixed = render(BookmarksPage, {
			props: {
				...baseProps,
				tab: 'all',
				items: [
					{ kind: 'post', item: post },
					{ kind: 'comment', item: comment }
				],
				posts: [post],
				comments: [comment]
			}
		});
		expect(mixed.body).toContain('Все');
		expect(mixed.body).toContain('Пост 1');
		expect(mixed.body).toContain('Коммент 10');
		expect(mixed.body.indexOf('Пост 1')).toBeLessThan(mixed.body.indexOf('Коммент 10'));

		const emptyAll = render(BookmarksPage, { props: { ...baseProps, tab: 'all' } });
		expect(emptyAll.body).toContain('В закладках ничего нет');
	});

	it('отдельные вкладки «Статьи» и «Комментарии» работают как раньше', () => {
		const postsEmpty = render(BookmarksPage, { props: { ...baseProps, tab: 'posts' } });
		expect(postsEmpty.body).toContain('Статьи');
		expect(postsEmpty.body).toContain('В закладках нет статей');

		const commentsEmpty = render(BookmarksPage, { props: { ...baseProps, tab: 'comments' } });
		expect(commentsEmpty.body).toContain('Комментарии');
		expect(commentsEmpty.body).toContain('В закладках нет комментариев');
	});
});
