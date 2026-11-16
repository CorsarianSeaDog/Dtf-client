import { untrack } from 'svelte';
import { persistedState } from './persisted.svelte';
import type { Session } from '$lib/api/types';

const sessionState = persistedState<Session | null>('redtf:secrets:dtf-session', null);
let generation = $state(0);

/** Сессия DTF. Слой secrets: не попадает в экспорт настроек. */
export const authStorage = {
	get session() { return sessionState.value; },
	set session(v) {
		const prev = untrack(() => sessionState.value);
		if (prev !== v) generation++;
		sessionState.value = v;
	},
	get generation() { return generation; },
	get dtfToken() { return sessionState.value?.accessToken || ''; },
	get isAuthenticated() { return !!sessionState.value?.accessToken; },
	/** Обновляет токены текущей сессии без смены поколения (refresh и сброс протухшего accessToken) */
	updateTokens(v: Session) { sessionState.value = v; },
	logout() {
		generation++;
		sessionState.value = null;
	}
};
