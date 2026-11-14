let observer: IntersectionObserver | null = null;
const videos = new Set<HTMLVideoElement>();

// Пока идёт переход страниц или анимация показа, видео не стартуют: смена кадров под размытием роняет FPS
const held = (node: HTMLVideoElement) =>
	document.documentElement.hasAttribute('data-transitioning') || !!node.closest('[data-animating], .staging');

/** После анимации: наблюдатель на повторный observe заново присылает видимость каждого видео, видимые запускаются */
export function resumeLazyVideos() {
	for (const video of videos) {
		observer?.unobserve(video);
		observer?.observe(video);
	}
}

export function lazyVideo(node: HTMLVideoElement) {
	if (!observer) {
		observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				const target = entry.target as HTMLVideoElement;
				if (!entry.isIntersecting) target.pause();
				else if (!held(target)) target.play()?.catch(() => {});
			}
		}, { rootMargin: '200px' });
	}

	observer.observe(node);
	videos.add(node);

	return {
		destroy: () => {
			videos.delete(node);
			observer?.unobserve(node);
			if (!videos.size) {
				observer?.disconnect();
				observer = null;
			}
		}
	};
}
