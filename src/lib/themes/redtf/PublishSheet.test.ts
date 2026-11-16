import { describe, it, expect, vi } from 'vitest';
import { render } from 'svelte/server';
import PublishSheet from './PublishSheet.svelte';

const session = (canPublish: boolean) => ({
	canPublish,
	saveState: 'saved',
	subsites: [{ value: 1, label: 'Игры' }],
	selectedSubsiteId: 1,
	commentPermission: 'everyone',
	isAdult: false
});

describe('PublishSheet', () => {
	it('рисует настройки записи и кнопки, главная кнопка отключена без canPublish', () => {
		const props = { onpublish: vi.fn(), onclose: vi.fn() };
		const ready = render(PublishSheet, { props: { session: session(true), ...props } }).body;
		expect(ready).toContain('Публикация');
		expect(ready).toContain('Комментарии: всем');
		expect(ready).toContain('Отмена');
		expect(ready).not.toContain('btn--disabled');

		const blocked = render(PublishSheet, { props: { session: session(false), ...props } }).body;
		expect(blocked).toContain('btn--disabled');
	});
});
