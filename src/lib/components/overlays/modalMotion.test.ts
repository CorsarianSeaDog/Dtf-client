import { describe, it, expect, vi, beforeEach } from 'vitest';
import { backdropHide, backdropShow, modalHide, modalShow, skipHide } from './modalMotion';
import { fluent } from '$lib/motion';
import { activeTheme } from '$lib/themes/index.svelte';

describe('modalMotion', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		activeTheme.set('redtf');
	});

	it('backdropShow вызывает animate с backdropIn', () => {
		const animate = vi.fn();
		const el = { animate } as unknown as Element;
		backdropShow(el);
		expect(animate).toHaveBeenCalledTimes(1);
	});

	it('backdropHide вызывает animate с backdropOut и fill: forwards', () => {
		const animate = vi.fn();
		const el = { animate } as unknown as Element;
		backdropHide(el, 240);
		expect(animate).toHaveBeenCalledTimes(1);
		expect(animate).toHaveBeenCalledWith(
			expect.any(Array),
			expect.objectContaining({ duration: 240, fill: 'forwards' })
		);
	});

	it('modalShow анимирует дочерние элементы с modalIn', () => {
		const childAnimate = vi.fn();
		const child = {
			animate: childAnimate,
			children: []
		} as unknown as Element;

		const parent = {
			children: [child]
		} as unknown as Element;

		modalShow(parent);
		expect(childAnimate).toHaveBeenCalledWith(
			fluent.modalIn?.keyframes,
			expect.objectContaining({ duration: fluent.modalIn?.duration, easing: fluent.modalIn?.easing })
		);
	});

	it('modalHide возвращает длительность anim.duration и проигрывает уход подложки и детей', () => {
		const nodeAnimate = vi.fn();
		const childAnimate = vi.fn();
		const child = {
			animate: childAnimate,
			children: []
		} as unknown as HTMLElement;

		const node = {
			animate: nodeAnimate,
			children: [child],
			style: {}
		} as unknown as HTMLElement;

		const res = modalHide(node);
		expect(res.duration).toBe(fluent.modalOut?.duration);
		expect(node.style.pointerEvents).toBe('none');
		expect(node.style.overflow).toBe('hidden');
		expect(nodeAnimate).toHaveBeenCalledTimes(1);
		expect(childAnimate).toHaveBeenCalledTimes(1);
	});

	it('в теме без motion (dtf2022) не анимирует появление и закрывает окно сразу', () => {
		activeTheme.set('dtf2022');
		const animate = vi.fn();
		const child = { animate, children: [] } as unknown as HTMLElement;
		const node = { animate, children: [child], style: {} } as unknown as HTMLElement;

		modalShow(node);
		const res = modalHide(node);

		expect(res.duration).toBe(0);
		expect(animate).not.toHaveBeenCalled();
	});

	it('с data-sheet проигрывает sheetIn / sheetOut и пропускает уход после skipHide', () => {
		const nodeAnimate = vi.fn();
		const childAnimate = vi.fn();
		const child = { animate: childAnimate, children: [] } as unknown as HTMLElement;
		const node = {
			animate: nodeAnimate,
			children: [child],
			style: {},
			hasAttribute: (name: string) => name === 'data-sheet'
		} as unknown as HTMLElement;

		modalShow(node);
		expect(childAnimate).toHaveBeenCalledWith(
			fluent.sheetIn?.keyframes,
			expect.objectContaining({ duration: fluent.sheetIn?.duration, easing: fluent.sheetIn?.easing })
		);

		const res = modalHide(node);
		expect(res.duration).toBe(fluent.sheetOut?.duration);
		expect(childAnimate).toHaveBeenCalledWith(
			fluent.sheetOut?.keyframes,
			expect.objectContaining({ duration: fluent.sheetOut?.duration, easing: fluent.sheetOut?.easing, fill: 'forwards' })
		);

		nodeAnimate.mockClear();
		childAnimate.mockClear();
		skipHide(node);
		expect(modalHide(node).duration).toBe(0);
		expect(nodeAnimate).not.toHaveBeenCalled();
		expect(childAnimate).not.toHaveBeenCalled();
	});
});
