import { api } from './index.svelte';
import type { Notification } from './types';
import { filterSettings, isNotificationHidden } from '$lib/storage/filter.svelte';

let all = $state.raw<Notification[]>([]);
/** Уведомления без тех, где все авторы скрыты локально */
let items = $derived(all.filter((n) => !isNotificationHidden(n, filterSettings.value.users)));
/** Число новых для колокольчика: считает сервер, мы его только показываем */
let unread = $state(0);
let loading = $state(false);
let error = $state('');

// Служебное состояние вне $state, чтобы эффекты в компонентах не подписывались на флаги запросов
/** Растёт в clear(): ответ, который ждали при прошлой сессии, не применяется */
let epoch = 0;
/** Растёт, когда число новых пришло из более свежего источника (событие сокета, загрузка списка): опоздавший ответ счётчика его не затирает */
let fresher = 0;
let loaded = false;
/** Список устарел: пришло событие сокета или прошлая загрузка не удалась */
let stale = true;
/** Сколько списков открыто сейчас */
let visible = 0;
let running: Promise<void> | undefined;
let unsubscribe: (() => void) | undefined;

/** Один запрос за раз; если за время запроса список снова устарел, грузит ещё раз */
function load(): Promise<void> {
	return (running ??= run());
}

async function run(): Promise<void> {
	const mine = epoch;
	loading = true;
	error = '';
	try {
		do {
			stale = false;
			const next = await api.getNotifications();
			if (mine !== epoch) return;
			all = next;
			loaded = true;
			unread = 0; // запрос списка сам обнуляет серверный счётчик
			fresher++;
		} while (stale);
	} catch (e) {
		if (mine !== epoch) return;
		stale = true;
		error = (e as Error).message;
	} finally {
		if (mine === epoch) {
			running = undefined;
			loading = false;
		}
	}
}

/** Сервер прислал новое состояние: список устарел, открытый перезагружаем сразу */
function invalidate() {
	stale = true;
	if (visible > 0) void load();
}

function syncCount() {
	const mine = epoch;
	const seen = fresher;
	api
		.getNotificationsUnreadCount()
		.then((count) => {
			if (mine === epoch && seen === fresher) unread = count;
		})
		.catch((e) => console.warn('[notifications] Не удалось получить счётчик:', e));
}

/** Уведомления вошедшего пользователя DTF для колокольчика в шапке. */
export const notifications = {
	get items() {
		return items;
	},
	get loading() {
		return loading;
	},
	get error() {
		return error;
	},
	get unread() {
		return unread;
	},

	/** Кнопка «Пометить все»: есть непрочитанные, в том числе скрытые локальным фильтром */
	get canMarkAll() {
		return all.some((n) => !n.isRead);
	},

	/** Подключает счётчик и сокет для текущей сессии; повторный вызов при живой подписке ничего не делает */
	connect() {
		if (unsubscribe) return;
		syncCount();
		unsubscribe = api.subscribeNotifications(
			(event) => {
				unread = event.unread;
				fresher++;
				invalidate();
			},
			{
				// За время обрыва события потеряны: счётчик и список перечитываем
				onReady: ({ reconnected }) => {
					if (!reconnected) return;
					syncCount();
					invalidate();
				}
			}
		);
		if (visible > 0) void load();
	},

	/** Регистрирует открытый список; при открытии загружает его, если не загружен или устарел. Возвращает снятие */
	trackVisible(): () => void {
		visible++;
		if (!loaded || stale) void load();
		return () => void visible--;
	},

	load,

	/** Отметить прочитанными: сразу у себя, на сервере — следом. Без аргументов — все, включая скрытые фильтром */
	async markRead(ids?: number[]): Promise<void> {
		const mine = epoch;
		const changed = new Set(all.filter((n) => !n.isRead && (!ids || ids.includes(n.id))).map((n) => n.id));
		if (ids && changed.size === 0) return;

		const setRead = (isRead: boolean) => (all = all.map((n) => (changed.has(n.id) ? { ...n, isRead } : n)));
		setRead(true);
		try {
			await (ids ? api.markNotificationsRead([...changed]) : api.markAllNotificationsRead());
		} catch (e) {
			console.warn('[notifications] Не удалось отметить прочитанными:', e);
			if (mine === epoch) setRead(false);
		}
	},

	clear() {
		epoch++;
		unsubscribe?.();
		unsubscribe = undefined;
		all = [];
		unread = 0;
		error = '';
		loading = false;
		loaded = false;
		stale = true;
		running = undefined;
	}
};
