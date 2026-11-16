import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'svelte/server';
import NotificationsPanel from './NotificationsPanel.svelte';
import { authStorage } from '$lib/storage/auth.svelte';
import { filterSettings } from '$lib/storage/filter.svelte';
import { notifications } from '$lib/api/notifications.svelte';
import { currentUser } from '$lib/api/currentUser.svelte';
import { api } from '$lib/api/index.svelte';
import type { Notification, RealtimeNotificationEvent, RealtimeSubscriptionOptions } from '$lib/api/types';

function makeNotification(id: number, overrides: Partial<Notification> = {}): Notification {
	return {
		id,
		isRead: false,
		text: `Уведомление ${id}`,
		parts: [{ text: `Уведомление ${id}` }],
		type: 4,
		createdAt: '2026-01-01T00:00:00.000Z',
		userIds: [100 + id],
		...overrides
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('NotificationsPanel: плавная смена заголовка при обновлении', () => {
	beforeEach(() => {
		authStorage.session = {
			userId: 12345,
			accessToken: 'fake-token'
		} as any;
		notifications.clear();
	});

	afterEach(() => {
		authStorage.logout();
		notifications.clear();
	});

	it('рендерит заголовок с плавной сменой на «Обновляем...» и анимированными точками', () => {
		const { body } = render(NotificationsPanel);

		expect(body).toContain('notifications__title');
		expect(body).toContain('notifications__title-text');
		expect(body).toContain('Уведомления');
		expect(body).toContain('notifications__title-updating');
		expect(body).toContain('Обновляем');
		expect(body).toContain('notifications__dots');
		expect(body).toContain('notifications__dot');
	});

	it('показывает статус входа для неавторизованного пользователя', () => {
		authStorage.logout();
		const { body } = render(NotificationsPanel);

		expect(body).toContain('Войдите, чтобы видеть уведомления');
		expect(body).not.toContain('notifications__list');
	});

	it('в попапе рендерит футер со ссылкой на все уведомления', () => {
		const { body } = render(NotificationsPanel, { props: { page: false } });

		expect(body).toContain('notifications__footer');
		expect(body).toContain('Все уведомления');
	});

	it('на странице уведомлений не показывает ссылку на все уведомления', () => {
		const { body } = render(NotificationsPanel, { props: { page: true } });

		expect(body).toContain('notifications--page');
		expect(body).not.toContain('notifications__footer');
	});
});

describe('notifications store: realtime и серверный счётчик', () => {
	let capturedOnUpdate: ((event: RealtimeNotificationEvent) => void) | undefined;
	let capturedOptions: RealtimeSubscriptionOptions | undefined;
	let unsubMock: ReturnType<typeof vi.fn<() => void>>;
	let prevHiddenUsers: typeof filterSettings.value.users;
	let cleanups: Array<() => void>;

	/** Открытый список; снятие можно звать и в тесте, и в afterEach: счётчик открытых списков общий на модуль */
	const trackVisible = () => {
		const release = notifications.trackVisible();
		let released = false;
		const stop = () => {
			if (!released) {
				released = true;
				release();
			}
		};
		cleanups.push(stop);
		return stop;
	};

	beforeEach(() => {
		prevHiddenUsers = filterSettings.value.users;
		capturedOnUpdate = undefined;
		capturedOptions = undefined;
		unsubMock = vi.fn<() => void>();
		cleanups = [];

		authStorage.session = {
			type: 'Bearer',
			accessToken: 'fake-token',
			refreshToken: 'fake-refresh',
			accessExpTimestamp: Math.floor(Date.now() / 1000) + 3600,
			refreshExpTimestamp: Math.floor(Date.now() / 1000) + 86400
		};
		notifications.clear();

		vi.spyOn(api, 'subscribeNotifications').mockImplementation((onUpdate, options) => {
			capturedOnUpdate = onUpdate;
			capturedOptions = options;
			return () => unsubMock();
		});
		vi.spyOn(api, 'getNotificationsUnreadCount').mockResolvedValue(0);
		vi.spyOn(api, 'getNotifications').mockResolvedValue([]);
		vi.spyOn(api, 'markNotificationsRead').mockResolvedValue(undefined);
		vi.spyOn(api, 'markAllNotificationsRead').mockResolvedValue(undefined);
	});

	afterEach(() => {
		for (const stop of cleanups.splice(0)) stop();
		filterSettings.patch({ users: prevHiddenUsers });
		notifications.clear();
		authStorage.logout();
		vi.restoreAllMocks();
	});

	it('событие сокета ставит unread, загрузка списка обнуляет его; connect идемпотентен', async () => {
		vi.mocked(api.getNotificationsUnreadCount).mockResolvedValue(2);
		vi.mocked(api.getNotifications).mockResolvedValue([makeNotification(1)]);

		notifications.connect();
		notifications.connect();
		expect(api.subscribeNotifications).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(notifications.unread).toBe(2));

		capturedOnUpdate?.({ type: 4, unread: 5 });
		expect(notifications.unread).toBe(5);
		expect(api.getNotifications).not.toHaveBeenCalled();

		await notifications.load();
		expect(notifications.unread).toBe(0);
		expect(notifications.items).toHaveLength(1);
	});

	it('опоздавший ответ счётчика не затирает число из события и обнуление после загрузки списка', async () => {
		const count = deferred<number>();
		vi.mocked(api.getNotificationsUnreadCount).mockReturnValueOnce(count.promise);
		notifications.connect();

		capturedOnUpdate?.({ type: 4, unread: 3 });
		await notifications.load();
		expect(notifications.unread).toBe(0);

		count.resolve(7);
		await Promise.resolve();
		await Promise.resolve();
		expect(notifications.unread).toBe(0);
	});

	it('событие при открытом списке перезагружает его (по одному запросу за раз), при закрытом — нет', async () => {
		notifications.connect();
		const stop = trackVisible();
		await vi.waitFor(() => expect(notifications.loading).toBe(false));
		expect(api.getNotifications).toHaveBeenCalledTimes(1);

		const first = deferred<Notification[]>();
		const second = deferred<Notification[]>();
		vi.mocked(api.getNotifications).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

		capturedOnUpdate?.({ type: 4, unread: 1 });
		// Пока запрос в полёте, новые события не плодят запросы, но заказывают ещё один проход
		capturedOnUpdate?.({ type: 4, unread: 2 });
		capturedOnUpdate?.({ type: 4, unread: 3 });
		expect(api.getNotifications).toHaveBeenCalledTimes(2);

		first.resolve([makeNotification(1)]);
		await vi.waitFor(() => expect(api.getNotifications).toHaveBeenCalledTimes(3));
		second.resolve([makeNotification(2), makeNotification(1)]);
		await vi.waitFor(() => expect(notifications.loading).toBe(false));
		expect(notifications.items).toHaveLength(2);
		expect(notifications.unread).toBe(0);

		stop();
		capturedOnUpdate?.({ type: 4, unread: 1 });
		expect(api.getNotifications).toHaveBeenCalledTimes(3);
		expect(notifications.unread).toBe(1);

		// Открытие устаревшего списка догружает его
		trackVisible();
		await vi.waitFor(() => expect(api.getNotifications).toHaveBeenCalledTimes(4));
	});

	it('переподключение сокета перечитывает счётчик и открытый список, первое подключение — нет', async () => {
		notifications.connect();
		await vi.waitFor(() => expect(api.getNotificationsUnreadCount).toHaveBeenCalledTimes(1));
		trackVisible();
		await vi.waitFor(() => expect(notifications.loading).toBe(false));

		capturedOptions?.onReady?.({ reconnected: false });
		expect(api.getNotificationsUnreadCount).toHaveBeenCalledTimes(1);

		capturedOptions?.onReady?.({ reconnected: true });
		await vi.waitFor(() => expect(api.getNotificationsUnreadCount).toHaveBeenCalledTimes(2));
		expect(api.getNotifications).toHaveBeenCalledTimes(2);
	});

	it('markRead не трогает unread, при ошибке возвращает подсветку; «все» затрагивает скрытых фильтром', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		filterSettings.patch({ users: [{ id: 999, name: 'Blocked' }] });
		vi.mocked(api.getNotifications).mockResolvedValue([makeNotification(1), makeNotification(2, { userIds: [999] })]);

		notifications.connect();
		await notifications.load();
		capturedOnUpdate?.({ type: 4, unread: 2 });
		vi.mocked(api.getNotifications).mockClear();

		expect(notifications.items.map((n) => n.id)).toEqual([1]);
		expect(notifications.canMarkAll).toBe(true);

		vi.mocked(api.markNotificationsRead).mockRejectedValueOnce(new Error('network fail'));
		await notifications.markRead([1]);
		expect(notifications.items[0].isRead).toBe(false);
		expect(warnSpy).toHaveBeenCalled();

		await notifications.markRead([1]);
		expect(api.markNotificationsRead).toHaveBeenLastCalledWith([1]);
		expect(notifications.items[0].isRead).toBe(true);
		expect(notifications.unread).toBe(2);
		// Скрытое фильтром остаётся непрочитанным, «Пометить все» всё ещё нужна
		expect(notifications.canMarkAll).toBe(true);

		await notifications.markRead([1]);
		expect(api.markNotificationsRead).toHaveBeenCalledTimes(2);

		await notifications.markRead();
		expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1);
		expect(notifications.canMarkAll).toBe(false);
		expect(notifications.unread).toBe(2);
	});

	it('ответы, пришедшие после clear(), не применяются', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const list = deferred<Notification[]>();
		const count = deferred<number>();
		vi.mocked(api.getNotifications).mockReturnValueOnce(list.promise);
		vi.mocked(api.getNotificationsUnreadCount).mockReturnValueOnce(count.promise);

		notifications.connect();
		const loadPromise = notifications.load();
		notifications.clear();
		list.resolve([makeNotification(1)]);
		count.resolve(7);
		await loadPromise;
		await Promise.resolve();

		expect(notifications.items).toEqual([]);
		expect(notifications.unread).toBe(0);
		expect(notifications.loading).toBe(false);
		expect(unsubMock).toHaveBeenCalledTimes(1);

		// Откат неудачной пометки старой сессии тоже не трогает новый список
		vi.mocked(api.getNotifications).mockResolvedValueOnce([makeNotification(1)]);
		await notifications.load();
		const markFail = deferred<void>();
		vi.mocked(api.markAllNotificationsRead).mockReturnValueOnce(markFail.promise);
		const marking = notifications.markRead();
		notifications.clear();
		vi.mocked(api.getNotifications).mockResolvedValueOnce([makeNotification(1, { isRead: true })]);
		await notifications.load();
		markFail.reject(new Error('late fail'));
		await marking;
		expect(notifications.items[0].isRead).toBe(true);
		expect(warnSpy).toHaveBeenCalled();
	});

	it('синхронизирует сброс счётчика и прочтение с другими вкладками через BroadcastChannel', async () => {
		const count = deferred<number>();
		vi.mocked(api.getNotificationsUnreadCount).mockReturnValueOnce(count.promise);
		vi.spyOn(api, 'getMe').mockResolvedValue({ id: 777, name: 'User' } as any);
		await currentUser.load();

		const peer = new BroadcastChannel('redtf:notifications');
		const sent: unknown[] = [];
		peer.onmessage = (e) => sent.push(e.data);

		try {
			notifications.connect();
			capturedOnUpdate?.({ type: 4, unread: 3 });
			expect(notifications.unread).toBe(3);

			// Чужой аккаунт игнорируется
			peer.postMessage({ type: 'loaded', userId: 999, items: [makeNotification(1)] });
			await new Promise((r) => setTimeout(r, 20));
			expect(notifications.unread).toBe(3);

			// Своя вкладка загрузила список: unread сбрасывается и опоздавший счётчик его не затирает
			const syncedItem = makeNotification(10);
			peer.postMessage({ type: 'loaded', userId: 777, items: [syncedItem, makeNotification(11)] });
			await vi.waitFor(() => expect(notifications.unread).toBe(0));
			expect(notifications.items.map((n) => n.id)).toEqual([10, 11]);

			count.resolve(5);
			await Promise.resolve();
			await Promise.resolve();
			expect(notifications.unread).toBe(0);

			// Пометка прочитанным из другой вкладки снимает подсветку, не трогая unread
			capturedOnUpdate?.({ type: 4, unread: 1 });
			peer.postMessage({ type: 'markRead', userId: 777, ids: [10] });
			await vi.waitFor(() => expect(notifications.items[0].isRead).toBe(true));
			expect(notifications.items[1].isRead).toBe(false);
			expect(notifications.unread).toBe(1);

			peer.postMessage({ type: 'markRead', userId: 777 });
			await vi.waitFor(() => expect(notifications.canMarkAll).toBe(false));

			// Свои load() и markRead() рассылают события другим вкладкам
			vi.mocked(api.getNotifications).mockResolvedValueOnce([makeNotification(20)]);
			await notifications.load();
			await notifications.markRead([20]);
			await vi.waitFor(() => expect(sent).toHaveLength(2));
			expect(sent[0]).toEqual({ type: 'loaded', userId: 777, items: [makeNotification(20)] });
			expect(sent[1]).toEqual({ type: 'markRead', userId: 777, ids: [20] });
		} finally {
			peer.close();
			currentUser.clear();
		}
	});
});
