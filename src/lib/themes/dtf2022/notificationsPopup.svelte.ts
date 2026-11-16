let open = $state(false);

/** Панель уведомлений одна на шапку и мобильную панель: открыта в одной — открыта в обеих. Клик внутри [data-notifications] её не закрывает */
export const notificationsPopup = {
	get open() {
		return open;
	},

	/** Список при открытии грузит сама панель (`trackVisible`) */
	set(value: boolean) {
		open = value;
	},

	toggle() {
		this.set(!open);
	}
};
