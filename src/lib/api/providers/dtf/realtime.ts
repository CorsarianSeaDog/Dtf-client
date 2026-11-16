import type {
	RealtimeCommentEvent,
	RealtimeCommentVotedEvent,
	RealtimeNotificationEvent,
	RealtimeSubscriptionOptions
} from '../../types';
import { mapComment } from './mappers';

const WS_URL = 'wss://ws-sio.dtf.ru/socket.io/?EIO=3&transport=websocket';
const HANDSHAKE_TIMEOUT_MS = 15_000;
const DEFAULT_PING_INTERVAL_MS = 25_000;
const DEFAULT_PING_TIMEOUT_MS = 20_000;
const WAKE_PING_TIMEOUT_MS = 5_000;
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
// Соединение живёт ещё немного после последней отписки: при переходе между постами старые
// каналы уходят раньше, чем появляются новые, и без паузы сокет рвался бы на каждом переходе
const IDLE_CLOSE_MS = 5_000;

type SocketState = 'idle' | 'connecting' | 'eio_open' | 'ready' | 'closed';

type ChannelListener = {
	onEvent: (data: Record<string, unknown>) => void;
	onReady?: (info: { reconnected: boolean }) => void;
	syncedOnce: boolean;
};

const channels = new Map<string, Set<ChannelListener>>();

let ws: WebSocket | null = null;
let state: SocketState = 'idle';
let socketGen = 0;
let pingIntervalMs = DEFAULT_PING_INTERVAL_MS;
let pingTimeoutMs = DEFAULT_PING_TIMEOUT_MS;
let reconnectAttempts = 0;

let connectTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setTimeout> | undefined;
let pongTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let envListening = false;

function clearTimers() {
	if (connectTimer !== undefined) clearTimeout(connectTimer);
	if (pingTimer !== undefined) clearTimeout(pingTimer);
	if (pongTimer !== undefined) clearTimeout(pongTimer);
	if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
	if (idleTimer !== undefined) clearTimeout(idleTimer);
	connectTimer = undefined;
	pingTimer = undefined;
	pongTimer = undefined;
	reconnectTimer = undefined;
	idleTimer = undefined;
}

function sendRaw(frame: string) {
	if (ws && ws.readyState === WebSocket.OPEN) {
		try {
			ws.send(frame);
		} catch {
			// Сетевая ошибка на отправке закроет сокет через error/close или таймаут pong
		}
	}
}

function sendPacket(eventName: string, payload: unknown) {
	sendRaw(`42${JSON.stringify([eventName, payload])}`);
}

function detachSocket(target: WebSocket | null) {
	if (!target) return;
	target.onopen = null;
	target.onmessage = null;
	target.onerror = null;
	target.onclose = null;
	try {
		if (target.readyState === WebSocket.CONNECTING || target.readyState === WebSocket.OPEN) {
			target.close();
		}
	} catch {
		// Игнорируем ошибку закрытия уже мёртвого сокета
	}
}

function isHidden(): boolean {
	return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function isOffline(): boolean {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// connect() сам гасит отложенный реконнект
function reconnectNow() {
	reconnectAttempts = 0;
	connect();
}

function onOnline() {
	if (channels.size > 0 && state === 'closed') reconnectNow();
}

function onVisibilityChange() {
	if (channels.size === 0 || isHidden() || isOffline()) return;
	if (state === 'closed') {
		reconnectNow();
	} else if (state === 'ready' && pongTimer === undefined) {
		// После сна вкладки/WebView проверяем, жив ли сокет, не дожидаясь следующего pingInterval
		sendPing(socketGen, Math.min(pingTimeoutMs, WAKE_PING_TIMEOUT_MS));
	}
}

function ensureEnvListeners() {
	if (envListening) return;
	if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
	if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
	envListening = true;
}

function removeEnvListeners() {
	if (!envListening) return;
	if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
	if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
	envListening = false;
}

function teardown() {
	socketGen++;
	clearTimers();
	const old = ws;
	ws = null;
	state = 'idle';
	reconnectAttempts = 0;
	detachSocket(old);
	removeEnvListeners();
}

function sendPing(gen: number, timeoutMs = pingTimeoutMs) {
	if (gen !== socketGen || (state !== 'eio_open' && state !== 'ready')) return;
	if (pingTimer !== undefined) {
		clearTimeout(pingTimer);
		pingTimer = undefined;
	}
	sendRaw('2');
	if (pongTimer !== undefined) clearTimeout(pongTimer);
	pongTimer = setTimeout(() => {
		pongTimer = undefined;
		handleDisconnect(gen);
	}, timeoutMs);
}

function schedulePing(gen: number) {
	if (gen !== socketGen || (state !== 'eio_open' && state !== 'ready')) return;
	if (pingTimer !== undefined) clearTimeout(pingTimer);
	pingTimer = setTimeout(() => {
		pingTimer = undefined;
		sendPing(gen);
	}, pingIntervalMs);
}

function scheduleReconnect() {
	if (channels.size === 0 || reconnectTimer !== undefined) return;
	// Не крутим таймеры в офлайне и фоновой вкладке — восстановимся сразу по online / visibilitychange
	if (isOffline() || isHidden()) return;

	const base = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * Math.pow(2, reconnectAttempts));
	reconnectAttempts++;
	const delay = Math.round(base * (0.75 + Math.random() * 0.5));
	// Вызывается после handleDisconnect, который уже поднял поколение
	const gen = socketGen;

	reconnectTimer = setTimeout(() => {
		reconnectTimer = undefined;
		if (gen !== socketGen || channels.size === 0) return;
		if (isOffline() || isHidden()) return;
		connect();
	}, delay);
}

function handleDisconnect(gen: number) {
	// Поднятое поколение делает повторные вызовы для этого сокета (error + close, таймеры) пустыми
	if (gen !== socketGen) return;
	socketGen++;

	if (connectTimer !== undefined) { clearTimeout(connectTimer); connectTimer = undefined; }
	if (pingTimer !== undefined) { clearTimeout(pingTimer); pingTimer = undefined; }
	if (pongTimer !== undefined) { clearTimeout(pongTimer); pongTimer = undefined; }

	const old = ws;
	ws = null;
	detachSocket(old);

	if (channels.size === 0) {
		state = 'idle';
		reconnectAttempts = 0;
		removeEnvListeners();
		return;
	}

	state = 'closed';
	scheduleReconnect();
}

function notifyListenerReady(channel: string, listener: ChannelListener) {
	const currentSet = channels.get(channel);
	if (!currentSet?.has(listener)) return;
	const reconnected = listener.syncedOnce;
	listener.syncedOnce = true;
	try {
		listener.onReady?.({ reconnected });
	} catch (err) {
		console.warn('[realtime] Ошибка обработчика готовности канала:', err);
	}
}

function handleMessage(gen: number, raw: unknown) {
	if (gen !== socketGen || typeof raw !== 'string') return;

	// Engine.IO handshake 0{...}: читаем интервалы heartbeat, sid никогда не логируем
	if (raw.startsWith('0')) {
		let info: Record<string, unknown> = {};
		try {
			const parsed = JSON.parse(raw.slice(1));
			if (parsed && typeof parsed === 'object') info = parsed as Record<string, unknown>;
		} catch {
			handleDisconnect(gen);
			return;
		}
		pingIntervalMs = typeof info.pingInterval === 'number' && Number.isFinite(info.pingInterval) && info.pingInterval > 0
			? info.pingInterval
			: DEFAULT_PING_INTERVAL_MS;
		pingTimeoutMs = typeof info.pingTimeout === 'number' && Number.isFinite(info.pingTimeout) && info.pingTimeout > 0
			? info.pingTimeout
			: DEFAULT_PING_TIMEOUT_MS;
		state = 'eio_open';
		schedulePing(gen);
		return;
	}

	// Серверный ping (на случай если сервер инициирует)
	if (raw === '2') {
		sendRaw('3');
		return;
	}

	// Ответ pong на наш клиентский ping
	if (raw === '3') {
		if (pongTimer !== undefined) {
			clearTimeout(pongTimer);
			pongTimer = undefined;
		}
		schedulePing(gen);
		return;
	}

	// Engine.IO close ('1') или Socket.IO disconnect ('41')
	if (raw === '1' || raw === '41') {
		handleDisconnect(gen);
		return;
	}

	// Socket.IO connect ('40')
	if (raw === '40' || raw.startsWith('40{')) {
		if (connectTimer !== undefined) {
			clearTimeout(connectTimer);
			connectTimer = undefined;
		}
		state = 'ready';
		reconnectAttempts = 0;

		for (const channel of channels.keys()) {
			sendPacket('subscribe', { channel });
		}

		// Собираем снимок, чтобы подписка/отписка внутри onReady не сбила обход
		const readySnapshot: Array<[string, ChannelListener[]]> = [];
		for (const [channel, set] of channels) {
			readySnapshot.push([channel, [...set]]);
		}
		for (const [channel, list] of readySnapshot) {
			for (const listener of list) notifyListenerReady(channel, listener);
		}
		return;
	}

	// Socket.IO event ('42[...]')
	if (raw.startsWith('42')) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw.slice(2));
		} catch {
			return;
		}
		if (!Array.isArray(parsed) || parsed.length < 2 || parsed[0] !== 'event') return;
		const envelope = parsed[1];
		if (!envelope || typeof envelope !== 'object') return;
		const { channel, data } = envelope as Record<string, unknown>;
		if (typeof channel !== 'string' || !data || typeof data !== 'object' || Array.isArray(data)) return;

		const listeners = channels.get(channel);
		if (!listeners || listeners.size === 0) return;

		for (const listener of [...listeners]) {
			if (!listeners.has(listener)) continue;
			try {
				listener.onEvent(data as Record<string, unknown>);
			} catch (err) {
				console.warn('[realtime] Ошибка обработчика события канала:', err);
			}
		}
	}
}

function connect() {
	if (typeof WebSocket === 'undefined' || channels.size === 0) return;
	if (state === 'connecting' || state === 'eio_open' || state === 'ready') return;

	if (reconnectTimer !== undefined) {
		clearTimeout(reconnectTimer);
		reconnectTimer = undefined;
	}

	const gen = ++socketGen;
	state = 'connecting';
	ensureEnvListeners();

	let socket: WebSocket;
	try {
		socket = new WebSocket(WS_URL);
	} catch {
		handleDisconnect(gen);
		return;
	}
	ws = socket;

	connectTimer = setTimeout(() => {
		connectTimer = undefined;
		handleDisconnect(gen);
	}, HANDSHAKE_TIMEOUT_MS);

	socket.onmessage = (event) => handleMessage(gen, event.data);
	socket.onerror = () => handleDisconnect(gen);
	socket.onclose = () => handleDisconnect(gen);
}

/**
 * Подписывается на произвольный канал WebSocket DTF (с подсчётом потребителей).
 * При отсутствии WebSocket (например, SSR/Node без мока) возвращает пустую отписку.
 */
export function subscribeChannel(
	channel: string,
	options: {
		onEvent: (data: Record<string, unknown>) => void;
		onReady?: (info: { reconnected: boolean }) => void;
	}
): () => void {
	let set = channels.get(channel);
	const isNewChannel = !set;
	if (!set) {
		set = new Set();
		channels.set(channel, set);
	}

	const listener: ChannelListener = {
		onEvent: options.onEvent,
		onReady: options.onReady,
		syncedOnce: false
	};
	set.add(listener);
	clearTimeout(idleTimer);
	idleTimer = undefined;
	ensureEnvListeners();

	if (state === 'ready') {
		if (isNewChannel) sendPacket('subscribe', { channel });
		if (options.onReady) {
			const currentGen = socketGen;
			queueMicrotask(() => {
				if (currentGen !== socketGen || state !== 'ready') return;
				notifyListenerReady(channel, listener);
			});
		} else {
			listener.syncedOnce = true;
		}
	} else if (state === 'idle') {
		connect();
	}

	let unsubscribed = false;
	return () => {
		if (unsubscribed) return;
		unsubscribed = true;

		const currentSet = channels.get(channel);
		if (!currentSet) return;
		currentSet.delete(listener);
		if (currentSet.size === 0) {
			channels.delete(channel);
			if (state === 'ready') {
				sendPacket('unsubscribe', { channel });
			}
		}
		if (channels.size === 0) {
			// Мёртвое соединение держать незачем, живое закрываем с задержкой
			if (state === 'closed' || state === 'idle') {
				teardown();
			} else {
				idleTimer = setTimeout(() => {
					idleTimer = undefined;
					if (channels.size === 0) teardown();
				}, IDLE_CLOSE_MS);
			}
		}
	};
}

/** Сразу закрывает соединение и сбрасывает реестр каналов (для тестов и явного сброса). */
export function closeRealtime() {
	channels.clear();
	teardown();
}

/** Разбор событий из современного канала комментариев `api:v2:comments-{postId}` */
export function parseCommentV2Event(postId: number, data: Record<string, unknown>): RealtimeCommentEvent | null {
	if (data.type === 'comment_created' || data.type === 'comment_edited') {
		const raw = data.comment;
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
		const item = raw as Record<string, unknown>;
		const id = Number(item.id);
		if (!Number.isInteger(id) || id <= 0) return null;
		const entry = item.entry as Record<string, unknown> | undefined;
		if (entry?.id !== undefined && Number(entry.id) !== postId) return null;

		return {
			type: data.type,
			comment: mapComment(item, postId),
			postId
		};
	}

	// Форма `{type, data:{commentId, amount}}` известна только из бандла оригинального DTF, вживую событие не наблюдалось
	if (data.type === 'change_donation_amount_for_comment') {
		const nested = data.data;
		if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return null;
		const payload = nested as Record<string, unknown>;
		const commentId = Number(payload.commentId);
		const amount = Number(payload.amount);
		if (!Number.isInteger(commentId) || commentId <= 0 || !Number.isFinite(amount) || amount < 0) return null;
		return { type: 'change_donation_amount_for_comment', postId, commentId, amount };
	}

	return null;
}

/** Разбор событий оценок из v1-канала `api:comments-{postId}` (v1 creation/edit здесь игнорируются) */
export function parseCommentVoteEvent(postId: number, data: Record<string, unknown>): RealtimeCommentVotedEvent | null {
	if (data.type !== 'comment voted') return null;

	const contentId = Number(data.content_id);
	const commentId = Number(data.id);
	const reactionId = Number(data.reactionId);
	const fromReactionId = data.fromReactionId === undefined ? 0 : Number(data.fromReactionId);
	const reactionCount = Number(data.reactionCount);

	if (
		contentId !== postId ||
		!Number.isInteger(commentId) ||
		commentId <= 0 ||
		!Number.isInteger(reactionId) ||
		reactionId < 0 ||
		!Number.isInteger(fromReactionId) ||
		fromReactionId < 0 ||
		(reactionId === 0 && fromReactionId === 0) ||
		!Number.isFinite(reactionCount) ||
		reactionCount < 0
	) {
		return null;
	}

	const actorId = typeof data.subsite_id === 'number' && Number.isInteger(data.subsite_id) && data.subsite_id > 0
		? data.subsite_id
		: undefined;

	return {
		type: 'comment_voted',
		postId,
		commentId,
		fromReactionId,
		reactionId,
		reactionCount: Math.trunc(reactionCount),
		...(actorId !== undefined && { actorId })
	};
}

/** Разбор личного события из канала `mobile:{userHash}` */
export function parseNotificationRealtimeEvent(data: Record<string, unknown>): RealtimeNotificationEvent | null {
	if (typeof data.type !== 'number' || !Number.isInteger(data.type) || data.type <= 0) return null;
	if (typeof data.counter !== 'number' || !Number.isFinite(data.counter) || data.counter < 0) return null;
	return {
		type: data.type,
		unread: Math.trunc(data.counter)
	};
}

/** Подписка на все realtime-события комментариев поста DTF (v2 структура + v1 оценки на одном соединении) */
export function subscribeDtfComments(
	postId: number,
	onUpdate: (event: RealtimeCommentEvent) => void,
	options?: RealtimeSubscriptionOptions
): () => void {
	const unsubV2 = subscribeChannel(`api:v2:comments-${postId}`, {
		onEvent: (raw) => {
			const ev = parseCommentV2Event(postId, raw);
			if (ev) onUpdate(ev);
		},
		onReady: options?.onReady
	});
	const unsubVotes = subscribeChannel(`api:comments-${postId}`, {
		onEvent: (raw) => {
			const ev = parseCommentVoteEvent(postId, raw);
			if (ev) onUpdate(ev);
		}
	});
	return () => {
		unsubV2();
		unsubVotes();
	};
}
