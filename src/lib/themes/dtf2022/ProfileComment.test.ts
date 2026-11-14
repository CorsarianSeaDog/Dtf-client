import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ProfileComment badge modal integration', () => {
	it('содержит кликабельные кнопки бейджей и модальное окно BadgeInfoModal', () => {
		const svelteContent = fs.readFileSync(path.join(__dirname, 'ProfileComment.svelte'), 'utf8');

		expect(svelteContent).toContain('BadgeInfoModal');
		expect(svelteContent).toContain('showBadgeModal');
		expect(svelteContent).toContain('class="profile-comment__badge profile-comment__badge--{clientBadge.type}"');
		expect(svelteContent).toContain('class="profile-comment__time-badge"');
		expect(svelteContent).toContain('cursor: pointer');
	});

	it('обрабатывает ссылки DTF внутри приложения через openDtfLink', () => {
		const svelteContent = fs.readFileSync(path.join(__dirname, 'ProfileComment.svelte'), 'utf8');

		expect(svelteContent).toContain('openDtfLink');
		expect(svelteContent).toContain('dtfTargetToPath');
		expect(svelteContent).toContain('parseDtfUrl(part.url)');
	});

	it('содержит пункт меню "Открыть на DTF" со ссылкой на комментарий DTF', () => {
		const svelteContent = fs.readFileSync(path.join(__dirname, 'ProfileComment.svelte'), 'utf8');

		expect(svelteContent).toContain("label: 'Открыть на DTF'");
		expect(svelteContent).toContain("icon: 'v_external'");
		expect(svelteContent).toContain('https://dtf.ru/${comment.postId}?comment=${comment.id}');
	});

	it('не рисует оценки, ведёт «Ответить» и дату на комментарий, задаёт закладку 16x16 с ховером и расширенные хитбоксы', () => {
		const commentContent = fs.readFileSync(path.join(__dirname, 'ProfileComment.svelte'), 'utf8');
		const profileContent = fs.readFileSync(path.join(__dirname, 'Profile.svelte'), 'utf8');

		expect(commentContent).not.toContain('profile-comment__vote');
		expect(commentContent).toContain('getPostPath(post, comment.id)');
		expect(commentContent).toContain('openPost(e, post, { commentId: comment.id })');
		expect(commentContent).toContain('width="16" height="16"');
		expect(commentContent).toContain('.profile-comment__bookmark::before');
		expect(commentContent).toContain('var(--color-comments-hover)');
		expect(commentContent).toContain('.profile-comment__etc::after');
		expect(commentContent).toContain('width: 44px');

		expect(profileContent).toContain('commentsSorting');
		expect(profileContent).toContain('onCommentsSortingChange');
		expect(profileContent).toContain('api.getProfileComments(profile.id, sortingForRequest, commentsCursor)');
	});
});
