import type { Attachment } from 'svelte/attachments';
import { getAnimatedVideoUrl } from '$lib/api/utils';
import { reducedMotion } from '$lib/motion';
import { settings } from '$lib/storage/settings.svelte';

const MAX_ACTIVE_VIDEOS = 8;
const SCROLL_DEBOUNCE_MS = 120;
const HOVER_DEBOUNCE_MS = 80;

interface AvatarEntry {
	node: HTMLElement;
	videoUrl: string;
	visible: boolean;
	timer: ReturnType<typeof setTimeout> | null;
	video: HTMLVideoElement | null;
	cleanupStyle: (() => void) | null;
}

const entries = new Map<HTMLElement, AvatarEntry>();
const observedImages = new Map<Element, AvatarEntry>();
const active = new Set<AvatarEntry>();
const waiting: AvatarEntry[] = [];
const videoPool: HTMLVideoElement[] = [];

let observer: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let visibilityAttached = false;

function handleVisibilityChange() {
	for (const entry of active) {
		if (!entry.video) continue;
		if (document.hidden) entry.video.pause();
		else entry.video.play().catch(() => {});
	}
}

function ensureVisibilityListener() {
	if (visibilityAttached || typeof document === 'undefined') return;
	document.addEventListener('visibilitychange', handleVisibilityChange);
	visibilityAttached = true;
}

function releaseVisibilityListenerIfIdle() {
	if (!visibilityAttached || entries.size > 0 || active.size > 0) return;
	document.removeEventListener('visibilitychange', handleVisibilityChange);
	visibilityAttached = false;
}

function acquireVideo(): HTMLVideoElement {
	const video = videoPool.pop() ?? document.createElement('video');
	video.muted = true;
	video.loop = true;
	video.playsInline = true;
	video.preload = 'auto';
	video.setAttribute('aria-hidden', 'true');
	return video;
}

function releaseVideo(video: HTMLVideoElement) {
	video.pause();
	video.onloadeddata = null;
	video.onerror = null;
	video.removeAttribute('src');
	video.load();
	video.remove();
	video.style.cssText = '';
	if (videoPool.length < MAX_ACTIVE_VIDEOS) {
		videoPool.push(video);
	}
}

function measureImgLayer(node: HTMLImageElement, parent: HTMLElement) {
	const cs = getComputedStyle(node);
	const parentRect = parent.getBoundingClientRect();
	const nodeRect = node.getBoundingClientRect();
	return {
		left: nodeRect.left - parentRect.left - parent.clientLeft + node.clientLeft,
		top: nodeRect.top - parentRect.top - parent.clientTop + node.clientTop,
		width: node.clientWidth || nodeRect.width,
		height: node.clientHeight || nodeRect.height,
		borderRadius: cs.borderRadius,
		opacity: cs.opacity || '1',
		filter: cs.filter !== 'none' ? cs.filter : ''
	};
}

function applyImgRect(
	video: HTMLVideoElement,
	rect: Pick<ReturnType<typeof measureImgLayer>, 'left' | 'top' | 'width' | 'height' | 'borderRadius'>
) {
	video.style.left = `${rect.left}px`;
	video.style.top = `${rect.top}px`;
	video.style.width = `${rect.width}px`;
	video.style.height = `${rect.height}px`;
	video.style.borderRadius = rect.borderRadius;
}

function getResizeObserver(): ResizeObserver | null {
	if (typeof ResizeObserver === 'undefined') return null;
	if (!resizeObserver) {
		resizeObserver = new ResizeObserver((roEntries) => {
			// Сначала читаем геометрию всех изменившихся узлов, потом пишем стили — без layout thrashing
			const updates: { video: HTMLVideoElement; rect: ReturnType<typeof measureImgLayer> }[] = [];
			for (const roEntry of roEntries) {
				const entry = observedImages.get(roEntry.target);
				if (!entry?.video || !(entry.node instanceof HTMLImageElement)) continue;
				const parent = entry.node.parentElement;
				if (!parent) continue;
				updates.push({ video: entry.video, rect: measureImgLayer(entry.node, parent) });
			}
			for (const { video, rect } of updates) {
				applyImgRect(video, rect);
			}
		});
	}
	return resizeObserver;
}

function applyVideoLayer(
	entry: AvatarEntry,
	video: HTMLVideoElement
): { cleanup: () => void; initialOpacity: string } | null {
	const { node } = entry;

	video.style.position = 'absolute';
	video.style.objectFit = 'cover';
	video.style.pointerEvents = 'none';
	video.style.opacity = '0';
	video.style.transition = 'opacity 0.12s';

	if (node instanceof HTMLImageElement) {
		const parent = node.parentElement;
		if (!parent) return null;

		// Читаем все стили и геометрию до любых записей в DOM, чтобы не вызывать forced reflow
		const parentCs = getComputedStyle(parent);
		const rect = measureImgLayer(node, parent);

		const prevPos = parent.style.position;
		const changedPos = parentCs.position === 'static';
		if (changedPos) parent.style.position = 'relative';

		applyImgRect(video, rect);
		video.style.filter = rect.filter;

		node.after(video);
		observedImages.set(node, entry);
		getResizeObserver()?.observe(node);

		return {
			initialOpacity: rect.opacity,
			cleanup: () => {
				observedImages.delete(node);
				resizeObserver?.unobserve(node);
				if (observedImages.size === 0 && resizeObserver) {
					resizeObserver.disconnect();
					resizeObserver = null;
				}
				if (changedPos) parent.style.position = prevPos;
			}
		};
	}

	const cs = getComputedStyle(node);
	const prevPos = node.style.position;
	const prevOverflow = node.style.overflow;
	const changedPos = cs.position === 'static';
	const changedOverflow = cs.overflow !== 'hidden';
	if (changedPos) node.style.position = 'relative';
	if (changedOverflow) node.style.overflow = 'hidden';

	video.style.inset = '0';
	video.style.width = '100%';
	video.style.height = '100%';
	video.style.borderRadius = 'inherit';

	node.append(video);
	return {
		initialOpacity: '1',
		cleanup: () => {
			if (changedPos) node.style.position = prevPos;
			if (changedOverflow) node.style.overflow = prevOverflow;
		}
	};
}

function countActiveByUrl(videoUrl: string): number {
	let count = 0;
	for (const e of active) {
		if (e.videoUrl === videoUrl) count++;
	}
	return count;
}

function findDuplicateToPreempt(): AvatarEntry | null {
	const counts = new Map<string, number>();
	for (const e of active) {
		counts.set(e.videoUrl, (counts.get(e.videoUrl) ?? 0) + 1);
	}
	let best: AvatarEntry | null = null;
	let bestCount = 1;
	for (const e of active) {
		const count = counts.get(e.videoUrl) ?? 0;
		if (count > bestCount) {
			best = e;
			bestCount = count;
		}
	}
	return best;
}

function detachVideo(entry: AvatarEntry) {
	if (!entry.video) return;
	const video = entry.video;
	entry.video = null;
	active.delete(entry);
	releaseVideo(video);
	entry.cleanupStyle?.();
	entry.cleanupStyle = null;
}

function mountEntry(entry: AvatarEntry) {
	if (entry.video || !entry.node.isConnected) return;
	if (entry.node instanceof HTMLImageElement && !entry.node.parentElement) return;

	if (active.size >= MAX_ACTIVE_VIDEOS) {
		// Не даём дубликатам одного автора (например, в ветке комментариев) вытеснить других уникальных авторов
		const dup = countActiveByUrl(entry.videoUrl) === 0 ? findDuplicateToPreempt() : null;
		if (dup) {
			detachVideo(dup);
			if (dup.visible && dup.node.isConnected && !waiting.includes(dup)) {
				waiting.push(dup);
			}
		} else {
			if (!waiting.includes(entry)) waiting.push(entry);
			return;
		}
	}

	const video = acquireVideo();
	const layer = applyVideoLayer(entry, video);
	if (!layer || !video.isConnected) {
		releaseVideo(video);
		layer?.cleanup();
		return;
	}

	entry.video = video;
	entry.cleanupStyle = layer.cleanup;
	active.add(entry);
	ensureVisibilityListener();

	const reveal = (sync = false) => {
		if (entry.video !== video) return;
		if (entry.node instanceof HTMLImageElement) {
			if (sync) {
				video.style.opacity = layer.initialOpacity;
			} else {
				const cs = getComputedStyle(entry.node);
				video.style.opacity = cs.opacity || '1';
				video.style.filter = cs.filter !== 'none' ? cs.filter : '';
			}
		} else {
			video.style.opacity = '1';
		}
	};

	video.onloadeddata = () => reveal(false);
	video.onerror = () => {
		if (entry.video === video) unmountEntry(entry);
	};
	video.src = entry.videoUrl;

	if (video.readyState >= 2) reveal(true);
	if (!document.hidden) video.play().catch(() => {});
}

function takeNextWaiting(): AvatarEntry | undefined {
	while (waiting.length > 0) {
		const uniqueIndex = waiting.findIndex(
			(e) => e.visible && e.node.isConnected && countActiveByUrl(e.videoUrl) === 0
		);
		const idx = uniqueIndex !== -1 ? uniqueIndex : 0;
		const [next] = waiting.splice(idx, 1);
		if (next.visible && next.node.isConnected) return next;
	}
	return undefined;
}

function unmountEntry(entry: AvatarEntry) {
	if (entry.timer !== null) {
		clearTimeout(entry.timer);
		entry.timer = null;
	}

	const waitIndex = waiting.indexOf(entry);
	if (waitIndex !== -1) waiting.splice(waitIndex, 1);

	if (!entry.video) return;
	detachVideo(entry);

	while (active.size < MAX_ACTIVE_VIDEOS && waiting.length > 0) {
		const next = takeNextWaiting();
		if (next) mountEntry(next);
	}
}

function scheduleMount(entry: AvatarEntry, delayMs: number) {
	if (entry.timer !== null || entry.video) return;
	entry.timer = setTimeout(() => {
		entry.timer = null;
		if (entry.visible && entry.node.isConnected) {
			mountEntry(entry);
		}
	}, delayMs);
}

function getObserver(): IntersectionObserver | null {
	if (typeof IntersectionObserver === 'undefined') return null;
	if (!observer) {
		observer = new IntersectionObserver(
			(ioEntries) => {
				for (const ioEntry of ioEntries) {
					const entry = entries.get(ioEntry.target as HTMLElement);
					if (!entry) continue;

					if (ioEntry.isIntersecting) {
						if (entry.visible) continue;
						entry.visible = true;
						scheduleMount(entry, SCROLL_DEBOUNCE_MS);
					} else {
						entry.visible = false;
						unmountEntry(entry);
					}
				}
			},
			{ rootMargin: '50px' }
		);
	}
	return observer;
}

/**
 * Подключает видео-анимацию для анимированных аватарок (с ленивым монтированием во вьюпорте,
 * антидребезгом скролла и общим пулом декодеров). Для статичных аватарок возвращает `undefined`.
 */
export function animatedAvatar(url?: string, isProfile = false): Attachment<HTMLElement> | undefined {
	const videoUrl = getAnimatedVideoUrl(url);
	if (!videoUrl) return undefined;

	const mode = settings.value.animatedAvatars;
	if (mode === 'off' || reducedMotion()) return undefined;

	if (mode === 'hover' && !isProfile) {
		return (node: HTMLElement) => {
			const entry: AvatarEntry = {
				node,
				videoUrl,
				visible: false,
				timer: null,
				video: null,
				cleanupStyle: null
			};
			const hoverTarget = (node.closest('a, button') as HTMLElement) ?? node;

			const onEnter = (e: PointerEvent) => {
				if (e.pointerType === 'touch') return;
				entry.visible = true;
				scheduleMount(entry, HOVER_DEBOUNCE_MS);
			};

			const onLeave = (e: PointerEvent) => {
				if (e.pointerType === 'touch') return;
				entry.visible = false;
				unmountEntry(entry);
				releaseVisibilityListenerIfIdle();
			};

			hoverTarget.addEventListener('pointerenter', onEnter);
			hoverTarget.addEventListener('pointerleave', onLeave);

			return () => {
				hoverTarget.removeEventListener('pointerenter', onEnter);
				hoverTarget.removeEventListener('pointerleave', onLeave);
				entry.visible = false;
				unmountEntry(entry);
				releaseVisibilityListenerIfIdle();
			};
		};
	}

	return (node: HTMLElement) => {
		const entry: AvatarEntry = {
			node,
			videoUrl,
			visible: false,
			timer: null,
			video: null,
			cleanupStyle: null
		};
		entries.set(node, entry);

		const io = getObserver();
		if (io) {
			io.observe(node);
		} else {
			entry.visible = true;
			mountEntry(entry);
		}

		return () => {
			entries.delete(node);
			observer?.unobserve(node);
			entry.visible = false;
			unmountEntry(entry);
			if (entries.size === 0 && observer) {
				observer.disconnect();
				observer = null;
			}
			releaseVisibilityListenerIfIdle();
		};
	};
}
