/*
 * Ограничение частоты запросов поиска в веб-версии: не более 5 запросов в минуту и не более 30 запросов в час.
 * Хранится в localStorage (слой cache).
 */
import { persistedState } from './persisted.svelte';
import { isNative } from '$lib/capacitor';
import { ApiError } from '$lib/api/errors';

export const SEARCH_RATE_LIMITS = [
	{ max: 5, windowMs: 60 * 1000, label: '5 запросов в минуту' },
	{ max: 30, windowMs: 60 * 60 * 1000, label: '30 запросов в час' }
] as const;

const MAX_WINDOW_MS = Math.max(...SEARCH_RATE_LIMITS.map((r) => r.windowMs));

export const searchRateLimit = persistedState<number[]>(
	'redtf:cache:search-rate-limit',
	[]
);

function formatWait(remainingMs: number): string {
	const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
	if (remainingSec < 60) return `${remainingSec} сек.`;
	return `${Math.ceil(remainingSec / 60)} мин.`;
}

/**
 * Проверяет клиентский лимит поиска.
 * В нативном приложении (Capacitor) и в локальной разработке лимит не применяется (если не задан forceCheck).
 * Если лимит превышен, выбрасывает ApiError со статусом 429.
 */
export function checkAndConsumeSearchLimit(options?: { now?: number; forceCheck?: boolean }): void {
	if (!options?.forceCheck && (isNative() || import.meta.env.DEV)) {
		return;
	}

	const now = options?.now ?? Date.now();
	const active = (searchRateLimit.value || []).filter(
		(t) => typeof t === 'number' && now - t < MAX_WINDOW_MS
	);

	let blockedBy: { remainingMs: number; label: string } | null = null;
	for (const rule of SEARCH_RATE_LIMITS) {
		const inWindow = active.filter((t) => now - t < rule.windowMs);
		if (inWindow.length >= rule.max) {
			const remainingMs = Math.min(...inWindow) + rule.windowMs - now;
			if (!blockedBy || remainingMs > blockedBy.remainingMs) {
				blockedBy = { remainingMs, label: rule.label };
			}
		}
	}

	if (blockedBy) {
		throw new ApiError(
			`Лимит поиска в веб-версии исчерпан (не более ${blockedBy.label}). Попробуйте через ${formatWait(blockedBy.remainingMs)} или воспользуйтесь приложением reDTF, там лимитов поиска нет.`,
			{ status: 429 }
		);
	}

	searchRateLimit.value = [...active, now];
}
