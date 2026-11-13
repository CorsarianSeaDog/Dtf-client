import { describe, it, expect, vi, beforeEach } from 'vitest';

const saveDraft = vi.fn(async (entry: any) => ({ ...entry, id: entry.id || 7 }));
vi.mock('$lib/api/index.svelte', () => ({ api: { saveDraft: (entry: any) => saveDraft(entry) } }));
vi.mock('$lib/navigation', () => ({ closeOverlay: vi.fn() }));

import { createEditorSession } from './session.svelte';

const content = { blocks: [{ type: 'paragraph', data: { text: 'привет' } }] };

function openSession() {
	const session = createEditorSession(null);
	session.editorInstance = { save: async () => content };
	return session;
}

describe('createEditorSession', () => {
	beforeEach(() => {
		saveDraft.mockClear();
	});

	it('закрытие экрана отправляет несохранённые правки', async () => {
		const session = openSession();
		session.queueSave();
		await Promise.resolve();
		// К закрытию редактор уже уничтожен
		session.editorInstance = null;
		session.destroy();
		await vi.waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
		expect(saveDraft.mock.calls[0][0].entry.blocks[0].data.text).toBe('<p>привет</p>');
	});

	it('без правок закрытие ничего не отправляет', async () => {
		const session = openSession();
		session.destroy();
		await Promise.resolve();
		expect(saveDraft).not.toHaveBeenCalled();
	});

	it('после сохранения закрытие повторно не отправляет', async () => {
		const session = openSession();
		session.queueSave();
		await Promise.resolve();
		await session.publish();
		await vi.waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
		session.destroy();
		await Promise.resolve();
		expect(saveDraft).toHaveBeenCalledTimes(1);
	});
});
