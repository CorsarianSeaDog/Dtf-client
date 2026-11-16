import { tick } from 'svelte';
import { scrollBehavior } from '$lib/motion';
import { shouldVirtualizeComments } from '$lib/storage/settings.svelte';
import type { CommentRow } from './flatten';

/** Высота строки, пока ни одна не измерена */
const ESTIMATE = 128;
const PREFIX = 'comment-';
/** Переход закончен, когда цель простояла на месте столько кадров подряд; дольше SETTLE_FRAMES не доводим */
const STILL_FRAMES = 6;
const SETTLE_FRAMES = 90;
const HIGHLIGHT = 'var(--color-blue-tint, var(--bg-highlight, #e8f3ff))';

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Строки [start, end), которые пересекают отрезок [top, bottom); offsets — верх каждой строки и в конце вся высота */
export function windowRange(offsets: number[], top: number, bottom: number): [number, number] {
	const n = offsets.length - 1;
	// Первая строка, чей низ ниже y
	const find = (y: number, lo: number) => {
		let hi = n;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (offsets[mid + 1] > y) hi = mid;
			else lo = mid + 1;
		}
		return lo;
	};
	const start = find(top, 0);
	return [start, Math.min(n, find(bottom, start) + 1)];
}

/**
 * Окно строк списка комментариев (решение 0015): в DOM только строки около экрана, место остальных занимают отступы списка.
 * Высоты строк меряются по ходу, для невиденных берётся средняя. Прокручивается окно браузера.
 */
export class VirtualRows {
	/** Видимая часть окна в координатах списка: 0 — верх первой строки */
	private viewTop = $state(0);
	private viewHeight = $state(typeof innerHeight === 'number' ? innerHeight : 800);
	/** Растёт, когда изменились измеренные высоты: сама карта не реактивна */
	private version = $state(0);
	/** Строка, к которой идёт переход: держится в окне до прибытия */
	private target = $state<string | null>(null);
	private heights = new Map<string, number>();
	/** Высота ещё не измеренной строки: средняя по измеренным на момент последнего пересчёта */
	private estimate = ESTIMATE;
	private rows: () => CommentRow[];
	private pinned: () => string | null;
	private list: HTMLElement | undefined;
	private width = 0;
	private dirty = false;
	private raf = 0;
	private touchActive = false;
	private scrolling = false;
	private scrollIdleTimer: ReturnType<typeof setTimeout> | undefined;
	private ignoringScroll = false;
	private observer: ResizeObserver | undefined;

	/** pinned — строка, которая не уходит из окна (с открытым редактором) */
	constructor(rows: () => CommentRow[], pinned: () => string | null) {
		this.rows = rows;
		this.pinned = pinned;
	}

	private offsets = $derived.by(() => {
		void this.version;
		const rows = this.rows();
		const average = this.estimate;
		const offsets = new Array<number>(rows.length + 1);
		offsets[0] = 0;
		for (let i = 0; i < rows.length; i++) offsets[i + 1] = offsets[i] + (this.heights.get(rows[i].key) ?? average);
		return offsets;
	});

	private range = $derived.by((): [number, number] => {
		const rows = this.rows();
		if (!shouldVirtualizeComments()) return [0, rows.length];
		// Запас в экран сверху и снизу
		let [start, end] = windowRange(this.offsets, this.viewTop - this.viewHeight, this.viewTop + 2 * this.viewHeight);
		// ponytail: закреплённая строка тянет окно до себя; уйти от редактора на сотни строк — смонтировать их все
		for (const key of [this.pinned(), this.target]) {
			const i = key ? rows.findIndex((row) => row.key === key) : -1;
			if (i < 0) continue;
			start = Math.min(start, i);
			end = Math.max(end, i + 1);
		}
		return [start, end];
	});

	/** Индекс первой строки окна в полном списке */
	start = $derived(this.range[0]);
	items = $derived.by(() => this.rows().slice(this.range[0], this.range[1]));
	padTop = $derived(this.offsets[this.range[0]]);
	padBottom = $derived(this.offsets[this.offsets.length - 1] - this.offsets[this.range[1]]);

	/** Присоединение к списку: прокрутка окна и ширина колонки */
	attach = (list: HTMLElement) => {
		this.list = list;
		const parent = list.parentElement;
		if (parent) this.resizes().observe(parent);
		const schedule = () => this.schedule();
		const clearScrollIdle = () => {
			if (this.scrollIdleTimer !== undefined) {
				clearTimeout(this.scrollIdleTimer);
				this.scrollIdleTimer = undefined;
			}
			this.scrolling = false;
		};
		const onScroll = () => {
			if (!this.ignoringScroll) {
				this.scrolling = true;
				clearTimeout(this.scrollIdleTimer);
				this.scrollIdleTimer = setTimeout(clearScrollIdle, 160);
			}
			this.ignoringScroll = false;
			this.schedule();
		};
		const onTouchStart = () => {
			this.touchActive = true;
		};
		const onTouchEnd = () => {
			this.touchActive = false;
		};
		addEventListener('scroll', onScroll, { passive: true });
		addEventListener('scrollend', clearScrollIdle, { passive: true });
		addEventListener('resize', schedule);
		addEventListener('touchstart', onTouchStart, { passive: true });
		addEventListener('touchend', onTouchEnd, { passive: true });
		addEventListener('touchcancel', onTouchEnd, { passive: true });
		schedule();
		return () => {
			removeEventListener('scroll', onScroll);
			removeEventListener('scrollend', clearScrollIdle);
			removeEventListener('resize', schedule);
			removeEventListener('touchstart', onTouchStart);
			removeEventListener('touchend', onTouchEnd);
			removeEventListener('touchcancel', onTouchEnd);
			clearScrollIdle();
			cancelAnimationFrame(this.raf);
			this.raf = 0;
			this.touchActive = false;
			this.ignoringScroll = false;
			this.observer?.disconnect();
			this.observer = undefined;
			this.list = undefined;
		};
	};

	/** Снимок измеренных высот строк для сохранения в памяти */
	exportHeights(): Array<[string, number]> {
		return [...this.heights.entries()];
	}

	/** Восстановление ранее измеренных высот строк */
	restoreHeights(entries: Iterable<[string, number]>): void {
		let restored = false;
		for (const [key, height] of entries) {
			if (Number.isFinite(height) && height > 0) {
				this.heights.set(key, height);
				restored = true;
			}
		}
		if (restored) {
			this.dirty = true;
			this.version++;
		}
	}

	/** Запомнить верхний видимый комментарий для компенсации сдвига при внешней вставке */
	captureAnchor(): { key: string; top: number } | null {
		if (
			!this.list ||
			this.touchActive ||
			this.scrolling ||
			this.list.checkVisibility?.() === false ||
			typeof window === 'undefined' ||
			window.scrollY <= 0 ||
			this.viewTop <= 0
		) {
			return null;
		}
		for (const el of this.list.children) {
			if (!el.id.startsWith(PREFIX)) continue;
			const rect = el.getBoundingClientRect();
			if (rect.bottom > 0) {
				return { key: el.id.slice(PREFIX.length), top: rect.top };
			}
		}
		return null;
	}

	/** Скомпенсировать сдвиг прокрутки после внешней вставки по сохранённому якорю */
	restoreAnchor(anchor: { key: string; top: number } | null): void {
		if (
			!anchor ||
			!this.list ||
			this.touchActive ||
			this.scrolling ||
			this.list.checkVisibility?.() === false ||
			typeof window === 'undefined'
		) {
			return;
		}
		const targetId = `${PREFIX}${anchor.key}`;
		let node: Element | null = null;
		for (const el of this.list.children) {
			if (el.id === targetId) {
				node = el;
				break;
			}
		}
		if (!node) return;
		const delta = node.getBoundingClientRect().top - anchor.top;
		if (Math.abs(delta) > 1) {
			this.ignoringScroll = true;
			window.scrollBy({ top: delta, behavior: 'instant' });
			this.sync();
			if (typeof requestAnimationFrame === 'function') {
				requestAnimationFrame(() => {
					this.ignoringScroll = false;
				});
			} else {
				this.ignoringScroll = false;
			}
		}
	}

	/** Присоединение к строке: её высота */
	measure = (node: HTMLElement) => {
		const observer = this.resizes();
		observer.observe(node);
		return () => observer.unobserve(node);
	};

	private resizes() {
		return (this.observer ??= new ResizeObserver((entries) => {
			// Колонка сменила ширину: строки переложились, старые высоты не годятся. Сначала она, потом новые замеры строк
			const parent = entries.find((entry) => entry.target === this.list?.parentElement);
			const width = parent?.contentRect.width;
			if (width) {
				if (this.width && Math.abs(width - this.width) > 0.5) this.heights.clear();
				this.width = width;
			}
			for (const entry of entries) {
				const height = entry.borderBoxSize[0]?.blockSize;
				// Нулевой размер у скрытого слоя: это не высота строки
				if (entry !== parent && height) this.heights.set(entry.target.id.slice(PREFIX.length), height);
			}
			this.dirty = true;
			// Не сразу: строки, смонтированные из колбэка, наблюдатель отдал бы только с ошибкой о цикле
			this.schedule();
		}));
	}

	private schedule() {
		this.raf ||= requestAnimationFrame(() => {
			this.raf = 0;
			this.sync();
		});
	}

	private sync() {
		if (this.dirty) {
			this.dirty = false;
			this.reestimate();
			this.version++;
		}
		const list = this.list;
		// Слой поста под другой страницей: прокручивают её, окно не трогаем
		if (!list || list.checkVisibility?.() === false) return;
		this.viewTop = -list.getBoundingClientRect().top;
		this.viewHeight = innerHeight;
	}

	/**
	 * Оценка неизмеренных строк подтягивается к средней, только пока это не двигает экран: над окном нет неизмеренных строк
	 * или идёт переход (он сам доводит позицию). Иначе один замер сдвигал бы всё, что на экране, на разницу оценок, умноженную на число строк выше.
	 */
	private reestimate() {
		if (!this.heights.size) return;
		if (!this.target) {
			const rows = this.rows();
			for (let i = this.range[0] - 1; i >= 0; i--) if (!this.heights.has(rows[i].key)) return;
		}
		let sum = 0;
		for (const height of this.heights.values()) sum += height;
		this.estimate = sum / this.heights.size;
	}

	/**
	 * Переход к строке: окно ставится на неё, затем прокрутка и доводка позиции, пока строки вокруг измеряются.
	 * Дальний переход мгновенный: плавный пролёт смонтировал бы все строки по пути. На время его доводки список не рисуется:
	 * иначе видны рывки, пока оценка высот над целью подтягивается к замерам.
	 */
	async focus(
		key: string,
		{ block = 'start', highlight = true, behavior = scrollBehavior() }: { block?: ScrollLogicalPosition; highlight?: boolean; behavior?: ScrollBehavior } = {}
	) {
		await tick();
		const list = this.list;
		const index = this.rows().findIndex((row) => row.key === key);
		if (!list || index < 0) return;
		this.target = key;
		const y = list.getBoundingClientRect().top + this.offsets[index];
		const far = Math.abs(y) > 2 * innerHeight;
		if (far) {
			list.style.visibility = 'hidden';
			scrollBy({ top: y - innerHeight / 3, behavior: 'instant' });
		}
		this.sync();
		await tick();

		const node = document.getElementById(PREFIX + key);
		if (!node) {
			this.target = null;
			list.style.removeProperty('visibility');
			return;
		}
		// Подсвечиваем сразу, а угасание запускаем по прибытии
		if (highlight) {
			for (const anim of node.getAnimations?.() ?? []) anim.cancel();
			node.style.backgroundColor = HIGHLIGHT;
		}
		node.scrollIntoView({ block, behavior: far ? 'instant' : behavior });
		if (!far && behavior === 'smooth') {
			await new Promise((resolve) => {
				addEventListener('scrollend', resolve, { once: true });
				setTimeout(resolve, 2500);
			});
		}
		// Строки вокруг цели измеряются по кадрам, и оценка над ней сдвигается: доводим, пока позиция не устоится.
		// Пользователь начал прокручивать сам — отпускаем
		let taken = false;
		const take = () => (taken = true);
		const inputs = ['wheel', 'touchstart', 'keydown'];
		for (const type of inputs) addEventListener(type, take, { passive: true });
		for (let still = 0, frames = 0; still < STILL_FRAMES && frames < SETTLE_FRAMES && !taken && node.isConnected; frames++) {
			const before = node.getBoundingClientRect().top;
			node.scrollIntoView({ block, behavior: 'instant' });
			await frame();
			still = Math.abs(node.getBoundingClientRect().top - before) < 1 ? still + 1 : 0;
		}
		for (const type of inputs) removeEventListener(type, take);
		if (this.target === key) this.target = null;
		list.style.removeProperty('visibility');
		if (highlight) {
			node.style.removeProperty('background-color');
			node.animate([{ backgroundColor: HIGHLIGHT }, { backgroundColor: 'transparent' }], { duration: 2500, easing: 'ease-out' });
		}
	}
}
