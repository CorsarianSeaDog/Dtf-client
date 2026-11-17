import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import ReloadPrompt from './ReloadPrompt.svelte';
import { pwa } from '$lib/pwa.svelte';

describe('ReloadPrompt', () => {
	beforeEach(() => {
		pwa.needRefresh = false;
		pwa.newVersion = null;
	});

	it('не отображает плашку обновления, если нет обновлений', () => {
		const { body } = render(ReloadPrompt);
		expect(body).not.toContain('data-pwa-prompt');
	});

	it('отображает плашку и ссылки на Telegram и Compare on GitHub при наличии обновления', () => {
		pwa.needRefresh = true;
		pwa.newVersion = '1.0.0';

		const { body } = render(ReloadPrompt);

		expect(body).toContain('data-pwa-prompt');
		expect(body).toContain('https://t.me/re_dtf');
		expect(body).toContain('Читайте список изменений в Telegram');
		expect(body).toContain('Compare on GitHub');
		expect(body).toContain('https://github.com/re-dtf/client/compare/');
	});
});
