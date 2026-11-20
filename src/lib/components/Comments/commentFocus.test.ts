import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCommentFocusController, type CommentFocusLogic } from './commentFocus.svelte';

function stubWindowEvents() {
	const listeners = new Map<string, Set<EventListener>>();
	vi.stubGlobal('window', {
		addEventListener: (type: string, fn: EventListener) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		},
		removeEventListener: (type: string, fn: EventListener) => {
			listeners.get(type)?.delete(fn);
		}
	});
	return {
		emit: (type: string, event: Record<string, unknown> = {}) => {
			for (const fn of [...(listeners.get(type) ?? [])]) fn(event as unknown as Event);
		},
		count: (type: string) => listeners.get(type)?.size ?? 0
	};
}

function createHarness(initial: {
	keys?: Record<number, string>;
	visibleRows?: Set<string>;
	loading?: boolean;
	resyncing?: boolean;
	hasMore?: boolean;
	error?: string | null;
	networkSeq?: number;
	retryDelaysMs?: readonly number[];
} = {}) {
	const state = {
		keys: new Map<number, string>(Object.entries(initial.keys ?? {}).map(([id, key]) => [Number(id), key])),
		visibleRows: initial.visibleRows,
		loading: initial.loading ?? false,
		resyncing: initial.resyncing ?? false,
		hasMore: initial.hasMore ?? false,
		error: initial.error ?? null,
		networkSeq: initial.networkSeq ?? 0
	};

	const loadComments = vi.fn(async () => {});
	const resyncFromServer = vi.fn(async () => {});
	const reveal = vi.fn();
	const onFocused = vi.fn();
	const onReady = vi.fn();

	const logic: CommentFocusLogic = {
		get loading() { return state.loading; },
		get resyncing() { return state.resyncing; },
		get hasMore() { return state.hasMore; },
		get error() { return state.error; },
		get networkSeq() { return state.networkSeq; },
		resolveCommentKey: (id) => state.keys.get(id),
		loadComments,
		resyncFromServer
	};

	const controller = createCommentFocusController({
		logic,
		reveal,
		hasRow: (key) => (state.visibleRows ? state.visibleRows.has(key) : true),
		retryDelaysMs: initial.retryDelaysMs,
		onFocused,
		onReady
	});

	/** Доводит контроллер через свежую загрузку до состояния waiting */
	function enterWaiting(id: number, nonce = 1) {
		controller.step(id, nonce);
		state.loading = false;
		state.networkSeq++;
		expect(controller.step(id, nonce)).toBe('waiting');
	}

	return { state, controller, loadComments, resyncFromServer, reveal, onFocused, onReady, enterWaiting };
}

describe('createCommentFocusController', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('мгновенно переходит к найденному комментарию без сетевых запросов', () => {
		const h = createHarness({ keys: { 2: 'dtf_2' } });

		expect(h.controller.step(2, 10)).toBe('found');
		expect(h.controller.status).toBe('found');
		expect(h.reveal).toHaveBeenCalledWith('dtf_2');
		expect(h.onFocused).toHaveBeenCalledTimes(1);
		expect(h.resyncFromServer).not.toHaveBeenCalled();
		expect(h.loadComments).not.toHaveBeenCalled();
	});

	it('после промаха в кэше делает один неразрушающий resyncFromServer вместо сброса списка', () => {
		const h = createHarness({ networkSeq: 0 });

		expect(h.controller.step(99, 1)).toBe('loading');
		expect(h.resyncFromServer).toHaveBeenCalledTimes(1);
		expect(h.loadComments).not.toHaveBeenCalled();

		h.state.resyncing = true;
		expect(h.controller.checking).toBe(true);
		expect(h.controller.step(99, 1)).toBe('loading');
		expect(h.resyncFromServer).toHaveBeenCalledTimes(1);

		h.state.resyncing = false;
		h.state.networkSeq = 1;
		h.state.keys.set(99, 'dtf_99');
		expect(h.controller.step(99, 1)).toBe('found');
		expect(h.reveal).toHaveBeenCalledWith('dtf_99');
		expect(h.onFocused).toHaveBeenCalledTimes(1);
	});

	it('после свежего сетевого ответа переходит в waiting с отложенными повторами и без мгновенного дубля запроса', async () => {
		vi.useFakeTimers();
		const h = createHarness({ loading: true, retryDelaysMs: [3_000, 5_000] });

		expect(h.controller.checking).toBe(true);
		h.enterWaiting(99);
		expect(h.resyncFromServer).not.toHaveBeenCalled();
		expect(h.onFocused).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(2_999);
		expect(h.resyncFromServer).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(h.resyncFromServer).toHaveBeenCalledTimes(1);

		h.state.resyncing = true;
		expect(h.controller.step(99, 1)).toBe('waiting');
		h.state.resyncing = false;
		h.state.networkSeq++;
		expect(h.controller.step(99, 1)).toBe('waiting');

		await vi.advanceTimersByTimeAsync(5_000);
		expect(h.resyncFromServer).toHaveBeenCalledTimes(2);
		h.state.networkSeq++;
		expect(h.controller.step(99, 1)).toBe('not-found');

		await vi.advanceTimersByTimeAsync(60_000);
		expect(h.resyncFromServer).toHaveBeenCalledTimes(2);
	});

	it('автоматически переходит к комментарию из ожидания (и вызывает onFocused), если пользователь не скроллил', () => {
		vi.useFakeTimers();
		const win = stubWindowEvents();
		const h = createHarness({ networkSeq: 1, retryDelaysMs: [3_000] });

		expect(h.controller.step(50, 100)).toBe('loading');
		expect(h.resyncFromServer).toHaveBeenCalledTimes(1);
		h.state.networkSeq = 2;
		expect(h.controller.step(50, 100)).toBe('waiting');

		// Пробел в поле ввода не считается пользовательским скроллом
		win.emit('keydown', { code: 'Space', target: { tagName: 'TEXTAREA' } });

		h.state.keys.set(50, 'archive_50');
		expect(h.controller.step(50, 100)).toBe('found');
		expect(h.reveal).toHaveBeenCalledWith('archive_50');
		expect(h.onFocused).toHaveBeenCalledTimes(1);
		expect(h.onReady).not.toHaveBeenCalled();
	});

	it('не выдёргивает скролл, если пользователь уже листает (даже после смены сортировки), и прыгает только по jump()', () => {
		vi.useFakeTimers();
		const win = stubWindowEvents();
		const h = createHarness({ loading: true, retryDelaysMs: [3_000, 5_000] });

		h.enterWaiting(77);
		expect(win.count('wheel')).toBe(1);

		win.emit('wheel');
		expect(win.count('wheel')).toBe(0);

		h.state.keys.set(77, 'dtf_77');
		expect(h.controller.step(77, 1)).toBe('ready');
		expect(h.reveal).not.toHaveBeenCalled();
		expect(h.onReady).toHaveBeenCalledTimes(1);

		// Смена сортировки временно убирает список и включает loading — после загрузки скролл всё равно не выдёргивается
		h.state.keys.delete(77);
		h.state.loading = true;
		expect(h.controller.step(77, 1)).toBe('loading');
		h.state.loading = false;
		h.state.keys.set(77, 'dtf_77');
		expect(h.controller.step(77, 1)).toBe('ready');
		expect(h.reveal).not.toHaveBeenCalled();

		const jump = h.onReady.mock.calls[0][0] as () => void;
		jump();
		expect(h.reveal).toHaveBeenCalledWith('dtf_77');
		expect(h.onFocused).toHaveBeenCalledTimes(1);
		expect(h.controller.status).toBe('found');
	});

	it('ставит ожидание на паузу на скрытом слое (active = false) и возобновляет при возврате', async () => {
		vi.useFakeTimers();
		const win = stubWindowEvents();
		const h = createHarness({ loading: true, retryDelaysMs: [3_000] });

		h.enterWaiting(66);
		expect(win.count('wheel')).toBe(1);

		// Поверх поста открыли другой экран: таймеры и слушатели скролла снимаются
		expect(h.controller.step(66, 1, false)).toBe('waiting');
		expect(win.count('wheel')).toBe(0);
		win.emit('wheel');
		await vi.advanceTimersByTimeAsync(10_000);
		expect(h.resyncFromServer).not.toHaveBeenCalled();

		// Комментарий приехал по WS пока слой был скрыт: не фокусирует и не шлёт тост
		h.state.keys.set(66, 'dtf_66');
		expect(h.controller.step(66, 1, false)).toBe('waiting');
		expect(h.reveal).not.toHaveBeenCalled();
		expect(h.onReady).not.toHaveBeenCalled();

		// Пользователь вернулся на пост — сразу переходим к комментарию
		expect(h.controller.step(66, 1, true)).toBe('found');
		expect(h.reveal).toHaveBeenCalledWith('dtf_66');
	});

	it('не сжигает попытку ретрая, если таймер сработал во время активной загрузки', async () => {
		vi.useFakeTimers();
		const h = createHarness({ loading: true, retryDelaysMs: [3_000] });

		h.enterWaiting(33);

		// Пользователь переключил сортировку до срабатывания таймера
		h.state.loading = true;
		await vi.advanceTimersByTimeAsync(3_000);
		expect(h.resyncFromServer).not.toHaveBeenCalled();

		// После окончания загрузки контроллер остаётся в waiting и планирует сохранённую попытку
		h.state.loading = false;
		expect(h.controller.step(33, 1)).toBe('waiting');
		await vi.advanceTimersByTimeAsync(3_000);
		expect(h.resyncFromServer).toHaveBeenCalledTimes(1);
	});

	it('ловит запоздалый комментарий по WebSocket после not-found, а checkNow/retry/dismiss работают корректно', async () => {
		vi.useFakeTimers();
		const win = stubWindowEvents();
		const h = createHarness({ loading: true, retryDelaysMs: [3_000] });

		h.enterWaiting(88);

		h.controller.checkNow();
		expect(h.resyncFromServer).toHaveBeenCalledTimes(1);
		h.state.networkSeq++;
		expect(h.controller.step(88, 1)).toBe('waiting');

		await vi.advanceTimersByTimeAsync(3_000);
		expect(h.resyncFromServer).toHaveBeenCalledTimes(2);
		h.state.networkSeq++;
		expect(h.controller.step(88, 1)).toBe('not-found');

		h.controller.retry();
		expect(h.controller.status).toBe('waiting');
		expect(h.resyncFromServer).toHaveBeenCalledTimes(3);

		h.state.networkSeq++;
		h.controller.step(88, 1);
		await vi.advanceTimersByTimeAsync(3_000);
		h.state.networkSeq++;
		expect(h.controller.step(88, 1)).toBe('not-found');

		win.emit('touchmove');
		h.state.keys.set(88, 'dtf_88');
		expect(h.controller.step(88, 1)).toBe('ready');

		h.controller.dismiss();
		expect(h.controller.status).toBe('idle');
		expect(h.controller.step(88, 1)).toBe('idle');
	});

	it('распознаёт комментарий, скрытый жёстким фильтром, и не запускает фоновые повторы', async () => {
		vi.useFakeTimers();
		const h = createHarness({
			keys: { 7: 'dtf_7' },
			visibleRows: new Set<string>(['dtf_1']),
			retryDelaysMs: [3_000]
		});

		expect(h.controller.step(7, 1)).toBe('hidden-by-filter');
		expect(h.reveal).not.toHaveBeenCalled();
		expect(h.onFocused).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(h.resyncFromServer).not.toHaveBeenCalled();
	});

	it('destroy() снимает таймеры, слушатели и обезвреживает отложенный jump() из тоста', async () => {
		vi.useFakeTimers();
		const win = stubWindowEvents();
		const h = createHarness({ loading: true, retryDelaysMs: [3_000] });

		h.enterWaiting(12);
		expect(win.count('wheel')).toBe(1);

		win.emit('wheel');
		h.state.keys.set(12, 'dtf_12');
		expect(h.controller.step(12, 1)).toBe('ready');
		const staleJump = h.onReady.mock.calls[0][0] as () => void;

		h.controller.destroy();
		expect(win.count('wheel')).toBe(0);
		staleJump();
		expect(h.reveal).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(h.resyncFromServer).not.toHaveBeenCalled();
	});
});
