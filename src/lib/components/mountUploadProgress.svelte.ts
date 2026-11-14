import { mount, unmount } from 'svelte';
import UploadProgress from './UploadProgress.svelte';
import { activeTheme } from '$lib/themes/index.svelte';
import { play } from '$lib/motion';

export interface UploadProgressProps {
	progress?: number;
	processing?: boolean;
	queued?: boolean;
	size?: 'sm' | 'md' | 'lg';
	oncancel?: () => void;
}

export interface UploadProgressHandle {
	update(patch: Partial<UploadProgressProps>): void;
	finish(): Promise<void>;
	destroy(): void;
}

/**
 * Монтирует единый компонент прогресса загрузки внутрь императивного DOM-контейнера
 * (инструменты EditorJS). Контейнер должен иметь `position: relative`.
 */
export function mountUploadProgress(target: HTMLElement, initial: UploadProgressProps = {}): UploadProgressHandle {
	const props = $state<UploadProgressProps>({
		progress: 0,
		processing: false,
		queued: false,
		size: 'md',
		...initial
	});

	const host = document.createElement('div');
	host.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;';
	target.appendChild(host);

	const instance = mount(UploadProgress, { target: host, props });
	let destroyed = false;

	return {
		update(patch) {
			if (destroyed) return;
			Object.assign(props, patch);
		},
		async finish() {
			if (destroyed) return;
			const overlay = host.firstElementChild;
			const anim = overlay ? play(overlay, activeTheme.motion?.uploadOut, 'forwards') : undefined;
			if (anim) await anim.finished.catch(() => {});
			this.destroy();
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			void unmount(instance);
			host.remove();
		}
	};
}
