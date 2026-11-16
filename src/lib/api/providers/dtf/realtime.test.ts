import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	closeRealtime,
	parseCommentV2Event,
	parseCommentVoteEvent,
	parseNotificationRealtimeEvent,
	subscribeChannel,
	subscribeDtfComments
} from './realtime';
import { dtfApiProvider } from './index';
import { authStorage } from '$lib/storage/auth.svelte';
import { resetRefreshCooldown } from './client';

// Чуть больше паузы закрытия после последней отписки (IDLE_CLOSE_MS в realtime.ts)
const IDLE_CLOSE_WAIT_MS = 5_000;

class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;
	static instances: MockWebSocket[] = [];

	readonly url: string;
	readyState = MockWebSocket.CONNECTING;
	sent: string[] = [];
	closed = false;

	onopen: ((ev: Event) => void) | null = null;
	onmessage: ((ev: MessageEvent) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;
	onclose: ((ev: CloseEvent) => void) | null = null;

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
	}

	send(data: string) {
		this.sent.push(data);
	}

	close() {
		this.closed = true;
		this.readyState = MockWebSocket.CLOSED;
	}

	emitHandshake(pingInterval = 1000, pingTimeout = 500) {
		this.readyState = MockWebSocket.OPEN;
		this.emitMessage(`0${JSON.stringify({ sid: 'secret-sid-value', pingInterval, pingTimeout })}`);
	}

	emitReady() {
		this.emitMessage('40');
	}

	emitEvent(channel: string, data: Record<string, unknown>) {
		this.emitMessage(`42${JSON.stringify(['event', { channel, data }])}`);
	}

	emitMessage(data: unknown) {
		this.onmessage?.({ data } as MessageEvent);
	}

	emitError() {
		this.onerror?.(new Event('error'));
	}

	emitClose() {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.({} as CloseEvent);
	}
}

class MockDocument extends EventTarget {
	visibilityState: DocumentVisibilityState = 'visible';
}

function makeSession(token = 'access-1') {
	return {
		type: 'Bearer',
		accessToken: token,
		refreshToken: `refresh-${token}`,
		accessExpTimestamp: Math.floor(Date.now() / 1000) + 86_400,
		refreshExpTimestamp: Math.floor(Date.now() / 1000) + 86_400 * 7
	};
}

describe('dtf realtime client', () => {
	let mockWindow: EventTarget;
	let mockDocument: MockDocument;
	let mockNavigator: { onLine: boolean };

	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		MockWebSocket.instances = [];
		mockWindow = new EventTarget();
		mockDocument = new MockDocument();
		mockNavigator = { onLine: true };

		vi.stubGlobal('WebSocket', MockWebSocket);
		vi.stubGlobal('window', mockWindow);
		vi.stubGlobal('document', mockDocument);
		vi.stubGlobal('navigator', mockNavigator);
		resetRefreshCooldown();
	});

	afterEach(() => {
		closeRealtime();
		authStorage.logout();
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('проходит Engine.IO/Socket.IO handshake и отправляет subscribe с onReady({ reconnected: false })', () => {
		const onReady = vi.fn();
		const unsub = subscribeChannel('api:v2:comments-100', {
			onEvent: vi.fn(),
			onReady
		});

		expect(MockWebSocket.instances).toHaveLength(1);
		const socket = MockWebSocket.instances[0];
		expect(socket.url).toBe('wss://ws-sio.dtf.ru/socket.io/?EIO=3&transport=websocket');

		socket.emitHandshake(2000, 1000);
		expect(socket.sent).toEqual([]);
		expect(onReady).not.toHaveBeenCalled();

		socket.emitReady();
		expect(socket.sent).toEqual(['42["subscribe",{"channel":"api:v2:comments-100"}]']);
		expect(onReady).toHaveBeenCalledTimes(1);
		expect(onReady).toHaveBeenCalledWith({ reconnected: false });

		unsub();
	});

	it('отправляет клиентский ping "2", сбрасывает таймаут по "3" и отвечает "3" на серверный "2"', () => {
		const unsub = subscribeChannel('api:v2:comments-101', { onEvent: vi.fn() });
		const socket = MockWebSocket.instances[0];

		socket.emitHandshake(1000, 400);
		socket.emitReady();
		socket.sent = [];

		// Серверный ping
		socket.emitMessage('2');
		expect(socket.sent).toEqual(['3']);
		socket.sent = [];

		// Через pingInterval клиент сам шлёт "2"
		vi.advanceTimersByTime(1000);
		expect(socket.sent).toEqual(['2']);

		// Pong "3" в пределах pingTimeout отменяет отключение и планирует следующий ping
		vi.advanceTimersByTime(300);
		socket.emitMessage('3');
		vi.advanceTimersByTime(300);
		expect(MockWebSocket.instances).toHaveLength(1);
		expect(socket.closed).toBe(false);

		unsub();
	});

	it('переподключается при потере pong и при таймауте handshake', () => {
		const unsub = subscribeChannel('api:v2:comments-102', { onEvent: vi.fn() });

		// 1. Таймаут handshake (нет '40' за 15s)
		expect(MockWebSocket.instances).toHaveLength(1);
		vi.advanceTimersByTime(15_000);
		expect(MockWebSocket.instances[0].closed).toBe(true);

		// Первая попытка reconnect через base 1000ms (jitter = 1.0 при Math.random() = 0.5)
		vi.advanceTimersByTime(999);
		expect(MockWebSocket.instances).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(MockWebSocket.instances).toHaveLength(2);

		// 2. Потеря pong после успешного handshake
		const second = MockWebSocket.instances[1];
		second.emitHandshake(500, 200);
		second.emitReady();
		vi.advanceTimersByTime(500); // отправлен '2'
		expect(second.sent).toContain('2');
		vi.advanceTimersByTime(200); // нет '3' -> disconnect
		expect(second.closed).toBe(true);

		// reconnectAttempts сбросился после '40', значит снова 1000ms
		vi.advanceTimersByTime(1000);
		expect(MockWebSocket.instances).toHaveLength(3);

		unsub();
	});

	it('при error + close переподключается ровно один раз и игнорирует события устаревшего сокета', () => {
		const onEvent = vi.fn();
		const unsub = subscribeChannel('api:v2:comments-103', { onEvent });
		const first = MockWebSocket.instances[0];
		first.emitHandshake();
		first.emitReady();

		first.emitError();
		first.emitClose();

		vi.advanceTimersByTime(1000);
		expect(MockWebSocket.instances).toHaveLength(2);
		const second = MockWebSocket.instances[1];
		second.emitHandshake();
		second.emitReady();

		// Запоздавшие события первого сокета после смены socketGen игнорируются
		first.emitEvent('api:v2:comments-103', { stale: true });
		first.emitMessage('41');
		expect(onEvent).not.toHaveBeenCalled();
		expect(MockWebSocket.instances).toHaveLength(2);

		// Живой сокет события доставляет
		second.emitEvent('api:v2:comments-103', { fresh: true });
		expect(onEvent).toHaveBeenCalledWith({ fresh: true });

		unsub();
	});

	it('не планирует реконнект в офлайне/фоне и оживляется по online и visibilitychange', () => {
		const onReady = vi.fn();
		const unsub = subscribeChannel('api:v2:comments-104', { onEvent: vi.fn(), onReady });
		const first = MockWebSocket.instances[0];
		first.emitHandshake(5000, 2000);
		first.emitReady();

		// Ушли в фон и оборвался сокет — таймер реконнекта не запускается
		mockDocument.visibilityState = 'hidden';
		first.emitMessage('41');
		vi.advanceTimersByTime(60_000);
		expect(MockWebSocket.instances).toHaveLength(1);

		// Вернулись на вкладку — немедленный реконнект
		mockDocument.visibilityState = 'visible';
		mockDocument.dispatchEvent(new Event('visibilitychange'));
		expect(MockWebSocket.instances).toHaveLength(2);

		const second = MockWebSocket.instances[1];
		second.emitHandshake(20_000, 10_000);
		second.emitReady();
		expect(onReady).toHaveBeenLastCalledWith({ reconnected: true });

		// Проснулась вкладка на ready-сокете -> быстрый wake ping ('2') с таймаутом 5000ms
		second.sent = [];
		mockDocument.visibilityState = 'visible';
		mockDocument.dispatchEvent(new Event('visibilitychange'));
		expect(second.sent).toEqual(['2']);
		vi.advanceTimersByTime(5000);
		expect(second.closed).toBe(true);

		// Сетевой сбой в офлайне -> восстановление по 'online'
		mockNavigator.onLine = false;
		vi.advanceTimersByTime(1000);
		expect(MockWebSocket.instances).toHaveLength(2);
		mockNavigator.onLine = true;
		mockWindow.dispatchEvent(new Event('online'));
		expect(MockWebSocket.instances).toHaveLength(3);

		unsub();
	});

	it('ведёт ref-counting подписок на канал, изолирует ошибки подписчиков и переподписывается при реконнекте', async () => {
		const onEvent1 = vi.fn(() => {
			throw new Error('listener failure');
		});
		const onEvent2 = vi.fn();
		const onReady1 = vi.fn();
		const onReady2 = vi.fn();
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const unsub1 = subscribeChannel('api:v2:comments-105', { onEvent: onEvent1, onReady: onReady1 });
		const unsub2 = subscribeChannel('api:v2:comments-105', { onEvent: onEvent2, onReady: onReady2 });

		const socket = MockWebSocket.instances[0];
		socket.emitHandshake();
		socket.emitReady();

		// Один subscribe на канал несмотря на двух подписчиков
		expect(socket.sent).toEqual(['42["subscribe",{"channel":"api:v2:comments-105"}]']);
		expect(onReady1).toHaveBeenCalledWith({ reconnected: false });
		expect(onReady2).toHaveBeenCalledWith({ reconnected: false });

		// Ошибка в первом подписчике не ломает доставку второму
		socket.emitEvent('api:v2:comments-105', { hello: 1 });
		expect(onEvent2).toHaveBeenCalledWith({ hello: 1 });
		expect(warnSpy).toHaveBeenCalled();

		// Третий подписчик подключается к уже готовому каналу -> onReady в микротаске без дубля subscribe
		const onReady3 = vi.fn();
		const onEvent3 = vi.fn();
		const unsub3 = subscribeChannel('api:v2:comments-105', { onEvent: onEvent3, onReady: onReady3 });
		expect(onReady3).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(onReady3).toHaveBeenCalledWith({ reconnected: false });
		expect(socket.sent).toHaveLength(1);

		// Отписка первого не шлёт unsubscribe и не закрывает сокет
		unsub1();
		expect(socket.closed).toBe(false);
		expect(socket.sent).toHaveLength(1);

		// Реконнект переподписывает оставшийся активный канал и вызывает onReady({ reconnected: true })
		socket.emitMessage('1');
		vi.advanceTimersByTime(1000);
		expect(MockWebSocket.instances).toHaveLength(2);
		const reconnectedSocket = MockWebSocket.instances[1];
		reconnectedSocket.emitHandshake();
		reconnectedSocket.emitReady();
		expect(reconnectedSocket.sent).toEqual(['42["subscribe",{"channel":"api:v2:comments-105"}]']);
		expect(onReady2).toHaveBeenLastCalledWith({ reconnected: true });
		expect(onReady3).toHaveBeenLastCalledWith({ reconnected: true });

		// Удаление последнего подписчика шлёт unsubscribe, соединение закрывается после паузы
		unsub2();
		expect(reconnectedSocket.sent).toHaveLength(1);
		unsub3();
		expect(reconnectedSocket.sent).toEqual([
			'42["subscribe",{"channel":"api:v2:comments-105"}]',
			'42["unsubscribe",{"channel":"api:v2:comments-105"}]'
		]);
		vi.advanceTimersByTime(IDLE_CLOSE_WAIT_MS);
		expect(reconnectedSocket.closed).toBe(true);
	});

	it('после последней отписки держит сокет в паузе: новая подписка переиспользует его, без подписок он закрывается', () => {
		const unsub = subscribeChannel('api:v2:comments-110', { onEvent: vi.fn() });
		const socket = MockWebSocket.instances[0];
		socket.emitHandshake(60_000, 30_000);
		socket.emitReady();

		// Переход между постами: старый канал ушёл, новый появился в пределах паузы
		unsub();
		expect(socket.sent).toContain('42["unsubscribe",{"channel":"api:v2:comments-110"}]');
		vi.advanceTimersByTime(IDLE_CLOSE_WAIT_MS - 1);
		const unsub2 = subscribeChannel('api:v2:comments-111', { onEvent: vi.fn() });
		expect(socket.sent.at(-1)).toBe('42["subscribe",{"channel":"api:v2:comments-111"}]');
		vi.advanceTimersByTime(IDLE_CLOSE_WAIT_MS * 2);
		expect(MockWebSocket.instances).toHaveLength(1);
		expect(socket.closed).toBe(false);

		// Пауза истекла без подписок: сокет закрыт, следующая подписка открывает новый
		unsub2();
		vi.advanceTimersByTime(IDLE_CLOSE_WAIT_MS);
		expect(socket.closed).toBe(true);
		const unsub3 = subscribeChannel('api:v2:comments-112', { onEvent: vi.fn() });
		expect(MockWebSocket.instances).toHaveLength(2);
		unsub3();
	});

	it('parseCommentV2Event разбирает v2 события и донаты, отбрасывает чужой postId', () => {
		const created = parseCommentV2Event(500, {
			type: 'comment_created',
			comment: {
				id: 9001,
				date: 1_700_000_000,
				lastModificationDate: 1_700_000_005,
				text: 'Новый комментарий',
				entry: { id: 500 },
				author: { id: 12, name: 'Автор' },
				reactions: { counter: 1, items: [] }
			}
		});
		expect(created).toMatchObject({
			type: 'comment_created',
			postId: 500,
			comment: {
				id: 9001,
				postId: 500,
				content: 'Новый комментарий',
				lastModificationDate: 1_700_000_005
			}
		});

		expect(
			parseCommentV2Event(500, { type: 'change_donation_amount_for_comment', data: { commentId: 9001, amount: 150 } })
		).toEqual({ type: 'change_donation_amount_for_comment', postId: 500, commentId: 9001, amount: 150 });
		expect(
			parseCommentV2Event(500, { type: 'change_donation_amount_for_comment', data: { commentId: 9001, amount: 'x' } })
		).toBeNull();

		// чужой postId отбрасывается
		expect(
			parseCommentV2Event(500, {
				type: 'comment_edited',
				comment: { id: 9003, entry: { id: 999 } }
			})
		).toBeNull();
	});

	it('parseCommentVoteEvent разбирает comment voted, игнорирует v1 comment_created и невалидные payload', () => {
		expect(
			parseCommentVoteEvent(77, {
				type: 'comment voted',
				content_id: 77,
				id: 3001,
				fromReactionId: 0,
				reactionId: 5,
				reactionCount: 4,
				count: 10,
				subsite_id: 42
			})
		).toEqual({
			type: 'comment_voted',
			postId: 77,
			commentId: 3001,
			fromReactionId: 0,
			reactionId: 5,
			reactionCount: 4,
			actorId: 42
		});

		expect(parseCommentVoteEvent(77, { type: 'comment_created', comment: { id: 1 } })).toBeNull();
		expect(
			parseCommentVoteEvent(77, {
				type: 'comment voted',
				content_id: 78,
				id: 3001,
				fromReactionId: 0,
				reactionId: 5,
				reactionCount: 1,
				count: 1
			})
		).toBeNull();
		expect(
			parseCommentVoteEvent(77, {
				type: 'comment voted',
				content_id: 77,
				id: 3001,
				fromReactionId: 0,
				reactionId: 0,
				reactionCount: 0,
				count: 0
			})
		).toBeNull();
	});

	it('subscribeDtfComments объединяет v2 структуру и v1 оценки в одном WS-соединении', () => {
		const events: unknown[] = [];
		const onReady = vi.fn();
		const unsub = subscribeDtfComments(88, (e) => events.push(e), { onReady });

		expect(MockWebSocket.instances).toHaveLength(1);
		const socket = MockWebSocket.instances[0];
		socket.emitHandshake();
		socket.emitReady();

		expect(socket.sent).toEqual([
			'42["subscribe",{"channel":"api:v2:comments-88"}]',
			'42["subscribe",{"channel":"api:comments-88"}]'
		]);
		expect(onReady).toHaveBeenCalledWith({ reconnected: false });

		socket.emitEvent('api:v2:comments-88', {
			type: 'comment_created',
			comment: { id: 10, text: 'hi', entry: { id: 88 }, author: { id: 1, name: 'A' }, date: 100 }
		});
		socket.emitEvent('api:comments-88', {
			type: 'comment voted',
			content_id: 88,
			id: 10,
			fromReactionId: 0,
			reactionId: 1,
			reactionCount: 1,
			count: 1
		});
		// Дубль v1 creation игнорируется
		socket.emitEvent('api:comments-88', {
			type: 'comment_created',
			comment: { id: 10, text: 'v1' }
		});

		expect(events).toHaveLength(2);
		expect((events[0] as { type: string }).type).toBe('comment_created');
		expect((events[1] as { type: string }).type).toBe('comment_voted');

		unsub();
		vi.advanceTimersByTime(IDLE_CLOSE_WAIT_MS);
		expect(socket.closed).toBe(true);
	});

	it('parseNotificationRealtimeEvent принимает только числовые type > 0 и counter >= 0', () => {
		expect(parseNotificationRealtimeEvent({ type: 16, counter: 3 })).toEqual({ type: 16, unread: 3 });
		expect(parseNotificationRealtimeEvent({ type: 0, counter: 3 })).toBeNull();
		expect(parseNotificationRealtimeEvent({ type: 'NotificationUpdate', counter: 3 })).toBeNull();
		expect(parseNotificationRealtimeEvent({ type: 16, counter: -1 })).toBeNull();
	});

	it('dtfApiProvider.subscribeNotifications берёт userHash из /subsite/me и доставляет события', async () => {
		authStorage.session = makeSession('acc-me-hash');
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ result: { id: 777, name: 'Me', userHash: 'opaque-hash-abc' } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const onUpdate = vi.fn();
		const onReady = vi.fn();
		const unsub = dtfApiProvider.subscribeNotifications(onUpdate, { onReady });

		await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toContain('/v2.31/subsite/me');

		const socket = MockWebSocket.instances[0];
		socket.emitHandshake();
		socket.emitReady();

		expect(socket.sent).toEqual(['42["subscribe",{"channel":"mobile:opaque-hash-abc"}]']);
		expect(onReady).toHaveBeenCalledWith({ reconnected: false });

		socket.emitEvent('mobile:opaque-hash-abc', { type: 4, counter: 5 });
		expect(onUpdate).toHaveBeenCalledWith({ type: 4, unread: 5 });

		unsub();
	});

	it('getMe склеивает параллельные вызовы в один запрос и запоминает userHash для подписки', async () => {
		authStorage.session = makeSession('acc-coalesce');
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { id: 1, name: 'Me', userHash: 'h1' } }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await Promise.all([dtfApiProvider.getMe(), dtfApiProvider.getMe()]);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const unsub = dtfApiProvider.subscribeNotifications(vi.fn());
		await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		unsub();
	});

	it('dtfApiProvider.subscribeNotifications: если сервер не дал userHash, подписка тихо не создаётся и не повторяется', async () => {
		vi.useFakeTimers();
		authStorage.session = makeSession('acc-no-hash');
		const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ result: { id: 888, name: 'Me' } }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const onError = vi.fn();
		const unsub = dtfApiProvider.subscribeNotifications(vi.fn(), { onError });
		await vi.advanceTimersByTimeAsync(60_000);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
		expect(MockWebSocket.instances).toHaveLength(0);
		unsub();
	});

	it('dtfApiProvider.subscribeNotifications отменяет подписку при отписке или смене сессии до получения userHash', async () => {
		authStorage.session = makeSession('acc-race');
		let resolveMe!: (res: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveMe = resolve;
					})
			)
		);

		const unsub = dtfApiProvider.subscribeNotifications(vi.fn(), { onError: vi.fn() });
		unsub();
		resolveMe(new Response(JSON.stringify({ result: { id: 99, name: 'Me', userHash: 'late-hash' } }), { status: 200 }));
		await Promise.resolve();
		await Promise.resolve();
		expect(MockWebSocket.instances).toHaveLength(0);

		// То же самое при logout() до завершения resolveUserHash
		authStorage.session = makeSession('acc-race-2');
		let resolveMe2!: (res: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveMe2 = resolve;
					})
			)
		);
		const onError = vi.fn();
		const unsub2 = dtfApiProvider.subscribeNotifications(vi.fn(), { onError });
		authStorage.logout();
		resolveMe2(new Response(JSON.stringify({ result: { id: 100, name: 'Me', userHash: 'stale-hash' } }), { status: 200 }));
		await Promise.resolve();
		await Promise.resolve();
		expect(MockWebSocket.instances).toHaveLength(0);
		expect(onError).not.toHaveBeenCalled();
		unsub2();
	});

	it('REST методы уведомлений: счётчик, markNotificationsRead и markAllNotificationsRead', async () => {
		authStorage.session = makeSession('acc-rest');
		const calls: Array<{ url: string; method?: string; body?: FormData }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
				calls.push({ url, method: init?.method, body: init?.body as FormData | undefined });
				if (url.includes('/subsite/me/updates/count')) {
					return new Response(JSON.stringify({ result: { count: 14 } }), { status: 200 });
				}
				if (url.includes('/subsite/notifications/markAsRead')) {
					const body = init?.body as FormData;
					if (body?.get('all') === 'true') {
						return new Response(JSON.stringify({ result: { result: true } }), { status: 200 });
					}
					return new Response(JSON.stringify({ result: { result: false } }), { status: 200 });
				}
				return new Response('{}', { status: 404 });
			})
		);

		expect(await dtfApiProvider.getNotificationsUnreadCount()).toBe(14);
		await dtfApiProvider.markNotificationsRead([]); // пустой массив — без запроса
		expect(calls).toHaveLength(1);

		await dtfApiProvider.markAllNotificationsRead();
		expect(calls).toHaveLength(2);
		expect(calls[1].url).toContain('/v2.1/subsite/notifications/markAsRead');
		expect(calls[1].body?.get('all')).toBe('true');

		await expect(dtfApiProvider.markNotificationsRead([1, 2])).rejects.toThrow('Не удалось отметить уведомления прочитанными');
	});

	it('dtfApiProvider.subscribeNotifications повторяет resolveUserHash после временной ошибки и отменяет таймер при отписке', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		authStorage.session = makeSession('acc-retry');

		let attempts = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async (url: string) => {
				if (url.includes('/v2.31/subsite/me')) {
					attempts++;
					if (attempts === 1) {
						throw new TypeError('Failed to fetch');
					}
					return new Response(JSON.stringify({ result: { id: 777, name: 'Me', userHash: 'retry-hash-ok' } }), { status: 200 });
				}
				return new Response('{}', { status: 404 });
			})
		);

		const onError = vi.fn();
		const unsub = dtfApiProvider.subscribeNotifications(vi.fn(), { onError });
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		expect(MockWebSocket.instances).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(2_000);
		await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
		const socket = MockWebSocket.instances[0];
		socket.emitHandshake();
		socket.emitReady();
		expect(socket.sent).toEqual(['42["subscribe",{"channel":"mobile:retry-hash-ok"}]']);
		unsub();

		// Если отписаться во время ожидания повтора, повторный запрос не выполняется
		authStorage.session = makeSession('acc-retry-cancel');
		attempts = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async () => {
				attempts++;
				throw new TypeError('Network down');
			})
		);
		const onError2 = vi.fn();
		const unsub2 = dtfApiProvider.subscribeNotifications(vi.fn(), { onError: onError2 });
		await vi.waitFor(() => expect(onError2).toHaveBeenCalledTimes(1));
		unsub2();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(attempts).toBe(1);
	});
});
