/**
 * Отступ снизу, на который нужно поднять панель, чтобы она стояла над экранной клавиатурой.
 * Клавиатура сужает видимую область (`visualViewport`), а закреплённые элементы остаются у края окна:
 * отступ = высота окна − высота видимой области − её смещение сверху (при прокрутке страницы над клавиатурой).
 */
export function keyboardOffset(innerHeight: number, viewportHeight: number, viewportOffsetTop: number, gap = 0): number {
	const offset = Math.max(0, Math.round(innerHeight - viewportHeight - viewportOffsetTop));
	// gap — отладочная поправка на клавиатуру, которую браузер занизил; без клавиатуры её нет
	return offset > 0 ? offset + gap : 0;
}
