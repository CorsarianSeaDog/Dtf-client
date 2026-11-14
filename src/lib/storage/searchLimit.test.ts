import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
	const data: Record<string, string> = {};
	Object.defineProperty(globalThis, 'localStorage', {
		value: {
			getItem: (key: string) => data[key] ?? null,
			setItem: (key: string, value: string) => {
				data[key] = String(value);
			},
			removeItem: (key: string) => {
				delete data[key];
			},
			clear: () => {
				for (const key in data) delete data[key];
			}
		},
		writable: true
	});
});

import {
	checkAndConsumeSearchLimit,
	searchRateLimit,
	SEARCH_RATE_LIMITS
} from './searchLimit.svelte';
import { ApiError } from '$lib/api/errors';

const [MINUTE_RULE, HOUR_RULE] = SEARCH_RATE_LIMITS;

describe('search rate limit', () => {
	beforeEach(() => {
		localStorage.clear();
		searchRateLimit.value = [];
	});

	it('пропускает до 5 запросов в минуту', () => {
		const baseTime = 1_000_000_000;
		for (let i = 0; i < MINUTE_RULE.max; i++) {
			expect(() =>
				checkAndConsumeSearchLimit({ now: baseTime + i * 1000, forceCheck: true })
			).not.toThrow();
		}
		expect(searchRateLimit.value).toHaveLength(5);
	});

	it('выбрасывает ApiError со статусом 429 на 6-й запрос за минуту и разрешает после истечения минуты', () => {
		const baseTime = 1_000_000_000;
		for (let i = 0; i < MINUTE_RULE.max; i++) {
			checkAndConsumeSearchLimit({ now: baseTime + i * 1000, forceCheck: true });
		}

		try {
			checkAndConsumeSearchLimit({ now: baseTime + 5000, forceCheck: true });
			expect.unreachable('Должна была выброситься ошибка');
		} catch (e) {
			expect(e).toBeInstanceOf(ApiError);
			const err = e as ApiError;
			expect(err.status).toBe(429);
			expect(err.message).toContain('Лимит поиска в веб-версии исчерпан');
			expect(err.message).toContain('не более 5 запросов в минуту');
		}

		// Спустя минуту после первого запроса освобождается слот
		expect(() =>
			checkAndConsumeSearchLimit({ now: baseTime + MINUTE_RULE.windowMs + 1000, forceCheck: true })
		).not.toThrow();
	});

	it('ограничивает до 30 запросов в час и разрешает новые после истечения часа', () => {
		const baseTime = 1_000_000_000;
		// 6 серий по 5 запросов с шагом 2 минуты = 30 запросов за 10 минут
		for (let batch = 0; batch < HOUR_RULE.max / MINUTE_RULE.max; batch++) {
			for (let i = 0; i < MINUTE_RULE.max; i++) {
				checkAndConsumeSearchLimit({
					now: baseTime + batch * 2 * 60_000 + i * 1000,
					forceCheck: true
				});
			}
		}
		expect(searchRateLimit.value).toHaveLength(30);

		// 31-й запрос спустя 15 минут блокируется часовым лимитом
		try {
			checkAndConsumeSearchLimit({ now: baseTime + 15 * 60_000, forceCheck: true });
			expect.unreachable('Должна была выброситься ошибка');
		} catch (e) {
			expect(e).toBeInstanceOf(ApiError);
			const err = e as ApiError;
			expect(err.status).toBe(429);
			expect(err.message).toContain('не более 30 запросов в час');
		}

		// Спустя час после последней серии все старые записи очищаются
		const nextTime = baseTime + HOUR_RULE.windowMs + 12 * 60_000;
		expect(() =>
			checkAndConsumeSearchLimit({ now: nextTime, forceCheck: true })
		).not.toThrow();

		expect(searchRateLimit.value).toHaveLength(1);
		expect(searchRateLimit.value[0]).toBe(nextTime);
	});
});
