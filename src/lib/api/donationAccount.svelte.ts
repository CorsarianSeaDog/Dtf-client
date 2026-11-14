import { authStorage } from '$lib/storage/auth.svelte';
import { currentUser } from './currentUser.svelte';
import { api } from './index.svelte';
import type { DonationAccount } from './types';

/** Кабинет, где теперь выводят донаты DTF */
const DONATIONS_URL = 'https://lk.cloudtips.ru';
/** Подключение донатов на сайте DTF */
const DONATIONS_SIGNUP_URL = 'https://dtf.ru/?modal=donations/registration';

// undefined — ещё не знаем, null — донаты не подключены
let account = $state.raw<DonationAccount | null>();
let loading: Promise<void> | undefined;

/** Счёт донатов вошедшего для меню и страницы аккаунта: запрашивается один раз за запуск */
export const donationAccount = {
	get value() {
		return authStorage.isAuthenticated ? account : undefined;
	},

	/** Подключены, как у DTF: счёт есть и подтверждён */
	get connected() {
		return this.value === undefined ? undefined : !!this.value?.isConfirmed;
	},

	/** Куда ведёт «Донаты»: кабинет CloudTips, а если донаты не подключены — их подключение на DTF */
	get href() {
		return this.connected === false ? DONATIONS_SIGNUP_URL : DONATIONS_URL;
	},

	/** Промис не падает: ошибка уходит в консоль */
	load(): Promise<void> {
		if (!authStorage.isAuthenticated) return Promise.resolve();
		if (loading) return loading;
		const req = api
			.getDonationAccount()
			.then((a) => {
				if (loading === req) account = a;
			})
			.catch((e) => {
				if (loading === req) loading = undefined;
				console.warn('[donationAccount] Не удалось получить счёт донатов:', e);
			});
		loading = req;
		return req;
	},

	refresh() {
		loading = undefined;
		return this.load();
	},

	clear() {
		loading = undefined;
		account = undefined;
	}
};

/** Всё, что показывает страница аккаунта: загрузить (один раз за запуск) или перечитать */
export const loadAccount = () => Promise.all([currentUser.load(), donationAccount.load()]);
export const refreshAccount = () => Promise.all([currentUser.refresh(), donationAccount.refresh()]);
