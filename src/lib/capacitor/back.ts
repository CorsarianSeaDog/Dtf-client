import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { rampUp } from '../swipe';

/*
 * Системный жест «Назад» (Android). Плагин NativeBack шлёт ход жеста, а страница по нему рисует свой переход:
 * в WebView система сама ничего не анимирует. Сторона: у левого края страница уходит вправо (1), у правого влево (-1).
 */

export type BackSide = 1 | -1;

/** Тот, кто рисует ход жеста (свайп «назад» по странице-оверлею) */
export interface BackDriver {
	/** Жест начался. `false` — рисовать нечего: закрытие, если жест дойдёт до конца, пройдёт без хода */
	start: (side: BackSide) => boolean;
	/** Палец ушёл от места касания на `distance` css-пикселей */
	move: (distance: number) => void;
	/** Жест кончился: закрыть (`true`) или вернуть на место */
	end: (commit: boolean) => void;
}

interface BackEvent {
	edge: 'left' | 'right';
	/** Положение пальца в физических пикселях окна */
	touchX: number;
}

interface NativeBackPlugin {
	setEnabled: (options: { enabled: boolean }) => Promise<void>;
	addListener(event: 'backStarted' | 'backProgressed', listener: (e: BackEvent) => void): Promise<PluginListenerHandle>;
	addListener(event: 'backCancelled' | 'backInvoked', listener: () => void): Promise<PluginListenerHandle>;
}

const NativeBack = registerPlugin<NativeBackPlugin>('NativeBack');

const drivers: BackDriver[] = [];

/** Подключить драйвер хода жеста поверх предыдущих (страница, просмотрщик, модалка). Возвращает функцию снятия */
export function pushBackDriver(next: BackDriver): () => void {
	drivers.push(next);
	return () => {
		const i = drivers.lastIndexOf(next);
		if (i >= 0) drivers.splice(i, 1);
	};
}

/** Верхний активный драйвер системного жеста «Назад» */
export function getBackDriver(): BackDriver | undefined {
	return drivers.at(-1);
}

/**
 * Обработчики событий плагина. Палец ведёт сдвиг по `touchX`, а не по `progress`: система нормирует его по своему
 * расстоянию, и страница не шла бы за пальцем. Без хода (3 кнопки, старый Android, нечего рисовать) `fallback` закрывает сразу.
 * Необязательный `schedule` схлопывает частые `progressed` в один вызов `move` на кадр, плавно разгоняет старт через `rampUp`
 * и не прыгает на неотрисованный сдвиг при `invoked` / `cancelled`.
 */
export function backHandlers(
	getDriver: () => BackDriver | undefined,
	fallback: () => void,
	pixelRatio: () => number,
	schedule?: (cb: () => void) => () => void,
	now: () => number = () => performance.now()
) {
	let live: { driver: BackDriver; side: BackSide; from: number; distance: number; ramp: 'pending' | number | undefined; cancel?: () => void } | undefined;

	function flush() {
		if (!live) return;
		live.cancel = undefined;
		if (live.ramp === 'pending') {
			if (live.distance <= 0) return;
			live.ramp = now();
		}
		let k = 1;
		if (live.ramp !== undefined) {
			k = rampUp(now() - live.ramp);
			if (k === 1) live.ramp = undefined;
			else live.cancel = schedule!(flush);
		}
		live.driver.move(live.distance * k);
	}

	return {
		started(e: BackEvent) {
			live?.cancel?.();
			const target = getDriver();
			const side = e.edge === 'right' ? -1 : 1;
			live = target?.start(side) ? { driver: target, side, from: e.touchX, distance: 0, ramp: schedule ? 'pending' : undefined } : undefined;
		},
		progressed(e: BackEvent) {
			if (!live) return;
			live.distance = Math.max(0, ((e.touchX - live.from) * live.side) / pixelRatio());
			if (!schedule) return live.driver.move(live.distance);
			live.cancel ??= schedule(flush);
		},
		cancelled() {
			if (!live) return;
			const current = live;
			live = undefined;
			current.cancel?.();
			current.driver.end(false);
		},
		invoked() {
			if (!live) return fallback();
			const current = live;
			live = undefined;
			current.cancel?.();
			current.driver.end(true);
		}
	};
}

/** Есть ли в оболочке плагин: OTA обновляет только JS, а старые оболочки получают «Назад» от @capacitor/app */
const available = () => Capacitor.isPluginAvailable('NativeBack');

export function initNativeBack(fallback: () => void) {
	if (!available()) return;
	const raf = (cb: () => void) => {
		const id = requestAnimationFrame(cb);
		return () => cancelAnimationFrame(id);
	};
	const h = backHandlers(getBackDriver, fallback, () => window.devicePixelRatio || 1, raf);
	NativeBack.addListener('backStarted', h.started);
	NativeBack.addListener('backProgressed', h.progressed);
	NativeBack.addListener('backCancelled', h.cancelled);
	NativeBack.addListener('backInvoked', h.invoked);
}

let enabled: boolean | undefined;

/** Перехватывать ли «Назад»: `false` отдаёт его системе (анимация «на главный экран») */
export function setBackEnabled(on: boolean) {
	if (enabled === on || !available()) return;
	enabled = on;
	NativeBack.setEnabled({ enabled: on }).catch(() => {
		enabled = undefined;
	});
}
