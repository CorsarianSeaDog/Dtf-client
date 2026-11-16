import { untrack } from 'svelte';
import { authStorage } from '$lib/storage/auth.svelte';
import { settings, getEnabledProxies, type ProxyItem } from '$lib/storage/settings.svelte';
import { checkAndConsumeSearchLimit } from '$lib/storage/searchLimit.svelte';
import { isNative } from '$lib/capacitor';
import { CapacitorHttp } from '@capacitor/core';
import { ApiError, ProxyError } from '../../errors';
import type { UploadOptions } from '../../types';

/** Адреса и версии API DTF */
export const API_URL = 'https://api.dtf.ru/v2.31';
export const COMMENTS_API_URL = 'https://api.dtf.ru/v2.10';
export const AUTH_URL = 'https://api.dtf.ru/v3.4';
export const UPLOAD_URL = 'https://upload.dtf.ru/v2.8';

/** Адрес API другой версии: у каждого метода DTF своя (`apiV('2.4')` для `comment/add`) */
export const apiV = (version: string) => `https://api.dtf.ru/v${version}`;

/** Для методов, которые работают только после входа */
export function requireAuth() {
	if (!authStorage.dtfToken) {
		throw new ApiError('Необходима авторизация', { status: 401 });
	}
}

/**
 * Выполняет запрос через включённые прокси с последовательным перебором при сбоях (failover).
 * Если первый прокси возвращает 5xx, 429, сетевую ошибку или блокировку WAF, пробуем следующий.
 */
export async function fetchWithProxyFailover(
	path: string,
	createInit: () => RequestInit
): Promise<{ response: Response; proxy: ProxyItem }> {
	const enabled = getEnabledProxies();
	if (enabled.length === 0) {
		throw new ProxyError('Нет активных прокси. Включите хотя бы один прокси в настройках.');
	}

	const errors: string[] = [];
	const cleanPath = path.startsWith('/') ? path : `/${path}`;

	for (const proxy of enabled) {
		const base = proxy.url.replace(/\/+$/, '');
		const targetUrl = `${base}${cleanPath}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000);

		try {
			const init = createInit();
			const signal = init.signal && typeof AbortSignal.any === 'function'
				? AbortSignal.any([init.signal, controller.signal])
				: controller.signal;
			const res = await fetch(targetUrl, { ...init, signal });
			clearTimeout(timeoutId);

			// Ошибки сервера прокси или превышение лимитов
			if (res.status >= 500 || res.status === 429) {
				errors.push(`${proxy.name}: ошибка сервера ${res.status}`);
				continue;
			}

			// Проверка на HTML-блокировку (WAF Cloudflare/Valtown вместо JSON от DTF)
			const contentType = res.headers.get('content-type') || '';
			if ((res.status === 403 || res.status === 404) && !contentType.includes('application/json')) {
				errors.push(`${proxy.name}: блокировка или неверный адрес (${res.status})`);
				continue;
			}

			return { response: res, proxy };
		} catch (err: unknown) {
			clearTimeout(timeoutId);
			const msg =
				err instanceof Error
					? err.name === 'AbortError'
						? 'Таймаут (10с)'
						: err.message
					: 'Ошибка сети';
			errors.push(`${proxy.name}: ${msg}`);
			continue;
		}
	}

	throw new ProxyError(`Все доступные прокси (${enabled.length}) не ответили:\n${errors.map((e) => `• ${e}`).join('\n')}`);
}

let refreshPromise: Promise<boolean> | null = null;
let refreshPromiseGen = -1;
let lastRefreshFailedAt = 0;
let lastRefreshFailedGen = -1;
const REFRESH_COOLDOWN_MS = 10000;

/** Сбросить кулдаун сбоя обновления (например, при явном повторе пользователем) */
export function resetRefreshCooldown() {
	lastRefreshFailedAt = 0;
	lastRefreshFailedGen = -1;
}

/** Обновляет access-токен по refresh-токену с перебором прокси при ошибках. */
export function refreshSession(force = false): Promise<boolean> {
	const gen = untrack(() => authStorage.generation);
	if (!force && lastRefreshFailedGen === gen && lastRefreshFailedAt && Date.now() - lastRefreshFailedAt < REFRESH_COOLDOWN_MS) {
		return Promise.resolve(false);
	}
	if (refreshPromise && refreshPromiseGen === gen) return refreshPromise;

	refreshPromiseGen = gen;
	const pending = doRefreshSession(gen)
		.then((success) => {
			if (untrack(() => authStorage.generation) === gen) {
				lastRefreshFailedAt = success ? 0 : Date.now();
				lastRefreshFailedGen = success ? -1 : gen;
			}
			return success;
		})
		.catch(() => {
			if (untrack(() => authStorage.generation) === gen) {
				lastRefreshFailedAt = Date.now();
				lastRefreshFailedGen = gen;
			}
			return false;
		})
		.finally(() => {
			if (refreshPromise === pending) {
				refreshPromise = null;
				refreshPromiseGen = -1;
			}
		});
	refreshPromise = pending;
	return pending;
}

async function refreshSessionNative(
	session: NonNullable<typeof authStorage.session>,
	gen: number
): Promise<boolean> {
	try {
		const res = await CapacitorHttp.post({
			url: `${AUTH_URL}/auth/refresh`,
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			data: new URLSearchParams({ token: session.refreshToken }).toString(),
			connectTimeout: 10000,
			readTimeout: 15000
		});

		if (res.status < 200 || res.status >= 300) return false;

		const headers = res.headers || {};
		const getHeader = (name: string) => {
			const lower = name.toLowerCase();
			const entry = Object.entries(headers).find(([k]) => k.toLowerCase() === lower);
			return entry?.[1];
		};

		return applyRefreshedSession(session, gen, parseJsonResponse(res.data), getHeader);
	} catch {
		return false;
	}
}

/** Безопасный парсинг JSON из тела ответа или строки */
export function parseJsonResponse(data: unknown): any {
	if (typeof data !== 'string') return data || {};
	try {
		return JSON.parse(data);
	} catch {
		return {};
	}
}

function applyRefreshedSession(
	session: NonNullable<typeof authStorage.session>,
	gen: number,
	data: any,
	getHeader: (name: string) => string | null | undefined
): boolean {
	// Защита от гонки: пока шёл запрос refresh, пользователь мог выйти или переключить аккаунт
	const current = untrack(() => authStorage.session);
	if (untrack(() => authStorage.generation) !== gen || !current || current.refreshToken !== session.refreshToken) {
		return false;
	}

	const sessionData = data?.data || data || {};
	const newAccessToken =
		sessionData.accessToken ||
		getHeader('x-auth-token') ||
		getHeader('jwtauthorization');
	const newRefreshToken =
		sessionData.refreshToken ||
		getHeader('x-refresh-token') ||
		session.refreshToken;

	if (!newAccessToken) return false;

	authStorage.updateTokens({
		...session,
		accessToken: String(newAccessToken).replace('Bearer ', ''),
		refreshToken: newRefreshToken,
		accessExpTimestamp: sessionData.accessExpTimestamp ?? session.accessExpTimestamp,
		refreshExpTimestamp: sessionData.refreshExpTimestamp ?? session.refreshExpTimestamp
	});
	return true;
}

async function doRefreshSession(gen: number): Promise<boolean> {
	const session = untrack(() => authStorage.session);
	if (!session || !session.refreshToken || untrack(() => authStorage.generation) !== gen) return false;

	if (isNative()) {
		return refreshSessionNative(session, gen);
	}

	const enabled = getEnabledProxies();
	if (enabled.length === 0) {
		const formData = new FormData();
		formData.append('token', session.refreshToken);
		try {
			const res = await fetch(`${AUTH_URL}/auth/refresh`, {
				method: 'POST',
				headers: { 'Accept': 'application/json' },
				body: formData
			});
			if (!res.ok) return false;
			const json = await res.json().catch(() => ({}));
			return applyRefreshedSession(session, gen, json, (k) => res.headers.get(k));
		} catch {
			return false;
		}
	}

	try {
		const { response } = await fetchWithProxyFailover('/v3.4/auth/refresh', () => {
			const formData = new FormData();
			formData.append('token', session.refreshToken);
			return {
				method: 'POST',
				headers: { 'Accept': 'application/json' },
				body: formData
			};
		});

		if (!response.ok) return false;

		const json = await response.json().catch(() => ({}));
		return applyRefreshedSession(session, gen, json, (k) => response.headers.get(k));
	} catch {
		return false;
	}
}

/**
 * Выполняет запрос с авторизацией: при 401 один раз обновляет токен и повторяет,
 * а ответы не 2xx превращает в ApiError с понятным сообщением.
 */
async function withAuthRetry(
	url: string,
	authHeader: 'x-device-token' | 'JWTAuthorization',
	send: (token: string | null) => Promise<Response>
): Promise<Response> {
	const initialGen = untrack(() => authStorage.generation);
	const sameSession = () => untrack(() => authStorage.generation) === initialGen;
	const currentToken = untrack(() => authStorage.dtfToken) || null;
	let response = await send(currentToken);

	// Если сессия сменилась (выход, другой аккаунт), чужой запрос не повторяем и токены не трогаем
	const hasToken = untrack(() => !!authStorage.dtfToken);
	const hasRefreshToken = untrack(() => !!authStorage.session?.refreshToken);

	if (response.status === 401 && sameSession() && (hasToken || hasRefreshToken)) {
		const refreshed = await refreshSession();

		if (sameSession()) {
			const nextToken = untrack(() => authStorage.dtfToken);
			if (refreshed && nextToken) {
				response = await send(nextToken);
			} else {
				// Прокси недоступен или токен устарел: сбрасываем невалидный accessToken,
				// чтобы следующие вызовы не слали мёртвый токен и не тормозили на повторных попытках.
				// refreshToken сохраняем, чтобы сессию можно было восстановить при доступности прокси.
				const session = untrack(() => authStorage.session);
				if (session && session.accessToken) {
					authStorage.updateTokens({ ...session, accessToken: '' });
				}
				response = await send(null);
			}
		}
	}

	if (!response.ok) {
		const json = await response.json().catch(() => ({}));
		const defaultMessage = response.status === 422
			? 'Ошибка 422 (возможно, действие уже выполнено)'
			: response.status >= 500 && response.status <= 599
				? `Сервер DTF временно недоступен (код ${response.status})`
				: response.status === 429
					? 'Слишком много запросов к DTF (код 429)'
					: `Ошибка API: ${response.status}`;
		const message = json.message || defaultMessage;
		throw new ApiError(message, {
			url,
			status: response.status,
			rawMessage: json.message || response.statusText || String(response.status)
		});
	}

	return response;
}

/**
 * Запрос к API DTF с токеном. При 401 один раз обновляет токен и повторяет запрос.
 * Ошибки сети и ответы не 2xx превращаются в Error с понятным сообщением.
 */
export async function fetchWithAuth(
	url: string,
	options: RequestInit = {},
	authHeader: 'x-device-token' | 'JWTAuthorization' = 'JWTAuthorization'
): Promise<Response> {
	return withAuthRetry(url, authHeader, (token) => {
		const headers = new Headers(options.headers || { 'Accept': 'application/json' });
		if (token) {
			headers.set(authHeader, authHeader === 'JWTAuthorization' ? `Bearer ${token}` : token);
		} else {
			headers.delete(authHeader);
		}
		return fetch(url, { ...options, headers }).catch((e: unknown) => {
			const raw = e instanceof Error ? e.message : 'Неизвестная ошибка';
			throw new ApiError(`Сетевая ошибка: ${raw}`, {
				url,
				rawMessage: raw,
				cause: e
			});
		});
	});
}

/**
 * Отправка FormData с прогрессом загрузки через XMLHttpRequest (с тем же 401-обновлением токена).
 * Если XHR недоступен (например, в среде тестов без DOM), падает обратно на fetchWithAuth.
 */
export async function uploadWithAuth(
	url: string,
	body: FormData,
	options: UploadOptions = {},
	authHeader: 'x-device-token' | 'JWTAuthorization' = 'JWTAuthorization'
): Promise<Response> {
	if (typeof XMLHttpRequest === 'undefined') {
		return fetchWithAuth(url, { method: 'POST', body, signal: options.signal }, authHeader);
	}

	return withAuthRetry(url, authHeader, (token) => {
		return new Promise<Response>((resolve, reject) => {
			if (options.signal?.aborted) {
				reject(new DOMException('Aborted', 'AbortError'));
				return;
			}

			const xhr = new XMLHttpRequest();
			let lastLoaded = 0;
			let lastTotal = 0;

			const onAbort = () => xhr.abort();
			options.signal?.addEventListener('abort', onAbort, { once: true });
			const cleanup = () => options.signal?.removeEventListener('abort', onAbort);

			xhr.open('POST', url);
			xhr.setRequestHeader('Accept', 'application/json');
			if (token) {
				xhr.setRequestHeader(authHeader, authHeader === 'JWTAuthorization' ? `Bearer ${token}` : token);
			}

			options.onProgress?.({ loaded: 0, total: 0, progress: 0, processing: false });

			xhr.upload.onprogress = (e) => {
				if (!e.lengthComputable) return;
				lastLoaded = e.loaded;
				lastTotal = e.total;
				const progress = e.total > 0 ? Math.min(1, e.loaded / e.total) : 0;
				options.onProgress?.({ loaded: e.loaded, total: e.total, progress, processing: false });
			};

			xhr.upload.onload = () => {
				const total = lastTotal || lastLoaded || 1;
				options.onProgress?.({ loaded: total, total, progress: 1, processing: true });
			};

			xhr.onload = () => {
				cleanup();
				if (xhr.status === 0) {
					reject(new ApiError('Сетевая ошибка при загрузке файла', { url, rawMessage: 'Network error' }));
					return;
				}
				resolve(new Response(xhr.responseText, { status: xhr.status, statusText: xhr.statusText }));
			};

			xhr.onerror = () => {
				cleanup();
				reject(new ApiError('Сетевая ошибка при загрузке файла', { url, rawMessage: 'Network error' }));
			};

			xhr.onabort = () => {
				cleanup();
				reject(new DOMException('Aborted', 'AbortError'));
			};

			xhr.send(body);
		});
	});
}

async function fetchSearchNative(url: string): Promise<Response> {
	const headers: Record<string, string> = {
		'Accept': 'application/json'
	};
	const currentToken = untrack(() => authStorage.dtfToken);
	if (currentToken) {
		headers['JWTAuthorization'] = `Bearer ${currentToken}`;
	}

	const callNative = () =>
		CapacitorHttp.get({
			url,
			headers,
			connectTimeout: 10000,
			readTimeout: 15000
		}).catch((e: unknown) => {
			const raw = e instanceof Error ? e.message : 'Неизвестная ошибка';
			throw new ApiError(`Сетевая ошибка: ${raw}`, { url, rawMessage: raw, cause: e });
		});

	let res = await callNative();

	if (res.status === 401 && (currentToken || untrack(() => !!authStorage.session?.refreshToken))) {
		const refreshed = await refreshSession();
		const nextToken = untrack(() => authStorage.dtfToken);
		if (refreshed && nextToken) {
			headers['JWTAuthorization'] = `Bearer ${nextToken}`;
			res = await callNative();
		} else {
			delete headers['JWTAuthorization'];
			res = await callNative();
		}
	}

	const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
	const response = new Response(body, {
		status: res.status,
		headers: new Headers(res.headers as Record<string, string>)
	});

	if (!response.ok) {
		const json = parseJsonResponse(res.data);
		const defaultMessage = response.status >= 500 && response.status <= 599
			? `Сервер DTF временно недоступен (код ${response.status})`
			: `Ошибка API: ${response.status}`;
		const message = json?.message || defaultMessage;
		throw new ApiError(message, {
			url,
			status: response.status,
			rawMessage: json?.message || String(response.status)
		});
	}

	return response;
}

async function fetchSearchProxy(cleanPath: string): Promise<Response> {
	const currentToken = untrack(() => authStorage.dtfToken);
	const createHeaders = (token?: string | null) => {
		const h: Record<string, string> = { 'Accept': 'application/json' };
		if (token) h['JWTAuthorization'] = `Bearer ${token}`;
		return h;
	};

	let { response } = await fetchWithProxyFailover(cleanPath, () => ({
		method: 'GET',
		headers: createHeaders(currentToken)
	}));

	if (response.status === 401 && (currentToken || untrack(() => !!authStorage.session?.refreshToken))) {
		const refreshed = await refreshSession();
		const nextToken = untrack(() => authStorage.dtfToken);
		if (refreshed && nextToken) {
			const retried = await fetchWithProxyFailover(cleanPath, () => ({
				method: 'GET',
				headers: createHeaders(nextToken)
			}));
			response = retried.response;
		} else {
			const retried = await fetchWithProxyFailover(cleanPath, () => ({
				method: 'GET',
				headers: createHeaders(null)
			}));
			response = retried.response;
		}
	}

	if (!response.ok) {
		const json = await response.json().catch(() => ({}));
		const defaultMessage = response.status >= 500 && response.status <= 599
			? `Сервер DTF временно недоступен (код ${response.status})`
			: `Ошибка API: ${response.status}`;
		const message = json.message || defaultMessage;
		throw new ApiError(message, {
			url: cleanPath,
			status: response.status,
			rawMessage: json.message || response.statusText || String(response.status)
		});
	}

	return response;
}

/**
 * Запрос к API поиска DTF (/search/posts, /search/subsites, /search/comments).
 * - В нативном приложении (Capacitor): напрямую через CapacitorHttp (минуя ограничения CORS в WebView).
 * - В dev-режиме: напрямую через fetchWithAuth (localhost входит в белый список DTF).
 * - В веб-версии: через CORS-прокси с клиентским лимитом до 5 запросов в минуту и до 30 в час.
 */
export async function fetchSearch(path: string): Promise<Response> {
	const cleanPath = path.startsWith('/') ? path : `/${path}`;

	if (isNative()) {
		return fetchSearchNative(`https://api.dtf.ru${cleanPath}`);
	}

	if (import.meta.env.DEV && getEnabledProxies().length === 0) {
		return fetchWithAuth(`https://api.dtf.ru${cleanPath}`);
	}

	checkAndConsumeSearchLimit();
	return fetchSearchProxy(cleanPath);
}
