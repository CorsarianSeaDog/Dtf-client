import type { Attachment } from 'svelte/attachments';
import { reducedMotion } from './motion';
import { createTension, haptics } from './haptics';
import { activeTheme } from './themes/index.svelte';
import { getCurrentDevice } from './themes/types';
import { skipHide } from './components/overlays/modalMotion';

/*
 * Горизонтальный жест пальцем: общая часть свайпа лент и свайпа «назад». Ведёт палец от касания до отпускания,
 * а что двигать и куда доезжать, решает потребитель. Ось выбирает браузер: у элемента под пальцем `touch-action: pan-y`,
 * вертикальный жест он забирает в прокрутку (и шлёт pointercancel), горизонтальный отдаёт нам. Работает только от пальца.
 */

type GrabbedGlide = { offset: number; resume: () => void };

export interface SwipeHooks {
	/** Только в мобильной раскладке. Без флага жест доступен при любой ширине сенсорного экрана */
	mobile?: boolean;
	/** Можно ли начать жест с этого касания */
	start: (e: PointerEvent) => boolean;
	/** Палец пошёл по горизонтали на `dx`: `false` — жест не наш, палец остаётся браузеру */
	begin: (dx: number) => boolean;
	/** Сдвиг от точки, где жест начался (`dy` — по вертикали от касания); не чаще кадра */
	move: (offset: number, dy: number) => void;
	/**
	 * Палец отпущен со скоростью `velocity` (px/мс) или жест отменён (`null`: второй палец, система).
	 * Возвращает функцию, которая мгновенно завершает доезд: её вызовет новое касание
	 */
	end: (offset: number, velocity: number | null) => (() => void) | void;
	/**
	 * Палец коснулся посреди доезда: вернуть показанный сдвиг для жеста без нового `begin`
	 * и функцию продолжения к прежней цели, если горизонтальный жест не начался.
	 * Без хука или с `undefined` касание сразу завершает прежний доезд
	 */
	grab?: () => GrabbedGlide | undefined;
	/** Узел убран: очистить свои стили и остановить свой доезд или отменить текущий жест */
	destroy?: (dragging: boolean) => void;
}

/** Поддержка жестов темой и необязательное ограничение раскладки; используется и жестами вне `swipe` */
export const gesturesAllowed = (mobile = false) => activeTheme.gestures && (!mobile || getCurrentDevice() === 'mobile');

/** У краёв экрана жест принадлежит системе («назад» в Android и iOS) */
const EDGE = 24;
/** Сдвиг, после которого понятно, что это жест, а не касание */
const SLOP = 10;
/** Скорость броска, px/мс: бросок решает сам, без нужного расстояния */
const FLING = 0.35;
/** Доля ширины, после которой медленный жест доводится до конца */
export const DISTANCE = 0.35;
/** За сколько мс страница догоняет палец после старта жеста: без скачка скорости с нуля и без рывка после тяжёлого первого кадра */
const RAMP = 120;

/** Доля сдвига пальца, которую показываем через `elapsed` мс после первого кадра жеста: плавно от 0 до 1 */
export const rampUp = (elapsed: number) => {
	const u = Math.min(1, Math.max(0, elapsed / RAMP));
	return u * u * (3 - 2 * u);
};

/**
 * Куда доехать после отпускания: к соседу слева (-1), справа (1) или назад (0).
 * `offset` и `velocity` положительны вправо: сдвиг вправо открывает то, что слева.
 */
export function settle(offset: number, velocity: number, width: number): -1 | 0 | 1 {
	const side = Math.sign(offset);
	if (!side) return 0;
	const fling = Math.abs(velocity) > FLING ? Math.sign(velocity) : 0;
	const go = fling ? fling === side : Math.abs(offset) > width * DISTANCE;
	return go ? (-side as -1 | 1) : 0;
}

export const translate = (x: number) => `translate3d(${x}px, 0, 0)`;

/** Жёсткость пружины доезда, 1/мс: доезд почти весь укладывается в 300 мс */
const OMEGA = 0.025;

/**
 * Доезд пружиной без колебаний (критическое затухание) от `from` к `to` со скоростью пальца `velocity` (px/мс):
 * положение через `t` мс. Скорость к цели урезана до той, с которой пружина не перелетает цель
 */
export function spring(from: number, to: number, velocity: number) {
	const x0 = from - to;
	const v0 = x0 * velocity < 0 ? Math.sign(velocity) * Math.min(Math.abs(velocity), OMEGA * Math.abs(x0)) : velocity;
	return (t: number) => to + (x0 + (v0 + OMEGA * x0) * t) * Math.exp(-OMEGA * t);
}

export interface Glide {
	readonly active: boolean;
	/** Приостановить на показанном кадре и вернуть функцию продолжения к той же цели */
	pause: () => () => void;
	/** Остановить на месте, не выполняя действие */
	stop: () => void;
	/** Сразу поставить цель и выполнить действие, если доезд ещё идёт */
	finish: () => void;
}

/** Доезд в пикселях: одна пружина ведёт все элементы жеста, а касание может остановить её на показанном кадре */
export function glide(from: number, to: number, velocity: number, set: (x: number) => void, done: () => void): Glide {
	let status: 'running' | 'paused' | 'stopped' = 'running';
	let frame = 0;
	const at = spring(from, to, velocity);
	let start = performance.now();
	let elapsed = 0;
	const motion: Glide = {
		get active() { return status === 'running'; },
		pause() {
			if (!motion.active) return () => {};
			status = 'paused';
			cancelAnimationFrame(frame);
			return () => {
				if (status !== 'paused') return;
				status = 'running';
				start = performance.now() - elapsed;
				frame = requestAnimationFrame(tick);
			};
		},
		stop() {
			status = 'stopped';
			cancelAnimationFrame(frame);
		},
		finish() {
			if (!motion.active) return;
			motion.stop();
			set(to);
			done();
		}
	};
	function tick(now: number) {
		if (!motion.active) return;
		elapsed = Math.max(0, now - start);
		const x = at(elapsed);
		if (Math.abs(to - x) < 0.5) return motion.finish();
		set(x);
		if (motion.active) frame = requestAnimationFrame(tick);
	}
	if (reducedMotion() || Math.abs(to - from) < 1) motion.finish();
	else frame = requestAnimationFrame(tick);
	return motion;
}

/** Жест между двумя положениями. Прогресс — для отрисовки, расстояния и скорость пружины остаются в пикселях */
export function progressSwipe(options: {
	width: () => number;
	set: (p: number) => void;
	/** Доехали до одного из концов, в том числе после возврата */
	commit: (p: 0 | 1) => void;
}) {
	let p = 0;
	let from = 0;
	let origin: 0 | 1 = 0;
	let width = 1;
	let target: 0 | 1 = 0;
	let flight: Glide | undefined;
	const tension = createTension('click');
	const set = (next: number) => options.set(p = Math.min(1, Math.max(0, next)));

	function coast(to: 0 | 1, velocity: number) {
		flight?.stop();
		target = to;
		flight = glide(p * width, to * width, velocity, (x) => set(x / width), () => options.commit(to));
		return flight.finish;
	}

	return {
		get active() { return flight?.active ?? false; },
		begin() {
			flight?.stop();
			width = Math.max(1, options.width());
			from = p;
			origin = p >= 0.5 ? 1 : 0;
			tension.reset();
			set(p);
			return true;
		},
		move(offset: number) {
			set(from + offset / width);
			tension.move(Math.abs(p - origin) * width, width * DISTANCE);
		},
		end(_offset: number, velocity: number | null) {
			const dir = velocity === null ? 0 : settle((p - origin) * width, velocity, width);
			const to = dir ? (dir < 0 ? 1 : 0) : origin;
			if (to !== origin && !tension.armed) haptics.tick();
			return coast(to, velocity ?? 0);
		},
		grab() {
			if (!flight?.active) return;
			return { offset: (p - from) * width, resume: flight.pause() };
		},
		/** Кнопка ведёт тот же прогресс и доезд, но без тактильного порога жеста */
		animate(to: 0 | 1) {
			if (to === target && (flight?.active || p === to)) return;
			width = Math.max(1, options.width());
			from = origin = to ? 0 : 1;
			tension.reset();
			coast(to, 0);
		},
		destroy() {
			flight?.stop();
			from = origin = target = 0;
			set(0);
		}
	};
}

export function swipe(hooks: SwipeHooks): Attachment<HTMLElement> {
	return (node) => {
		let start: { x: number; y: number } | undefined;
		// Палец, который ведёт жест: события остальных не трогают жест
		let pointer = -1;
		let dragging = false;
		let offset = 0;
		let dy = 0;
		// Сдвиг, который сейчас показан потребителю: в начале жеста он отстаёт от пальца (разгон), потом совпадает с ним
		let shown = 0;
		// Разгон после старта: `'pending'` — ждём первый кадр жеста, число — время этого кадра, `undefined` — разгона нет
		let ramp: 'pending' | number | undefined;
		let samples: { x: number; t: number }[] = [];
		let frame = 0;
		// Доезд после отпускания. Новое касание подхватывает его (`grab`) или завершает сразу, чтобы жесты шли подряд
		let finish: (() => void) | void;
		// Касание подхватило доезд, но палец ещё не повёл: сдвиг, на котором доезд остановлен
		let held: GrabbedGlide | undefined;

		function render() {
			frame = 0;
			// Время берём своё, а не кадра: тяжёлый `begin` идёт до этого кадра и в разгон не входит
			const now = performance.now();
			if (ramp === 'pending') ramp = now;
			let k = 1;
			if (ramp !== undefined) {
				k = rampUp(now - ramp);
				if (k === 1) ramp = undefined;
				else frame = requestAnimationFrame(render);
			}
			shown = offset * k;
			hooks.move(shown, dy);
		}

		const stopClick = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
		};

		function velocity(now: number) {
			const recent = samples.filter((s) => now - s.t < 100);
			const first = recent[0];
			const last = recent.at(-1);
			return first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
		}

		function release(v: number | null) {
			start = undefined;
			if (!held && !dragging) return;
			// Палец мог отпустить жест над ссылкой: такой клик не должен её открыть
			node.addEventListener('click', stopClick, { capture: true, once: true });
			setTimeout(() => node.removeEventListener('click', stopClick, true), 300);
			if (held) {
				const { resume } = held;
				held = undefined;
				return resume();
			}
			cancelAnimationFrame(frame);
			// Кадр жеста ещё не был: быстрый бросок решает по реальному сдвигу, а не по нулевому
			if (ramp === 'pending') ramp = undefined;
			render();
			// Доезд идёт от показанного сдвига, а разгон на этом кончается
			cancelAnimationFrame(frame);
			frame = 0;
			ramp = undefined;
			dragging = false;
			finish = hooks.end(shown, v);
		}

		function onDown(e: PointerEvent) {
			if (e.pointerType !== 'touch') return;
			// Второй палец — это щипок, а не свайп. Палец без отпускания — потерянный прошлый жест: он отменяется
			release(null);
			if (!e.isPrimary) return;
			node.removeEventListener('click', stopClick, true);
			const target = e.target as Element | null;
			if (!gesturesAllowed(hooks.mobile) || e.clientX < EDGE || e.clientX > innerWidth - EDGE || target?.closest?.('input, textarea, select, [contenteditable]')) return;
			// Доезд мог начать другой узел (лента открыла панель) или кнопка. Проверка нужна и перед таким подхватом
			if (hooks.grab && !hooks.start(e)) return;
			held = hooks.grab?.();
			const done = finish;
			finish = undefined;
			if (!held) {
				done?.();
				if ((!hooks.grab || done) && !hooks.start(e)) return;
			}
			start = { x: e.clientX, y: e.clientY };
			pointer = e.pointerId;
			dy = 0;
			ramp = undefined;
			samples = [];
		}

		function onMove(e: PointerEvent) {
			if (!start || e.pointerId !== pointer) return;
			if (!dragging) {
				const dx = e.clientX - start.x;
				const dy = e.clientY - start.y;
				if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
				if (Math.abs(dy) >= Math.abs(dx) || (!held && !hooks.begin(dx))) return release(null);
				dragging = true;
				// Дальше палец ведёт сам узел жеста: иначе события идут элементу под пальцем, и если его пересоздали
				// (лента подменила посты свежими), Firefox шлёт их удалённому узлу и жест замирает. Раньше нельзя: клик по ссылке ушёл бы узлу
				try {
					node.setPointerCapture(e.pointerId);
				} catch {
					// Палец уже отпущен: отпускание придёт следом
				}
				// Подхваченный доезд продолжается с места, где его остановили. Новый жест ведёт сдвиг от касания, а страница
				// догоняет палец плавным разгоном (`ramp`), а не прыгает на величину порога и не едет с места со скоростью пальца
				if (held) start.x = e.clientX - held.offset;
				else ramp = 'pending';
				held = undefined;
			}
			offset = e.clientX - start.x;
			dy = e.clientY - start.y;
			samples.push({ x: e.clientX, t: e.timeStamp });
			if (samples.length > 8) samples.shift();
			frame ||= requestAnimationFrame(render);
		}

		function onUp(e: PointerEvent) {
			if (e.pointerId !== pointer) return;
			if (!dragging) return release(null);
			samples.push({ x: e.clientX, t: e.timeStamp });
			release(e.type === 'pointerup' ? velocity(e.timeStamp) : null);
		}

		// Узел потерял палец без отпускания (система забрала жест): жест не должен остаться посреди пути.
		// После обычного отпускания жест уже закончен, а потерю захвата детьми (её забрал узел) не считаем
		function onLost(e: PointerEvent) {
			if (e.target === node && e.pointerId === pointer && dragging) release(null);
		}

		node.addEventListener('pointerdown', onDown, { passive: true });
		node.addEventListener('pointermove', onMove, { passive: true });
		node.addEventListener('pointerup', onUp, { passive: true });
		node.addEventListener('pointercancel', onUp, { passive: true });
		node.addEventListener('lostpointercapture', onLost, { passive: true });
		return () => {
			if (hooks.destroy) hooks.destroy(dragging);
			else finish?.();
			held?.resume();
			cancelAnimationFrame(frame);
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('pointermove', onMove);
			node.removeEventListener('pointerup', onUp);
			node.removeEventListener('pointercancel', onUp);
			node.removeEventListener('lostpointercapture', onLost);
			node.removeEventListener('click', stopClick, true);
		};
	};
}

export interface SheetSwipeOptions {
	/** Активен ли режим нижней шторки (например, false на десктопе или пока окно заблокировано) */
	enabled?: () => boolean;
	/** Селектор зоны-ручки, откуда жест перехватывается сразу, даже если ниже есть прокрутка */
	handleSelector?: string;
	/** Закрытие шторки после доезда вниз */
	onclose: () => void;
}

function findScrollableParent(target: EventTarget | null, stopAt: HTMLElement): HTMLElement | null {
	let el = typeof Element !== 'undefined' && target instanceof Element
		? target
		: (target as Node | null)?.parentElement ?? null;
	while (el) {
		if (typeof HTMLElement !== 'undefined' && el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 1) {
			const oy = typeof getComputedStyle === 'function' ? getComputedStyle(el).overflowY : '';
			if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return el;
		}
		if (el === stopAt) break;
		el = el.parentElement;
	}
	return null;
}

/**
 * Вертикальный свайп вниз для закрытия нижней шторки (Popup на мобиле, ContextMenu в режиме sheet).
 * С ручки/шапки тянется сразу, с прокручиваемого содержимого — только когда оно прокручено до верха.
 */
export function sheetSwipe(options: SheetSwipeOptions): Attachment<HTMLElement> {
	return (sheetEl) => {
		let flight: Glide | undefined;
		let closing = false;
		let dragging = false;
		let y = 0;
		let pendingY = 0;
		let startX = 0;
		let startY = 0;
		let startOffset = 0;
		let touchId: number | null = null;
		let touchTarget: EventTarget | null = null;
		let mousePointerId: number | null = null;
		let onHandle = false;
		let scroller: HTMLElement | null = null;
		let samples: { y: number; t: number }[] = [];
		let frame = 0;
		let overlayEl: HTMLElement | null = null;
		let baseBg = '';

		const isEnabled = () => gesturesAllowed() && (options.enabled?.() ?? true);

		const stopClick = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
		};

		function applyY(nextY: number) {
			y = Math.max(0, nextY);
			if (y === 0) {
				sheetEl.style.removeProperty('transform');
				overlayEl?.style.removeProperty('background-color');
				return;
			}
			sheetEl.style.transform = `translate3d(0, ${y}px, 0)`;
			if (overlayEl && baseBg) {
				const h = Math.max(1, sheetEl.offsetHeight || 1);
				const keep = Math.max(0, Math.round((1 - y / h) * 100));
				overlayEl.style.backgroundColor =
					keep === 0 ? 'transparent' : `color-mix(in srgb, ${baseBg} ${keep}%, transparent)`;
			}
		}

		function render() {
			frame = 0;
			applyY(pendingY);
		}

		function calcVelocity(now: number) {
			const recent = samples.filter((s) => now - s.t < 100);
			const first = recent[0];
			const last = recent.at(-1);
			return first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
		}

		function listenTouch(on: boolean) {
			const method = on ? 'addEventListener' : 'removeEventListener';
			touchTarget?.[method]('touchmove', onTouchMove as EventListener, { passive: false });
			touchTarget?.[method]('touchend', onTouchEnd as EventListener);
			touchTarget?.[method]('touchcancel', onTouchEnd as EventListener);
			if (!on) touchTarget = null;
		}

		function resetDrag() {
			cancelAnimationFrame(frame);
			frame = 0;
			touchId = null;
			mousePointerId = null;
			onHandle = false;
			scroller = null;
			samples = [];
			listenTouch(false);
		}

		function prepareStart(target: EventTarget | null, clientX: number, clientY: number) {
			if (flight?.active) {
				flight.stop();
				startOffset = y;
			} else {
				startOffset = 0;
			}
			overlayEl = sheetEl.parentElement;
			if (y === 0 || !baseBg) {
				baseBg = overlayEl && typeof getComputedStyle === 'function' ? getComputedStyle(overlayEl).backgroundColor : '';
			}
			startX = clientX;
			startY = clientY;
			pendingY = startOffset;
			dragging = false;
			samples = [];
			void target;
		}

		function release(v: number | null) {
			const wasDragging = dragging;
			dragging = false;
			resetDrag();
			if (!wasDragging) {
				if (y > 0) flight = glide(y, 0, 0, applyY, () => sheetEl.style.removeProperty('will-change'));
				return;
			}
			sheetEl.addEventListener('click', stopClick, { capture: true, once: true });
			setTimeout(() => sheetEl.removeEventListener('click', stopClick, true), 300);

			const h = Math.max(1, sheetEl.offsetHeight || 1);
			const threshold = Math.min(h * DISTANCE, 140);
			const shouldClose = v !== null && (v > FLING || (v >= -FLING && y > threshold));

			if (shouldClose) {
				closing = true;
				flight = glide(y, h, Math.max(0, v ?? 0), applyY, () => {
					if (overlayEl) skipHide(overlayEl);
					options.onclose();
				});
			} else {
				flight = glide(y, 0, v ?? 0, applyY, () => {
					sheetEl.style.removeProperty('will-change');
				});
			}
		}

		function abort() {
			dragging = false;
			resetDrag();
			if (y > 0) {
				flight = glide(y, 0, 0, applyY, () => sheetEl.style.removeProperty('will-change'));
			}
		}

		function onTouchStart(e: TouchEvent) {
			if (closing || e.touches.length > 1 || !isEnabled()) {
				if (touchId !== null) abort();
				return;
			}
			if (touchId !== null) abort();
			const t = e.touches[0];
			if (!t) return;
			const targetEl =
				typeof Element !== 'undefined' && e.target instanceof Element
					? e.target
					: (e.target as Node | null)?.parentElement ?? null;
			onHandle = Boolean(options.handleSelector && targetEl?.closest?.(options.handleSelector));
			if (!onHandle && targetEl?.closest?.('input, textarea, select, [contenteditable]')) return;
			scroller = onHandle ? null : findScrollableParent(targetEl, sheetEl);
			if (scroller && scroller.scrollTop > 1) return;

			prepareStart(e.target, t.clientX, t.clientY);
			touchId = t.identifier;
			touchTarget = e.target ?? sheetEl;
			listenTouch(true);
		}

		function onTouchMove(e: TouchEvent) {
			if (touchId === null) return;
			const t = [...e.touches].find((item) => item.identifier === touchId);
			if (!t) return;
			const dx = t.clientX - startX;
			const dy = t.clientY - startY;

			if (!dragging) {
				if (!e.cancelable) return abort();
				if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) {
					if (dy > 0 && (onHandle || !scroller || scroller.scrollTop <= 1)) e.preventDefault();
					return;
				}
				if (Math.abs(dx) > Math.abs(dy) || (!onHandle && (dy <= 0 || (scroller && scroller.scrollTop > 1)))) {
					return abort();
				}
				dragging = true;
				startY = t.clientY - startOffset;
				sheetEl.style.willChange = 'transform';
			}

			e.preventDefault();
			pendingY = Math.max(0, t.clientY - startY);
			samples.push({ y: t.clientY, t: e.timeStamp });
			if (samples.length > 8) samples.shift();
			frame ||= requestAnimationFrame(render);
		}

		function onTouchEnd(e: TouchEvent) {
			if (touchId === null) return;
			const t = [...e.changedTouches].find((item) => item.identifier === touchId);
			if (!t) return;
			if (frame) {
				cancelAnimationFrame(frame);
				render();
			}
			samples.push({ y: t.clientY, t: e.timeStamp });
			release(e.type === 'touchend' ? calcVelocity(e.timeStamp) : null);
		}

		function onPointerDown(e: PointerEvent) {
			if (e.pointerType === 'touch' || e.button !== 0 || closing || !options.handleSelector || !isEnabled()) return;
			const targetEl =
				typeof Element !== 'undefined' && e.target instanceof Element
					? e.target
					: (e.target as Node | null)?.parentElement ?? null;
			if (!targetEl?.closest?.(options.handleSelector)) return;
			if (targetEl.closest?.('button, a, input, textarea, select, [contenteditable]')) return;

			onHandle = true;
			scroller = null;
			prepareStart(e.target, e.clientX, e.clientY);
			mousePointerId = e.pointerId;
		}

		function onPointerMove(e: PointerEvent) {
			if (mousePointerId === null || e.pointerId !== mousePointerId) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			if (!dragging) {
				if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
				if (Math.abs(dx) > Math.abs(dy)) return abort();
				dragging = true;
				startY = e.clientY - startOffset;
				sheetEl.style.willChange = 'transform';
				try {
					sheetEl.setPointerCapture(e.pointerId);
				} catch {
					// Палец/курсор уже отпущен
				}
			}
			pendingY = Math.max(0, e.clientY - startY);
			samples.push({ y: e.clientY, t: e.timeStamp });
			if (samples.length > 8) samples.shift();
			frame ||= requestAnimationFrame(render);
		}

		function onPointerUp(e: PointerEvent) {
			if (mousePointerId === null || e.pointerId !== mousePointerId) return;
			if (frame) {
				cancelAnimationFrame(frame);
				render();
			}
			samples.push({ y: e.clientY, t: e.timeStamp });
			release(e.type === 'pointerup' ? calcVelocity(e.timeStamp) : null);
		}

		function onLostCapture(e: PointerEvent) {
			if (e.target === sheetEl && e.pointerId === mousePointerId && dragging) release(null);
		}

		sheetEl.addEventListener('touchstart', onTouchStart, { passive: true });
		sheetEl.addEventListener('pointerdown', onPointerDown, { passive: true });
		sheetEl.addEventListener('pointermove', onPointerMove, { passive: true });
		sheetEl.addEventListener('pointerup', onPointerUp, { passive: true });
		sheetEl.addEventListener('pointercancel', onPointerUp, { passive: true });
		sheetEl.addEventListener('lostpointercapture', onLostCapture, { passive: true });

		return () => {
			flight?.stop();
			resetDrag();
			sheetEl.style.removeProperty('transform');
			sheetEl.style.removeProperty('will-change');
			overlayEl?.style.removeProperty('background-color');
			sheetEl.removeEventListener('touchstart', onTouchStart);
			sheetEl.removeEventListener('pointerdown', onPointerDown);
			sheetEl.removeEventListener('pointermove', onPointerMove);
			sheetEl.removeEventListener('pointerup', onPointerUp);
			sheetEl.removeEventListener('pointercancel', onPointerUp);
			sheetEl.removeEventListener('lostpointercapture', onLostCapture);
			sheetEl.removeEventListener('click', stopClick, true);
		};
	};
}
