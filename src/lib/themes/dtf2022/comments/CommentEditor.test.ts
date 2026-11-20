import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import CommentEditor from './CommentEditor.svelte';

describe('CommentEditor', () => {
	it('рендерит поле ввода комментария', () => {
		const { body } = render(CommentEditor, {
			props: {
				text: ''
			}
		});

		expect(body).toContain('comment-editor-box__input');
		expect(body).toContain('contenteditable="plaintext-only"');
		expect(body).toContain('role="textbox"');
		expect(body).toContain('Написать комментарий...');
	});

	it('рендерит плейсхолдер ответа в режиме replying', () => {
		const { body } = render(CommentEditor, {
			props: {
				replying: true
			}
		});

		expect(body).toContain('Написать ответ...');
		expect(body).toContain('Отмена');
	});

	it('добавляет класс продолжения ветки при continueBranch', () => {
		const withoutContinue = render(CommentEditor, {
			props: {
				replying: true,
				continueBranch: false
			}
		});
		expect(withoutContinue.body).not.toContain('comment-editor-container__line--continue');

		const withContinue = render(CommentEditor, {
			props: {
				replying: true,
				continueBranch: true
			}
		});
		expect(withContinue.body).toContain('comment-editor-container__line--continue');
	});

	it('рендерит кнопку отправки с иконкой самолётика и подписью', () => {
		const { body } = render(CommentEditor, {
			props: {
				replying: true
			}
		});

		expect(body).toContain('#v_send');
		expect(body).toContain('aria-label="Ответить"');
	});

	it('сохраняет плейсхолдер при прикреплённом медиа без текста и разблокирует отправку', () => {
		const withMediaOnly = render(CommentEditor, {
			props: {
				text: '',
				media: [{ type: 'image', data: { uuid: 'img-1', width: 100, height: 100, size: 1024, type: 'jpg' } }]
			}
		});

		expect(withMediaOnly.body).toContain('comment-editor-box--empty');
		expect(withMediaOnly.body).not.toContain('btn--disabled');

		const withText = render(CommentEditor, {
			props: {
				text: 'Текст',
				media: [{ type: 'image', data: { uuid: 'img-1', width: 100, height: 100, size: 1024, type: 'jpg' } }]
			}
		});

		expect(withText.body).not.toContain('comment-editor-box--empty');
	});

	it('рендерит прикреплённую GIF как video в формате mp4, а картинку как img', () => {
		const { body } = render(CommentEditor, {
			props: {
				text: '',
				media: [
					{ type: 'image', data: { uuid: 'gif-1', width: 200, height: 150, size: 2048, type: 'gif' } },
					{ type: 'image', data: { uuid: 'img-2', width: 200, height: 150, size: 1024, type: 'jpg' } }
				]
			}
		});

		expect(body).toContain('<video src="https://leonardo.osnova.io/gif-1/-/format/mp4/"');
		expect(body).toContain('<img src="https://leonardo.osnova.io/img-2/-/preview/160/-/format/webp/"');
	});
});
