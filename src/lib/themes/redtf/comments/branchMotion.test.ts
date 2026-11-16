import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('svelte', () => ({ tick: () => Promise.resolve() }));

import { reflow } from './branchMotion';

type AnimCall = { keyframes: Keyframe[] | PropertyIndexedKeyframes; options?: number | KeyframeAnimationOptions };

function createStyle() {
	const map = new Map<string, string>();
	return {
		set overflowAnchor(value: string) {
			map.set('overflow-anchor', value);
		},
		get overflowAnchor() {
			return map.get('overflow-anchor') ?? '';
		},
		set minHeight(value: string) {
			map.set('min-height', value);
		},
		get minHeight() {
			return map.get('min-height') ?? '';
		},
		removeProperty(name: string) {
			map.delete(name);
		}
	};
}

function fakeNode(id: string, top: number) {
	const anims: AnimCall[] = [];
	const activeAnims: Array<{ cancel: ReturnType<typeof vi.fn>; finished: Promise<void> }> = [];
	let currentTop = top;
	let resolveFade: (() => void) | undefined;

	const node = {
		id,
		anims,
		activeAnims,
		style: createStyle(),
		get top() {
			return currentTop;
		},
		set top(value: number) {
			currentTop = value;
		},
		getBoundingClientRect: () => ({ top: currentTop, bottom: currentTop + 80 }) as DOMRect,
		animate(keyframes: Keyframe[] | PropertyIndexedKeyframes, options?: number | KeyframeAnimationOptions) {
			anims.push({ keyframes, options });
			const finished = new Promise<void>((resolve) => {
				resolveFade = resolve;
			});
			const anim = { cancel: vi.fn(), finished };
			activeAnims.push(anim);
			return anim as unknown as Animation;
		},
		getAnimations: () => activeAnims as unknown as Animation[],
		finishAnimations() {
			resolveFade?.();
		}
	};
	return node;
}

function fakeList(initialRows: ReturnType<typeof fakeNode>[], height: number, bottom: number) {
	let rows = [...initialRows];
	let currentHeight = height;
	let currentBottom = bottom;
	const anims: AnimCall[] = [];
	const style = createStyle();

	const list = {
		anims,
		style,
		get children() {
			return rows as unknown as HTMLCollection;
		},
		setRows(next: ReturnType<typeof fakeNode>[]) {
			rows = next;
		},
		get offsetHeight() {
			return currentHeight;
		},
		set offsetHeight(value: number) {
			currentHeight = value;
		},
		set bottom(value: number) {
			currentBottom = value;
		},
		getBoundingClientRect: () => ({ top: currentBottom - currentHeight, bottom: currentBottom }) as DOMRect,
		animate(keyframes: Keyframe[] | PropertyIndexedKeyframes, options?: number | KeyframeAnimationOptions) {
			anims.push({ keyframes, options });
			return { cancel: vi.fn(), finished: Promise.resolve() } as unknown as Animation;
		},
		getAnimations: () => [] as Animation[]
	};
	return list;
}

describe('branchMotion reflow', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('при сворачивании снимает before после затухания, двигает остающиеся и подтянутые снизу строки', async () => {
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		vi.stubGlobal('innerHeight', 800);

		const a = fakeNode('comment-a', 100);
		const b = fakeNode('comment-b', 200);
		const c = fakeNode('comment-c', 300);
		const d = fakeNode('comment-d', 270);
		const list = fakeList([a, b, c], 500, 400);

		let styleDuringChange: { overflowAnchor: string; minHeight: string } | undefined;
		const promise = reflow(
			list as unknown as HTMLElement,
			() => {
				styleDuringChange = { overflowAnchor: list.style.overflowAnchor, minHeight: list.style.minHeight };
				c.top = 170;
				list.setRows([a, c, d]);
				list.offsetHeight = 400;
				list.bottom = 300;
			},
			(row) => row.id === 'comment-b'
		);

		// Имитируем прокрутку на 30px вверх, пока уходящая строка ещё затухает
		a.top = 70;
		c.top = 270;
		expect(b.anims).toHaveLength(1);
		b.finishAnimations();
		await promise;

		// В момент change() были выставлены защитные стили, а после расчёта — убраны
		expect(styleDuringChange).toEqual({ overflowAnchor: 'none', minHeight: '500px' });
		expect(list.style.overflowAnchor).toBe('');
		expect(list.style.minHeight).toBe('');

		// Незавершённые анимации на остающихся строках отменяются до замера
		expect(a.anims).toHaveLength(0);
		expect(c.anims).toHaveLength(1);
		expect(c.anims[0].keyframes).toEqual([{ transform: 'translateY(100px)' }, { transform: 'none' }]);

		// Подтянутая снизу виртуальным окном строка получает MOVE с lastDy, а не IN
		expect(d.anims).toHaveLength(1);
		expect(d.anims[0].keyframes).toEqual([{ transform: 'translateY(100px)' }, { transform: 'none' }]);
		expect(d.anims[0].options).toMatchObject({ duration: 300 });

		// Низ списка виден: высота контейнера плавно сжимается
		expect(list.anims).toHaveLength(1);
		expect(list.anims[0].keyframes).toEqual({ height: ['500px', '400px'] });
	});

	it('при сворачивании ветки длиннее окна списка новые строки приезжают из-за его нижнего края', async () => {
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		vi.stubGlobal('innerHeight', 800);

		const a = fakeNode('comment-a', 100);
		const b = fakeNode('comment-b', 180);
		const c = fakeNode('comment-c', 260);
		const d = fakeNode('comment-d', 180);
		const e = fakeNode('comment-e', 260);
		const list = fakeList([a, b, c], 5000, 4000);

		const promise = reflow(
			list as unknown as HTMLElement,
			() => list.setRows([a, d, e]),
			(row) => row.id !== 'comment-a'
		);
		b.finishAnimations();
		c.finishAnimations();
		await promise;

		// Низ последней строки до сворачивания — 340: обе новые строки едут оттуда одним блоком
		expect(a.anims).toHaveLength(0);
		for (const node of [d, e]) {
			expect(node.anims).toHaveLength(1);
			expect(node.anims[0].keyframes).toEqual([{ transform: 'translateY(160px)' }, { transform: 'none' }]);
		}
	});

	it('при разворачивании играет IN для новых строк и MOVE для сдвинутых вниз соседей', async () => {
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		vi.stubGlobal('innerHeight', 800);

		const a = fakeNode('comment-a', 100);
		const b = fakeNode('comment-b', 200);
		const c = fakeNode('comment-c', 200);
		const list = fakeList([a, c], 400, 350);

		await reflow(list as unknown as HTMLElement, () => {
			c.top = 300;
			list.setRows([a, b, c]);
			list.offsetHeight = 500;
			list.bottom = 450;
		});

		expect(a.anims).toHaveLength(0);
		expect(b.anims).toHaveLength(1);
		expect(b.anims[0].keyframes).toEqual([
			{ opacity: 0, transform: 'translateY(-8px)' },
			{ opacity: 1, transform: 'none' }
		]);
		expect(b.anims[0].options).toMatchObject({ duration: 240, delay: 90 });

		expect(c.anims).toHaveLength(1);
		expect(c.anims[0].keyframes).toEqual([{ transform: 'translateY(-100px)' }, { transform: 'none' }]);
	});
});
