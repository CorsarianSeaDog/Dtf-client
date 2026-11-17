import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { editorJsToDtf } from '$lib/components/editor/mapper';
import PostPreview from './PostPreview.svelte';

// DOMPurify в vitest без DOM не работает; чистка HTML здесь не предмет проверки
vi.mock('$lib/sanitize', () => ({ sanitizeHtml: (html: string) => html }));

const file = (uuid: string) => ({ uuid, url: `blob:${uuid}`, width: 800, height: 600, type: 'jpg', kind: 'image', size: 1, color: 'aabbcc' });

// Предпросмотр рисует то, что editorJsToDtf отдаёт серверу: каждый тип блока редактора доходит до своего блока поста
it('рисует блоки редактора так же, как страницу поста', () => {
	const { entry } = editorJsToDtf({
		blocks: [
			{ type: 'paragraph', data: { text: 'Абзац' } },
			{ type: 'header', data: { text: 'Заголовок', level: 3 } },
			{ type: 'list', data: { style: 'ordered', items: [{ content: 'Раз', items: [] }, { content: 'Два', items: [] }] } },
			{ type: 'quote', data: { text: 'Цитата', caption: 'Автор' } },
			{ type: 'code', data: { code: 'let a = 1;' } },
			{ type: 'image', data: { file: file('single'), caption: 'Подпись' } },
			{ type: 'gallery', data: { items: [{ file: file('g1'), caption: '' }, { file: file('g2'), caption: '' }] } },
			{ type: 'quiz', data: { title: 'Опрос', items: { a: 'Да', b: 'Нет' } } },
			{ type: 'person', data: { title: 'Имя', description: 'Описание' } },
			{ type: 'paragraph', data: { text: 'Скрыто' }, tunes: { spoiler: { hidden: true } } }
		]
	} as any);

	const { body } = render(PostPreview, { props: { title: 'Мой пост', blocks: entry.blocks } });

	for (const cls of ['--title', '--text', '--header', '--list', '--quote', '--code', '--quiz', '--person']) {
		expect(body).toContain(`post-block${cls}`);
	}
	expect(body).toContain('Мой пост');
	expect(body).toContain('<ol');
	expect(body).toContain('media-figure');
	expect(body).toContain('media-gallery__tile');
	expect(body).toContain('quiz__item');
	expect(body).toContain('Содержание скрыто');
});

it('у пустой записи говорит, что показывать нечего', () => {
	const { body } = render(PostPreview, { props: { title: '', blocks: [] } });
	expect(body).toContain('Пока нечего показывать');
});
