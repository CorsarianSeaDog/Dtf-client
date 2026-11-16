import { ApiError, ProxyError } from './errors';
import { authStorage } from '$lib/storage/auth.svelte';

export type ErrorKind =
	| 'network_error'
	| 'dtf_down'
	| 'offline'
	| 'rate_limit'
	| 'auth_error'
	| 'cors_proxy'
	| 'unknown_error';

export interface ErrorTechnicalDetails {
	rawMessage: string;
	url?: string;
	status?: number;
	timestamp: string;
}

export interface ErrorAnalysis {
	kind: ErrorKind;
	badge: string;
	title: string;
	subtitle: string;
	description: string;
	suggestions: string[];
	technicalDetails: ErrorTechnicalDetails;
}

/**
 * Извлекает сырое сообщение из ошибки любого типа.
 */
function getRawMessage(error: unknown): string {
	if (error instanceof ApiError && error.rawMessage) {
		return error.rawMessage;
	}
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	if (error && typeof error === 'object' && 'message' in error) {
		return String((error as { message: unknown }).message);
	}
	return 'Неизвестная ошибка';
}

/**
 * Пытается найти HTTP-код статуса в ошибке или её сообщении.
 */
function extractStatus(error: unknown, contextStatus?: number): number | undefined {
	if (contextStatus) return contextStatus;
	if (error instanceof ApiError && error.status) return error.status;
	if (error && typeof error === 'object' && 'status' in error && typeof (error as any).status === 'number') {
		return (error as any).status;
	}

	const raw = getRawMessage(error);
	const match = raw.match(/(?:статус|код|status|ошибка(?:\s+api)?[:\s]+)\s*(\d{3})\b/i) || raw.match(/\b(4\d{2}|5\d{2})\b/);
	if (match) {
		const parsed = parseInt(match[1], 10);
		if (parsed >= 400 && parsed <= 599) return parsed;
	}
	return undefined;
}

/**
 * Извлекает URL запроса.
 */
function extractUrl(error: unknown, contextUrl?: string): string | undefined {
	if (contextUrl) return contextUrl;
	if (error instanceof ApiError && error.url) return error.url;
	if (error && typeof error === 'object' && 'url' in error && typeof (error as any).url === 'string') {
		return (error as any).url;
	}
	return undefined;
}

/**
 * Анализирует ошибку запроса и возвращает структурированную информацию и рекомендации.
 */
export function analyzeError(
	error: unknown,
	context?: { url?: string; status?: number }
): ErrorAnalysis {
	const rawMessage = getRawMessage(error);
	const status = extractStatus(error, context?.status);
	const url = extractUrl(error, context?.url) || 'https://api.dtf.ru';

	const technicalDetails: ErrorTechnicalDetails = {
		rawMessage,
		url,
		status,
		timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
	};

	const lower = rawMessage.toLowerCase();
	const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

	// 1. Офлайн (нет интернета на устройстве)
	if (isOffline || lower.includes('offline') || lower.includes('err_internet_disconnected') || lower.includes('сеть недоступна')) {
		return {
			kind: 'offline',
			badge: 'Офлайн',
			title: 'Нет подключения к интернету',
			subtitle: 'Устройство не в сети',
			description: 'Браузер сообщает, что связи с интернетом нет.',
			suggestions: [
				'Включите Wi-Fi или мобильные данные.',
				'Проверьте, не включён ли режим «В самолёте».',
				'Когда связь вернётся, нажмите «Повторить».'
			],
			technicalDetails
		};
	}

	// 2. Лимит запросов (HTTP 429)
	if (status === 429 || lower.includes('429') || lower.includes('too many requests') || lower.includes('слишком много запросов')) {
		return {
			kind: 'rate_limit',
			badge: 'Лимит (429)',
			title: 'Слишком много запросов',
			subtitle: 'DTF временно ограничил запросы',
			description: 'С вашего адреса идёт слишком много запросов, и DTF притормозил их.',
			suggestions: [
				'Подождите минуту-две и повторите.',
				'На общем Wi-Fi или VPN попробуйте сменить сеть или сервер.'
			],
			technicalDetails
		};
	}

	// 3. Серверы DTF лежат (5xx: 500, 502 Bad Gateway, 503, 504, 520-526 Cloudflare)
	const is5xx = status !== undefined && status >= 500 && status <= 599;
	const isServerDownText =
		lower.includes('bad gateway') ||
		lower.includes('service unavailable') ||
		lower.includes('gateway timeout') ||
		lower.includes('сервер dtf временно недоступен') ||
		lower.includes('web server is down') ||
		/\b(500|502|503|504|520|521|522|523|524|525|526)\b/.test(lower);

	if (is5xx || isServerDownText) {
		const codeText = status ? ` (код ${status})` : '';
		return {
			kind: 'dtf_down',
			badge: `Сбой DTF${codeText}`,
			title: 'Серверы DTF временно недоступны',
			subtitle: status ? `Сервер DTF ответил ошибкой ${status}` : 'Сбой на стороне DTF',
			description: 'DTF или его защита от перегрузок не отвечает. Это проблема сайта, а не вашего устройства.',
			suggestions: [
				'Подождите несколько минут: такие сбои обычно проходят сами.',
				'Проверьте, открывается ли dtf.ru в соседней вкладке.'
			],
			technicalDetails
		};
	}

	// 4. CORS / блокировка прокси
	if (error instanceof ProxyError || lower.includes('cors') || lower.includes('cross-origin')) {
		return {
			kind: 'cors_proxy',
			badge: 'CORS / Прокси',
			title: 'Запрос заблокирован браузером или прокси',
			subtitle: 'Прокси недоступен или запрос запретил браузер',
			description: 'Для входа и обновления сессии нужен рабочий прокси, но он не ответил.',
			suggestions: [
				'Проверьте адрес и статус прокси в настройках.',
				'Попробуйте включить резервный прокси.'
			],
			technicalDetails
		};
	}

	// 5. Ошибка авторизации (401 / 403)
	if (status === 401 || (status === 403 && !lower.includes('cloudflare'))) {
		const hasSavedRefresh = Boolean(authStorage?.session?.refreshToken);
		return {
			kind: 'auth_error',
			badge: `Доступ (${status})`,
			title: 'Ошибка авторизации',
			subtitle: hasSavedRefresh ? 'Не удалось обновить сессию' : 'Сессия истекла или нет доступа',
			description: hasSavedRefresh
				? 'DTF отклонил запрос. Сессия сохранена, но обновить её через прокси не вышло.'
				: 'DTF отклонил запрос: вы не вошли или у вас нет прав на этот раздел.',
			suggestions: hasSavedRefresh
				? ['Проверьте прокси в настройках.', '«Популярное» и «Свежее» открываются без входа.', 'Войдите заново.']
				: ['Войдите в аккаунт заново.', '«Популярное» и «Свежее» открываются без входа.'],
			technicalDetails
		};
	}

	// 6. Сетевая ошибка (обрыв соединения, Failed to fetch, NetworkError, DNS, VPN, сбой маршрутизации)
	const isFetchFailure =
		lower.includes('networkerror') ||
		lower.includes('failed to fetch') ||
		lower.includes('load failed') ||
		lower.includes('connection was lost') ||
		lower.includes('err_name_not_resolved') ||
		lower.includes('ns_error_net_reset') ||
		lower.includes('err_connection_reset') ||
		lower.includes('econnrefused') ||
		lower.includes('сетевая ошибка');

	if (isFetchFailure) {
		return {
			kind: 'network_error',
			badge: 'Ошибка сети',
			title: 'Не удалось связаться с сервером',
			subtitle: 'Нет ответа от api.dtf.ru',
			description: 'Запрос оборвался, не дойдя до ответа. Обычно виноваты сеть, VPN или блокировщик, реже — сбой у самого DTF.',
			suggestions: [
				'Подождите минуту и повторите: у DTF бывают короткие сбои.',
				'Отключите VPN или сторонний DNS: часть из них не пускает на домены .ru.',
				'Проверьте, открывается ли dtf.ru в соседней вкладке.',
				'Отключите блокировщик рекламы для сайта или включите прокси в настройках.'
			],
			technicalDetails
		};
	}

	// 7. Прочие непредвиденные ошибки
	return {
		kind: 'unknown_error',
		badge: 'Ошибка',
		title: 'Произошла ошибка',
		subtitle: rawMessage.replace(/^Сетевая ошибка:\s*/, ''),
		description: 'Не удалось завершить операцию.',
		suggestions: ['Нажмите «Повторить».', 'Если не помогло, обновите страницу.'],
		technicalDetails
	};
}
