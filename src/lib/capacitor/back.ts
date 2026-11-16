import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

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

let driver: BackDriver | undefined;

/** Подключить того, кто рисует ход жеста; `undefined` отключает */
export function setBackDriver(next: BackDriver | undefined) {
	driver = next;
}

/**
 * Обработчики событий плагина. Палец ведёт сдвиг по `touchX`, а не по `progress`: система нормирует его по своему
 * расстоянию, и страница не шла бы за пальцем. Без хода (3 кнопки, старый Android, нечего рисовать) `fallback` закрывает сразу.
 */
export function backHandlers(getDriver: () => BackDriver | undefined, fallback: () => void, pixelRatio: () => number) {
	let live: { driver: BackDriver; side: BackSide; from: number } | undefined;
	return {
		started(e: BackEvent) {
			const target = getDriver();
			const side = e.edge === 'right' ? -1 : 1;
			live = target?.start(side) ? { driver: target, side, from: e.touchX } : undefined;
		},
		progressed(e: BackEvent) {
			if (live) live.driver.move(Math.max(0, ((e.touchX - live.from) * live.side) / pixelRatio()));
		},
		cancelled() {
			live?.driver.end(false);
			live = undefined;
		},
		invoked() {
			if (live) live.driver.end(true);
			else fallback();
			live = undefined;
		}
	};
}

/** Есть ли в оболочке плагин: OTA обновляет только JS, а старые оболочки получают «Назад» от @capacitor/app */
const available = () => Capacitor.isPluginAvailable('NativeBack');

export function initNativeBack(fallback: () => void) {
	if (!available()) return;
	const h = backHandlers(() => driver, fallback, () => window.devicePixelRatio || 1);
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
