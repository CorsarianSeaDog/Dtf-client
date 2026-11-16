import { describe, it, expect, vi, afterEach } from 'vitest';
import { lazyVideo, resumeLazyVideos } from './lazyVideo';

describe('lazyVideo', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('не запускает видео во время перехода и перепроверяет его после resumeLazyVideos()', () => {
		let notify!: (entries: Partial<IntersectionObserverEntry>[]) => void;
		const video = { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), closest: () => null } as unknown as HTMLVideoElement;
		const visible = () => notify([{ target: video, isIntersecting: true }]);
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				constructor(cb: typeof notify) {
					notify = cb;
				}
				// Как в браузере: каждый observe присылает текущую видимость
				observe = visible;
				unobserve() {}
				disconnect() {}
			}
		);
		let transitioning = true;
		vi.stubGlobal('document', { documentElement: { hasAttribute: () => transitioning } });

		const action = lazyVideo(video);
		expect(video.poster).toMatch(/^data:image\/gif;base64,/);
		expect(video.play).not.toHaveBeenCalled();

		transitioning = false;
		resumeLazyVideos();
		expect(video.play).toHaveBeenCalledTimes(1);
		action.destroy();
	});

	it('сохраняет уже заданный poster у видео', () => {
		const video = { poster: 'https://example.com/poster.jpg', play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), closest: () => null } as unknown as HTMLVideoElement;
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				observe() {}
				unobserve() {}
				disconnect() {}
			}
		);

		const action = lazyVideo(video);
		expect(video.poster).toBe('https://example.com/poster.jpg');
		action.destroy();
	});
});
