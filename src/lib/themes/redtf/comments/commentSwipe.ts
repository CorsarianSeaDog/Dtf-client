import type { Attachment } from 'svelte/attachments';
import { createTension, haptics } from '$lib/haptics';
import { ease, reducedMotion } from '$lib/motion';
import { swipe, translate } from '$lib/swipe';

/*
 * Свайп влево по комментарию, как в Telegram: комментарий едет за пальцем, справа выезжает значок ответа.
 * Дотянул до порога — отпускание выполняет действие. Пока порог пройден, палец вниз выбирает другое действие
 * из колонки (как в Telegram X): ответ стоит там, где сработал порог, остальные идут под ним.
 * Палец ведёт общий жест из `$lib/swipe`; вправо жест не наш — его забирает свайп «назад».
 */

/** Сдвиг, после которого отпускание выполняет действие */
export const ARM = 64;
/** Насколько нужно вернуть палец назад, чтобы снять готовность: дрожь у порога не щёлкает туда-обратно */
export const DISARM = 16;
/** Шаг пальца по вертикали между действиями колонки */
export const STEP = 60;
/** Запас сверх половины шага: дрожь пальца на границе не переключает действие туда-обратно */
const HYSTERESIS = 10;
/** На сколько комментарий «перескакивает» вперёд на пороге: видно, что действие готово */
const DETENT = 14;
/** Перескок с лёгким перелётом, как у Gboard */
const SNAP = 'translate 0.26s cubic-bezier(0.34, 1.56, 0.64, 1)';
/** Насколько выделение действия тянется за пальцем, px */
const NUDGE = 3;
/** Сколько длится перескок выделения на соседнее действие, мс (как переход в CSS колонки) */
const HOP = 220;

/**
 * Действие под пальцем: 0 — ответ, дальше вниз по шагу, за краями колонки — крайнее. `dy` отсчитывается от точки,
 * где сработал порог. Нынешнее действие сменяется, только когда палец ушёл от него дальше половины шага с запасом
 */
export function slotAt(dy: number, current: number, last: number): number {
	if (Math.abs(dy - current * STEP) <= STEP / 2 + HYSTERESIS) return current;
	return Math.min(last, Math.max(0, Math.round(dy / STEP)));
}

/**
 * Подтяжка выделения к пальцу, как в Gboard: выделение чуть едет в сторону пальца от середины своего действия
 * и мягко упирается, не доходя `NUDGE`. `dy` — как у `slotAt`
 */
export const nudgeAt = (dy: number, slot: number) => NUDGE * Math.tanh((dy - slot * STEP) / (STEP / 2));

/** Готовность с запасом: включается на пороге, а снимается, только когда палец ушёл назад на `DISARM` */
export const isArmed = (x: number, armed: boolean) => x >= (armed ? ARM - DISARM : ARM);

/** Сдвиг комментария: до порога за пальцем, дальше туго */
const pull = (x: number) => (x <= ARM ? x : ARM + (x - ARM) * 0.25);

export interface SwipeView {
	key: string;
	armed: boolean;
	slot: number;
}

export interface CommentSwipeOptions {
	enabled: () => boolean;
	/** Ключ комментария, на который можно ответить (у удалённого и скрытого фильтром кнопки ответа нет) */
	keyOf: (item: HTMLElement) => string | undefined;
	/** Сколько действий в колонке, вместе с ответом */
	count: () => number;
	/** Слой колонки действий поверх списка. Высоту колонки жест ставит ему в `--swipe-y` */
	column: () => HTMLElement | undefined;
	/** Жест начался, порог пройден или сменилось действие; `null` — жест закончился */
	show: (view: SwipeView | null) => void;
	/** Палец отпущен на действии */
	run: (key: string, slot: number) => void;
}

export function commentSwipe(options: CommentSwipeOptions): Attachment<HTMLElement> {
	let view: SwipeView | undefined;
	let item: HTMLElement | undefined;
	let content: HTMLElement | undefined;
	let column: HTMLElement | undefined;
	let startY = 0;
	// Верх слоя колонки в окне. После первого порога колонка встаёт на место до конца жеста (`armY` — сдвиг пальца
	// в этот момент): уход пальца назад и снова к порогу не таскает её за пальцем и не сбивает выбор действия
	let layerTop = 0;
	let armY: number | undefined;
	let hop: ReturnType<typeof setTimeout> | undefined;
	const tension = createTension('click');

	function render(x: number) {
		if (!content || !column) return;
		content.style.transform = translate(-pull(x));
		column.style.setProperty('--swipe', `${Math.min(1, x / ARM)}`);
	}

	return swipe({
		start(e) {
			const target = e.target as Element;
			const node = target.closest<HTMLElement>('.comment-item');
			if (!options.enabled() || !node || target.closest('input, textarea, select, [contenteditable], .comment-editor-container')) return false;
			const key = options.keyOf(node);
			if (!key) return false;
			item = node;
			startY = e.clientY;
			armY = undefined;
			view = { key, armed: false, slot: 0 };
			return true;
		},
		begin(dx) {
			content = item?.querySelector<HTMLElement>(':scope > .comment-item__content') ?? undefined;
			column = options.column();
			if (dx > 0 || !item || !content || !column || !view) return false;
			// У виртуальных комментариев отрисовка обрезана по их рамке: уехавший влево аватар пропал бы
			item.style.contentVisibility = 'visible';
			content.style.willChange = 'transform';
			content.style.transition = reducedMotion() ? '' : SNAP;
			layerTop = column.getBoundingClientRect().top;
			column.style.setProperty('--swipe-y', `${startY - layerTop}px`);
			tension.reset();
			options.show(view);
			return true;
		},
		move(offset, dy) {
			const x = Math.max(0, -offset);
			render(x);
			if (!view || !column || !content) return;
			const armed = isArmed(x, view.armed);
			if (!armed && !view.armed) tension.move(x, ARM, false);
			// До первого порога колонка идёт за пальцем по вертикали, потом стоит, и палец выбирает в ней действие
			if (armY === undefined && !armed) column.style.setProperty('--swipe-y', `${startY + dy - layerTop}px`);
			if (armed && armY === undefined) armY = dy;
			// Пока готовность снята, выбранное действие помнится: вернулся к порогу — оно же
			const slot = armed && armY !== undefined ? slotAt(dy - armY, view.slot, options.count() - 1) : view.slot;
			const changed = armed !== view.armed || slot !== view.slot;
			// Смена действия: на время перескока подтяжка снимается с той же кривой, что и сам перескок (переход в CSS по `data-snap`)
			if (changed) {
				column.dataset.snap = '';
				clearTimeout(hop);
				hop = setTimeout(() => delete column?.dataset.snap, HOP);
			}
			column.style.setProperty('--nudge', `${armed && armY !== undefined ? nudgeAt(dy - armY, slot) : 0}px`);
			if (!changed) return;
			if (armed !== view.armed) {
				content.style.translate = armed ? `${-DETENT}px 0` : '';
				// Отдача — когда действие готово (чёткий щелчок) и когда готовность снята (мягкий)
				if (armed) {
					haptics.selectionStart();
					haptics.click();
				} else {
					haptics.soft();
					haptics.selectionEnd();
				}
			} else haptics.selectionChanged();
			view = { ...view, armed, slot };
			options.show(view);
		},
		end(offset, v) {
			haptics.selectionEnd();
			const shown = view;
			const node = item;
			const moved = content;
			const icons = column;
			if (!shown || !node || !moved || !icons) return;
			if (v !== null && shown.armed) options.run(shown.key, shown.slot);
			const x = Math.max(0, -offset);
			const detent = shown.armed ? DETENT : 0;
			let settled = false;
			let animations: Animation[] = [];
			const done = () => {
				if (settled) return;
				settled = true;
				animations.forEach((anim) => anim.cancel());
				node.style.contentVisibility = moved.style.transform = moved.style.translate = moved.style.transition = moved.style.willChange = '';
				icons.style.removeProperty('--swipe');
				icons.style.removeProperty('--swipe-y');
				icons.style.removeProperty('--nudge');
				clearTimeout(hop);
				delete icons.dataset.snap;
				view = item = content = column = undefined;
				armY = undefined;
				options.show(null);
			};
			if (reducedMotion() || x < 1) return done();
			// Перескок входит в общий доезд: снимаем его без своей анимации
			moved.style.transition = moved.style.translate = '';
			const timing = { duration: 240, easing: ease.swipe, fill: 'forwards' } as const;
			animations = [
				moved.animate([{ transform: translate(-pull(x) - detent) }, { transform: translate(0) }], timing),
				icons.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, duration: 180 })
			];
			// Отменённая анимация (новое касание уже завершило доезд) отклоняет промис: там делать нечего
			animations[0].finished.then(done, () => {});
			return done;
		}
	});
}
