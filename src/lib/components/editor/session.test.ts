import { describe, it, expect, vi, beforeEach } from 'vitest';

const saveDraft = vi.fn(async (entry: any) => ({ ...entry, id: entry.id || 7 }));
const deletePost = vi.fn(async (_id: number) => {});
const getPostHistoryVersion = vi.fn(async (_id: number, _versionId: number) => ({
	title: 'Старая версия',
	is_adult: true,
	entry: { blocks: [] }
}));
vi.mock('$lib/api/index.svelte', () => ({
	api: {
		saveDraft: (entry: any) => saveDraft(entry),
		deletePost: (id: number) => deletePost(id),
		getPostHistoryVersion: (id: number, versionId: number) => getPostHistoryVersion(id, versionId)
	}
}));
vi.mock('$lib/navigation', () => ({ closeOverlay: vi.fn() }));

import { createEditorSession } from './session.svelte';

const content = { blocks: [{ type: 'paragraph', data: { text: 'привет' } }] };

function openSession(postId: number | null = null) {
	const session = createEditorSession(postId);
	session.editorInstance = { save: async () => content, render: vi.fn(async () => {}) };
	return session;
}

describe('createEditorSession', () => {
	beforeEach(() => {
		saveDraft.mockClear();
		deletePost.mockClear();
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

	it('после deletePost закрытие не сохраняет черновик заново', async () => {
		const session = openSession(42);
		session.queueSave();
		await Promise.resolve();
		await session.deletePost();
		expect(deletePost).toHaveBeenCalledWith(42);

		session.editorInstance = null;
		session.destroy();
		await Promise.resolve();
		expect(saveDraft).not.toHaveBeenCalled();
	});

	it('состояние сохранения: правка → dirty → saving → saved', async () => {
		const session = openSession();
		expect(session.saveState).toBe('idle');

		session.queueSave();
		expect(session.saveState).toBe('dirty');

		let finish = () => {};
		saveDraft.mockImplementationOnce((entry: any) => new Promise((resolve) => (finish = () => resolve({ ...entry, id: 7 }))));
		const flushed = session.flush();
		await vi.waitFor(() => expect(session.saveState).toBe('saving'));

		finish();
		await flushed;
		expect(session.saveState).toBe('saved');
		expect(session.savedAt).toBeTypeOf('number');
		expect(session.postId).toBe(7);
	});

	it('правка во время сохранения оставляет dirty', async () => {
		const session = openSession();
		session.queueSave();

		let finish = () => {};
		saveDraft.mockImplementationOnce((entry: any) => new Promise((resolve) => (finish = () => resolve({ ...entry, id: 7 }))));
		const flushed = session.flush();
		await vi.waitFor(() => expect(session.saveState).toBe('saving'));

		session.queueSave();
		expect(session.saveState).toBe('saving');
		finish();
		await flushed;
		expect(session.saveState).toBe('dirty');
	});

	it('ошибка сети даёт error, повторное сохранение — saved', async () => {
		const session = openSession();
		session.queueSave();
		saveDraft.mockRejectedValueOnce(new Error('Нет сети'));
		await session.flush();
		expect(session.saveState).toBe('error');
		expect(session.error).toBe('Нет сети');

		await session.flush();
		expect(session.saveState).toBe('saved');
		expect(session.error).toBe('');
	});

	it('публикация с ошибкой бросает её и ставит error', async () => {
		const session = openSession();
		saveDraft.mockRejectedValueOnce(new Error('Сервер недоступен'));
		await expect(session.publish()).rejects.toThrow('Сервер недоступен');
		expect(session.saveState).toBe('error');
	});

	it('flush отправляет правки сразу и ничего не шлёт без правок', async () => {
		const session = openSession();
		await session.flush();
		expect(saveDraft).not.toHaveBeenCalled();

		session.queueSave();
		await session.flush();
		expect(saveDraft).toHaveBeenCalledTimes(1);

		await session.flush();
		expect(saveDraft).toHaveBeenCalledTimes(1);
	});

	it('canPublish: пустая запись нет, с заголовком или блоками да, репост да', async () => {
		const empty = createEditorSession();
		empty.editorInstance = { save: async () => ({ blocks: [] }) };
		expect(empty.canPublish).toBe(false);

		empty.title = 'Заголовок';
		expect(empty.canPublish).toBe(true);

		const withBlocks = openSession();
		expect(withBlocks.canPublish).toBe(false);
		withBlocks.queueSave();
		await vi.waitFor(() => expect(withBlocks.canPublish).toBe(true));

		expect(createEditorSession(null, 5).canPublish).toBe(true);
	});

	it('canPublish ложно, пока идёт сохранение', async () => {
		const session = openSession();
		session.title = 'Заголовок';
		session.queueSave();

		let finish = () => {};
		saveDraft.mockImplementationOnce((entry: any) => new Promise((resolve) => (finish = () => resolve({ ...entry, id: 7 }))));
		const flushed = session.flush();
		await vi.waitFor(() => expect(session.canPublish).toBe(false));
		finish();
		await flushed;
		expect(session.canPublish).toBe(true);
	});

	it('loadVersion запоминает прежнее содержимое, undoLoadVersion его возвращает', async () => {
		const session = openSession(42);
		session.title = 'Мой заголовок';
		session.isAdult = false;
		const render = session.editorInstance.render;

		await session.loadVersion(3);
		expect(render).toHaveBeenLastCalledWith({ blocks: [], time: expect.any(Number), version: expect.any(String) });
		expect(session.title).toBe('Старая версия');
		expect(session.isAdult).toBe(true);
		expect(session.canUndoLoad).toBe(true);

		await session.undoLoadVersion();
		expect(render).toHaveBeenLastCalledWith(content);
		expect(session.title).toBe('Мой заголовок');
		expect(session.isAdult).toBe(false);
		expect(session.canUndoLoad).toBe(false);
	});

	it('после правки отмена версии недоступна', async () => {
		const session = openSession(42);
		await session.loadVersion(3);
		session.queueSave();
		expect(session.canUndoLoad).toBe(false);

		const render = session.editorInstance.render;
		render.mockClear();
		await session.undoLoadVersion();
		expect(render).not.toHaveBeenCalled();
	});
});
