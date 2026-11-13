import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'svelte/server';

vi.mock('$app/env', () => ({
	dev: false,
	browser: true,
	version: '1.0.0'
}));

import SettingsScreen from './SettingsScreen.svelte';
import { settings } from '$lib/storage/settings.svelte';

describe('SettingsScreen: режим разработчика в продакшене', () => {
	beforeEach(() => {
		settings.patch({ devMode: false });
	});

	it('без devMode прячет раздел и не открывает «Дебаг» по прямой ссылке', () => {
		const { body } = render(SettingsScreen, { props: { onclose: () => {}, page: 'debug' } });

		expect(body).not.toContain('Разработка');
		expect(body).not.toContain('Диагностический отчёт');
	});

	it('с devMode показывает раздел и открывает «Дебаг»', () => {
		settings.patch({ devMode: true });
		const { body } = render(SettingsScreen, { props: { onclose: () => {}, page: 'debug' } });

		expect(body).toContain('Разработка');
		expect(body).toContain('Диагностический отчёт');
	});

	it('скрывает тему из обычного выбора, но оставляет её активной и доступной в дебаге', () => {
		const previousTheme = settings.value.theme;
		try {
			settings.patch({ devMode: true, theme: 'dtf2022' });
			const choice = render(SettingsScreen, { props: { onclose: () => {}, page: 'theme-select' } }).body;
			const debug = render(SettingsScreen, { props: { onclose: () => {}, page: 'debug' } }).body;

			expect(choice).not.toContain('value="dtf2022"');
			expect(debug).toMatch(/value="dtf2022"[^>]*checked/);
			expect(debug).toContain('Скрыта из выбора темы');
			expect(settings.value.theme).toBe('dtf2022');
		} finally {
			settings.patch({ theme: previousTheme });
		}
	});
});
