import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { settings } from '$lib/storage/settings.svelte';
import { animatedAvatar } from './animatedAvatar.svelte';

const ANIMATED_URL = 'https://leonardo.osnova.io/av-uuid/-/scale_crop/64x64/-/format/webp/#video';
const ANIMATED_URL_2 = 'https://leonardo.osnova.io/av-uuid-2/-/scale_crop/64x64/-/format/webp/#video';
const STATIC_URL = 'https://leonardo.osnova.io/st-uuid/-/scale_crop/64x64/-/format/webp/';

class FakeHTMLImageElement {
	isConnected = true;
	style: Record<string, string> = {};
	clientLeft = 0;
	clientTop = 0;
	clientWidth = 32;
	clientHeight = 32;
	parentElement: any = null;
	_rect = { left: 10, top: 10, width: 32, height: 32 };
	getBoundingClientRect() {
		return this._rect;
	}
	after(child: any) {
		if (!this.parentElement) return;
		child._parent = this.parentElement;
		child.isConnected = true;
		const idx = this.parentElement.children.indexOf(this);
		this.parentElement.children.splice(idx + 1, 0, child);
	}
}

function createFakeVideo() {
	const video: any = {
		muted: false,
		loop: false,
		playsInline: false,
		preload: '',
		readyState: 2,
		src: '',
		isConnected: false,
		style: { cssText: '' },
		attrs: new Map<string, string>(),
		play: vi.fn().mockResolvedValue(undefined),
		pause: vi.fn(),
		load: vi.fn(),
		setAttribute(k: string, v: string) {
			this.attrs.set(k, v);
		},
		removeAttribute(k: string) {
			if (k === 'src') this.src = '';
			this.attrs.delete(k);
		},
		remove() {
			this.isConnected = false;
			if (this._parent) {
				this._parent.children = this._parent.children.filter((c: any) => c !== video);
				this._parent = null;
			}
		}
	};
	return video;
}

function createFakeNode() {
	const listeners = new Map<string, ((e: any) => void)[]>();
	const node: any = {
		isConnected: true,
		style: { position: '', overflow: '' },
		children: [] as any[],
		clientLeft: 0,
		clientTop: 0,
		_rect: { left: 0, top: 0, width: 100, height: 40 },
		getBoundingClientRect() {
			return this._rect;
		},
		closest: () => null,
		append(child: any) {
			child._parent = node;
			child.isConnected = true;
			if (child instanceof FakeHTMLImageElement) child.parentElement = node;
			node.children.push(child);
		},
		addEventListener(type: string, fn: (e: any) => void) {
			listeners.set(type, [...(listeners.get(type) ?? []), fn]);
		},
		removeEventListener(type: string, fn: (e: any) => void) {
			listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
		},
		dispatch(type: string, e: any) {
			for (const fn of listeners.get(type) ?? []) fn(e);
		}
	};
	return node as HTMLElement & { children: any[]; dispatch: (t: string, e: any) => void };
}

describe('animatedAvatar', () => {
	let ioInstances: { callback: IntersectionObserverCallback; observed: Set<Element>; trigger: (el: Element, isIntersecting: boolean) => void }[] = [];
	let roInstances: { observed: Set<Element>; disconnected: boolean; trigger: (targets: Element[]) => void }[] = [];
	let docListeners: Map<string, Set<() => void>>;
	let fakeDoc: { hidden: boolean; createElement: () => any; addEventListener: any; removeEventListener: any };
	let reducedMotionMatch = false;

	beforeEach(() => {
		vi.useFakeTimers();
		settings.patch({ animatedAvatars: 'all' });
		ioInstances = [];
		roInstances = [];
		reducedMotionMatch = false;
		docListeners = new Map();

		vi.stubGlobal('HTMLImageElement', FakeHTMLImageElement);
		vi.stubGlobal('window', {
			matchMedia: (query: string) => ({
				matches: query === '(prefers-reduced-motion: reduce)' ? reducedMotionMatch : false
			})
		});
		vi.stubGlobal('getComputedStyle', (el: any) => ({
			position: el.style?.position || 'static',
			overflow: el.style?.overflow || 'visible',
			borderRadius: '50%',
			opacity: el.style?.opacity || '1',
			filter: el.style?.filter || 'none'
		}));
		fakeDoc = {
			hidden: false,
			createElement: () => createFakeVideo(),
			addEventListener: vi.fn((type: string, fn: () => void) => {
				if (!docListeners.has(type)) docListeners.set(type, new Set());
				docListeners.get(type)!.add(fn);
			}),
			removeEventListener: vi.fn((type: string, fn: () => void) => {
				docListeners.get(type)?.delete(fn);
			})
		};
		vi.stubGlobal('document', fakeDoc);
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				observed = new Set<Element>();
				callback: IntersectionObserverCallback;
				constructor(cb: IntersectionObserverCallback) {
					this.callback = cb;
					ioInstances.push({
						callback: cb,
						observed: this.observed,
						trigger: (target, isIntersecting) => {
							cb([{ target, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
						}
					});
				}
				observe(el: Element) {
					this.observed.add(el);
				}
				unobserve(el: Element) {
					this.observed.delete(el);
				}
				disconnect() {
					this.observed.clear();
				}
			}
		);
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observed = new Set<Element>();
				disconnected = false;
				constructor(cb: ResizeObserverCallback) {
					const inst = {
						observed: this.observed,
						disconnected: false,
						trigger: (targets: Element[]) => {
							cb(targets.map((target) => ({ target } as ResizeObserverEntry)), this as unknown as ResizeObserver);
						}
					};
					roInstances.push(inst);
				}
				observe(el: Element) {
					this.observed.add(el);
				}
				unobserve(el: Element) {
					this.observed.delete(el);
				}
				disconnect() {
					this.observed.clear();
					const last = roInstances[roInstances.length - 1];
					if (last) last.disconnected = true;
				}
			}
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
		settings.patch({ animatedAvatars: 'all' });
	});

	it('возвращает undefined для статичных аватарок, при выключенной настройке и prefers-reduced-motion', () => {
		expect(animatedAvatar(STATIC_URL)).toBeUndefined();
		expect(animatedAvatar(undefined)).toBeUndefined();

		settings.patch({ animatedAvatars: 'off' });
		expect(animatedAvatar(ANIMATED_URL)).toBeUndefined();
		expect(animatedAvatar(ANIMATED_URL, true)).toBeUndefined();

		settings.patch({ animatedAvatars: 'all' });
		reducedMotionMatch = true;
		expect(animatedAvatar(ANIMATED_URL)).toBeUndefined();
	});

	it('в режиме hover дебаунсит наведение, игнорирует тач и освобождает видео при уходе', () => {
		settings.patch({ animatedAvatars: 'hover' });
		const node = createFakeNode();
		const attach = animatedAvatar(ANIMATED_URL)!;
		expect(attach).toBeTypeOf('function');

		const destroy = attach(node)!;
		expect(node.children).toHaveLength(0);

		// Тач-события не запускают hover-анимацию
		node.dispatch('pointerenter', { pointerType: 'touch' });
		vi.advanceTimersByTime(100);
		expect(node.children).toHaveLength(0);

		// Быстрый пронос курсора отменяется до истечения дебаунса
		node.dispatch('pointerenter', { pointerType: 'mouse' });
		vi.advanceTimersByTime(40);
		expect(node.children).toHaveLength(0);
		node.dispatch('pointerleave', { pointerType: 'mouse' });
		vi.advanceTimersByTime(100);
		expect(node.children).toHaveLength(0);

		// Удержание курсора монтирует и запускает видео
		node.dispatch('pointerenter', { pointerType: 'mouse' });
		vi.advanceTimersByTime(80);
		expect(node.children).toHaveLength(1);
		expect(node.children[0].src).toBe('https://leonardo.osnova.io/av-uuid/-/format/mp4/');
		expect(node.children[0].play).toHaveBeenCalledTimes(1);

		node.dispatch('pointerleave', { pointerType: 'mouse' });
		expect(node.children).toHaveLength(0);

		destroy();
	});

	it('в режиме all дебаунсит вход в экран, ограничивает пул до 8 видео и продвигает очередь', () => {
		const nodes = Array.from({ length: 9 }, () => createFakeNode());
		const cleanups = nodes.map((n) => animatedAvatar(ANIMATED_URL)!(n)!);
		const io = ioInstances[0];

		// Быстрый проскролл мимо: ушёл до истечения 120мс — видео не создаётся
		io.trigger(nodes[0], true);
		vi.advanceTimersByTime(60);
		io.trigger(nodes[0], false);
		vi.advanceTimersByTime(100);
		expect(nodes[0].children).toHaveLength(0);

		// Входят все 9 аватарок: запускаются только первые 8, 9-я ждёт в очереди
		for (const n of nodes) io.trigger(n, true);
		vi.advanceTimersByTime(150);

		for (let i = 0; i < 8; i++) expect(nodes[i].children).toHaveLength(1);
		expect(nodes[8].children).toHaveLength(0);

		// Первый уходит за экран — его место сразу занимает 9-й
		io.trigger(nodes[0], false);
		expect(nodes[0].children).toHaveLength(0);
		expect(nodes[8].children).toHaveLength(1);

		for (const cleanup of cleanups) cleanup();
	});

	it('вытесняет дубликаты одного автора в пользу нового уникального URL, но не вытесняет уникальные', () => {
		const dupNodes = Array.from({ length: 8 }, () => createFakeNode());
		const uniqueNode = createFakeNode();
		const cleanups = [
			...dupNodes.map((n) => animatedAvatar(ANIMATED_URL)!(n)!),
			animatedAvatar(ANIMATED_URL_2)!(uniqueNode)!
		];
		const io = ioInstances[0];

		for (const n of dupNodes) io.trigger(n, true);
		vi.advanceTimersByTime(150);

		// Появляется новый автор — один из 8 дубликатов уступает ему слот
		io.trigger(uniqueNode, true);
		vi.advanceTimersByTime(150);

		expect(uniqueNode.children).toHaveLength(1);
		expect(dupNodes.filter((n) => n.children.length === 1)).toHaveLength(7);

		// Когда все 8 слотов заняты уникальными URL, 9-й уникальный ждёт в очереди
		for (const cleanup of cleanups) cleanup();

		const uniqueUrls = Array.from(
			{ length: 9 },
			(_, i) => `https://leonardo.osnova.io/u-${i}/-/scale_crop/64x64/-/format/webp/#video`
		);
		const uniqueNodes = uniqueUrls.map(() => createFakeNode());
		const uniqueCleanups = uniqueUrls.map((url, i) => animatedAvatar(url)!(uniqueNodes[i])!);
		const io2 = ioInstances[1];

		for (const n of uniqueNodes) io2.trigger(n, true);
		vi.advanceTimersByTime(150);

		for (let i = 0; i < 8; i++) expect(uniqueNodes[i].children).toHaveLength(1);
		expect(uniqueNodes[8].children).toHaveLength(0);

		for (const cleanup of uniqueCleanups) cleanup();
	});

	it('для HTMLImageElement читает геометрию до записи стилей, обновляется по ResizeObserver и восстанавливает parent', () => {
		const parent = createFakeNode() as any;
		const img = new FakeHTMLImageElement();
		img.style.opacity = '0.5';
		img.style.filter = 'grayscale(0.5)';
		parent.append(img);

		let positionWhenMeasured = '';
		const origGetRect = img.getBoundingClientRect.bind(img);
		img.getBoundingClientRect = () => {
			positionWhenMeasured = parent.style.position;
			return origGetRect();
		};

		const cleanup = animatedAvatar(ANIMATED_URL)!(img as unknown as HTMLElement)!;
		ioInstances[0].trigger(img as unknown as Element, true);
		vi.advanceTimersByTime(150);

		// Чтение геометрии произошло ДО установки position: relative на родителе
		expect(positionWhenMeasured).toBe('');
		expect(parent.style.position).toBe('relative');
		expect(parent.children).toHaveLength(2);

		const video = parent.children[1];
		expect(video.style.left).toBe('10px');
		expect(video.style.top).toBe('10px');
		expect(video.style.width).toBe('32px');
		expect(video.style.height).toBe('32px');
		expect(video.style.opacity).toBe('0.5');
		expect(video.style.filter).toBe('grayscale(0.5)');

		// При ресайзе картинки ResizeObserver обновляет размеры видеослоя
		img._rect = { left: 16, top: 12, width: 48, height: 48 };
		img.clientWidth = 48;
		img.clientHeight = 48;
		roInstances[0].trigger([img as unknown as Element]);
		expect(video.style.left).toBe('16px');
		expect(video.style.width).toBe('48px');

		cleanup();
		expect(parent.style.position).toBe('');
		expect(roInstances[0].disconnected).toBe(true);
	});

	it('ставит видео на паузу при скрытии вкладки и снимает слушатель при простое', () => {
		const node = createFakeNode();
		const cleanup = animatedAvatar(ANIMATED_URL)!(node)!;
		ioInstances[0].trigger(node, true);
		vi.advanceTimersByTime(150);

		const video = node.children[0];
		expect(docListeners.get('visibilitychange')?.size).toBe(1);

		fakeDoc.hidden = true;
		for (const fn of docListeners.get('visibilitychange') ?? []) fn();
		expect(video.pause).toHaveBeenCalledTimes(1);

		fakeDoc.hidden = false;
		for (const fn of docListeners.get('visibilitychange') ?? []) fn();
		expect(video.play).toHaveBeenCalledTimes(2);

		cleanup();
		expect(docListeners.get('visibilitychange')?.size ?? 0).toBe(0);
	});
});
