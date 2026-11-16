import { describe, it, expect, vi } from 'vitest';
import { render } from 'svelte/server';
import fs from 'fs';
import path from 'path';
import EditorScreen from './EditorScreen.svelte';

function createMockSession() {
	return {
		init: vi.fn(),
		destroy: vi.fn(),
		goBack: vi.fn(),
		publish: vi.fn(),
		toggleHistory: vi.fn(),
		loadVersion: vi.fn(),
		deletePost: vi.fn(),
		updateCommentPermission: vi.fn(),
		queueSave: vi.fn(),
		subsites: [{ value: 1, label: 'Игры' }],
		historyVersions: [],
		loadingHistory: false,
		saveState: 'saved',
		canPublish: true,
		commentPermission: 'everyone',
		isAdult: false,
		title: '',
		ready: false,
		repostOf: null,
		postId: null,
		selectedSubsiteId: 1
	};
}

describe('EditorScreen', () => {
	it('рендерит полноэкранный редактор по умолчанию', () => {
		const session = createMockSession();
		const { body } = render(EditorScreen, {
			props: {
				session
			}
		});

		expect(body).toMatch(/class="[^"]*\bwriting\b/);
		expect(body).not.toContain('writing--window');
		expect(body).toContain('writing__bar');
		expect(body).toContain('writing__close');
		expect(body).toContain('writing__publish');
	});

	it('рендерит класс writing--window в оконном режиме', () => {
		const session = createMockSession();
		const { body } = render(EditorScreen, {
			props: {
				session,
				windowed: true
			}
		});

		expect(body).toContain('writing--window');
	});

	it('показывает кнопку удаления только когда у записи есть postId', () => {
		const withoutId = render(EditorScreen, { props: { session: createMockSession() } });
		expect(withoutId.body).not.toContain('Удалить запись');

		const withId = render(EditorScreen, { props: { session: { ...createMockSession(), postId: 5388155 } } });
		expect(withId.body).toContain('Удалить запись');
		expect(withId.body).toContain('#v_delete');
	});

	it('содержит стили safe area insets для полноэкранного режима', () => {
		const filePath = path.join(__dirname, 'EditorScreen.svelte');
		const content = fs.readFileSync(filePath, 'utf-8');

		expect(content).toContain('env(safe-area-inset-top, 0px)');
		expect(content).toContain('env(safe-area-inset-bottom, 0px)');
		expect(content).toContain('env(safe-area-inset-left, 0px)');
		expect(content).toContain('env(safe-area-inset-right, 0px)');
		expect(content).toContain('.writing--window .writing__bar');
	});
});
