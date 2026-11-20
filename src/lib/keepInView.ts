import type { Attachment } from 'svelte/attachments';
import { scrollBehavior } from './motion';

// В браузере нет события окончания открытия клавиатуры. Ждём паузу в изменениях окна и прокрутке.
const VIEWPORT_QUIET_MS = 320;

/** Ставим редактор над клавиатурой при входе в поле. Дальше за кареткой следит браузер. */
export const keepInView: Attachment<HTMLElement> = (node) => {
	const vv = window.visualViewport;
	const viewport = vv ?? window;
	const touch = matchMedia('(pointer: coarse)').matches;
	const listeners = new AbortController();
	const options = { signal: listeners.signal, passive: true };
	let timer: ReturnType<typeof setTimeout> | undefined;
	let armed = true;
	let nativeKeyboard: 'hidden' | 'opening' | 'shown' = 'hidden';
	let expandedHeight = vv?.height ?? innerHeight;
	let height = 0;

	function cancel() {
		clearTimeout(timer);
		timer = undefined;
	}
	function release() {
		cancel();
		armed = false;
	}
	function reveal() {
		cancel();
		// С аппаратной или ещё не открывшейся клавиатурой достаточно показать поле у ближайшего края.
		// Если IME появится позже, её собственное событие всё ещё сможет завершить выравнивание.
		const keyboardShown = nativeKeyboard === 'shown' || height < Math.max(expandedHeight, window.innerHeight);
		if (!touch || keyboardShown) armed = false;
		const input = document.activeElement;
		if (!(input instanceof HTMLElement) || !input.isContentEditable || !node.contains(input)) return;

		const style = getComputedStyle(node);
		const viewTop = vv?.offsetTop ?? 0;
		const min = viewTop + (parseFloat(style.scrollMarginTop) || 0);
		const max = viewTop + height - (parseFloat(style.scrollMarginBottom) || 0);
		if (max <= min) return;
		// После центрирования короткое поле сможет расти вниз, пока над клавиатурой помещаются и кнопки.
		node.style.setProperty('--comment-controls-height', `${node.offsetHeight - input.offsetHeight}px`);
		const editor = node.getBoundingClientRect();
		// Если вложения заняли остаток экрана, в видимой зоне важнее сам текст.
		const { top, bottom } = editor.height <= max - min ? editor : input.getBoundingClientRect();
		const dy = touch && keyboardShown
			? (top + bottom - min - max) / 2
			: Math.min(0, top - min) + Math.max(0, bottom - max);
		if (Math.abs(dy) >= 1) scrollBy({ top: dy, behavior: touch ? scrollBehavior() : 'instant' });
	}

	function schedule() {
		if (!armed || nativeKeyboard === 'opening' || !node.contains(document.activeElement)) return;
		cancel();
		timer = setTimeout(reveal, touch ? VIEWPORT_QUIET_MS : 0);
	}
	function settle() {
		if (timer !== undefined) schedule();
	}
	function resize() {
		const next = vv?.height ?? innerHeight;
		if (next === height) return;
		if (next < height) schedule();
		else settle();
		expandedHeight = node.contains(document.activeElement) ? Math.max(expandedHeight, next) : next;
		height = next;
		node.style.setProperty('--comment-viewport-height', `${height}px`);
	}
	const hold = () => {
		armed = true;
		schedule();
	};

	node.addEventListener('focusin', hold, options);
	node.addEventListener('focusout', release, options);
	node.addEventListener('pointerdown', () => { armed = true; }, options);
	for (const type of ['touchmove', 'wheel']) window.addEventListener(type, release, options);
	window.addEventListener('scroll', settle, options);
	vv?.addEventListener('scroll', settle, options);
	viewport.addEventListener('resize', resize, options);
	// Capacitor сообщает границы анимации IME. Внутри неё WebView ещё сам двигает страницу к каретке.
	window.addEventListener('keyboardWillShow', () => {
		nativeKeyboard = 'opening';
		cancel();
	}, options);
	window.addEventListener('keyboardDidShow', () => {
		nativeKeyboard = 'shown';
		schedule();
	}, options);
	window.addEventListener('keyboardWillHide', () => {
		nativeKeyboard = 'hidden';
		release();
	}, options);
	resize();
	hold();

	return () => {
		cancel();
		listeners.abort();
	};
};
