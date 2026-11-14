import { tick } from 'svelte';
import { scrollBehavior } from '$lib/motion';
import { shouldVirtualizeComments } from '$lib/storage/settings.svelte';
import type { CommentRow } from './flatten';

/** Высота строки, пока ни одна не измерена */
const ESTIMATE = 128;
const PREFIX = 'comment-';
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
	private rows: () => CommentRow[];
	private pinned: () => string | null;
	private list: HTMLElement | undefined;
	private width = 0;
	private dirty = false;
	private raf = 0;
	private observer: ResizeObserver | undefined;

	/** pinned — строка, которая не уходит из окна (с открытым редактором) */
	constructor(rows: () => CommentRow[], pinned: () => string | null) {
		this.rows = rows;
		this.pinned = pinned;
	}

	private offsets = $derived.by(() => {
		void this.version;
		const rows = this.rows();
		let sum = 0;
		for (const height of this.heights.values()) sum += height;
		const average = this.heights.size ? sum / this.heights.size : ESTIMATE;
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
		addEventListener('scroll', schedule, { passive: true });
		addEventListener('resize', schedule);
		schedule();
		return () => {
			removeEventListener('scroll', schedule);
			removeEventListener('resize', schedule);
			cancelAnimationFrame(this.raf);
			this.raf = 0;
			this.observer?.disconnect();
			this.observer = undefined;
			this.list = undefined;
		};
	};

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
			this.version++;
		}
		const list = this.list;
		// Слой поста под другой страницей: прокручивают её, окно не трогаем
		if (!list || list.checkVisibility?.() === false) return;
		this.viewTop = -list.getBoundingClientRect().top;
		this.viewHeight = innerHeight;
	}

	/**
	 * Переход к строке: окно ставится на неё, затем прокрутка и доводка позиции, пока строки вокруг измеряются.
	 * Дальний переход мгновенный: плавный пролёт смонтировал бы все строки по пути.
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
		if (far) scrollBy({ top: y - innerHeight / 3, behavior: 'instant' });
		this.sync();
		await tick();

		const node = document.getElementById(PREFIX + key);
		if (!node) {
			this.target = null;
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
		// Строки вокруг цели измерены через кадр-другой, и оценка над ней сдвигается: доводим
		for (let i = 0; i < 3 && node.isConnected; i++) {
			node.scrollIntoView({ block, behavior: 'instant' });
			await frame();
			await frame();
		}
		if (this.target === key) this.target = null;
		if (highlight) {
			node.style.removeProperty('background-color');
			node.animate([{ backgroundColor: HIGHLIGHT }, { backgroundColor: 'transparent' }], { duration: 2500, easing: 'ease-out' });
		}
	}
}
