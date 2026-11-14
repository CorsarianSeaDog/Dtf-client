import { activeTheme } from '$lib/themes/index.svelte';
import { play } from '$lib/motion';
import { mountUploadProgress, type UploadProgressHandle } from '$lib/components/mountUploadProgress.svelte';
import { createMediaEl, isAbortError, uploadToFile, waitMediaReady } from '../upload';

type Item = { file: Awaited<ReturnType<typeof uploadToFile>>; caption: string };

type PendingState = {
	file: File;
	caption: string;
	previewUrl: string;
	previewEl: HTMLElement;
	controller: AbortController;
	progress: UploadProgressHandle;
};

type Entry = {
	el: HTMLElement;
	mediaWrap: HTMLElement;
	item?: Item;
	pending?: PendingState;
};

const GALLERY_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
	<rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
	<rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
	<rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
	<rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
</svg>`;

const ADD_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
	<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

function pluralFiles(n: number): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	if (mod10 === 1 && mod100 !== 11) return 'файл';
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'файла';
	return 'файлов';
}

/** Галерея DTF: один блок media с несколькими картинками, гифками или видео */
export default class GalleryTool {
	static get toolbox() {
		return {
			title: 'Галерея',
			icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
					<rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
					<rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
					<rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
				   </svg>`
		};
	}

	private entries: Entry[] = [];
	private initialItems: Item[];
	private countEl = document.createElement('span');
	private emptyEl = document.createElement('button');
	private grid = document.createElement('div');
	private addBtn = document.createElement('button');
	private status = document.createElement('div');
	private onChange: () => void;
	private draining = false;
	private destroyed = false;

	constructor({ data, block }: { data: { items?: Item[] }; block?: { dispatchChange(): void } }) {
		this.initialItems = data?.items ?? [];
		this.onChange = () => block?.dispatchChange();
	}

	render() {
		const wrapper = document.createElement('div');
		wrapper.classList.add('dtf-gallery-tool');

		const header = document.createElement('div');
		header.classList.add('dtf-gallery-tool-header');

		const titleRow = document.createElement('div');
		titleRow.classList.add('dtf-gallery-tool-title-row');

		const icon = document.createElement('span');
		icon.classList.add('dtf-gallery-tool-icon');
		icon.setAttribute('aria-hidden', 'true');
		icon.innerHTML = GALLERY_ICON;

		const title = document.createElement('span');
		title.classList.add('dtf-gallery-tool-title');
		title.textContent = 'Галерея';

		this.countEl.classList.add('dtf-gallery-tool-count');
		this.status.classList.add('dtf-gallery-tool-status');
		titleRow.append(icon, title, this.countEl);
		header.append(titleRow, this.status);

		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		input.accept = 'image/*, video/mp4, video/webm, image/gif, video/quicktime';
		input.style.display = 'none';
		input.addEventListener('change', () => {
			const files = [...(input.files ?? [])];
			input.value = '';
			if (files.length) this.enqueue(files);
		});

		const pickFiles = () => input.click();

		this.emptyEl.type = 'button';
		this.emptyEl.classList.add('dtf-gallery-tool-empty');
		this.emptyEl.innerHTML = `
			<span class="dtf-gallery-tool-empty-icon" aria-hidden="true">${GALLERY_ICON}</span>
			<span class="dtf-gallery-tool-empty-title">Добавить фото, GIF или видео</span>
			<span class="dtf-gallery-tool-empty-hint">Можно выбрать несколько файлов или перетащить сюда</span>
		`;
		this.emptyEl.addEventListener('click', pickFiles);

		this.grid.classList.add('dtf-gallery-tool-grid');

		this.addBtn.type = 'button';
		this.addBtn.classList.add('dtf-gallery-tool-add');
		this.addBtn.innerHTML = `${ADD_ICON}<span>Добавить ещё фото или видео</span>`;
		this.addBtn.addEventListener('click', pickFiles);

		let dragDepth = 0;
		const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types?.includes('Files'));
		wrapper.addEventListener('dragenter', (e) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			dragDepth++;
			wrapper.classList.add('dtf-gallery-tool--dragover');
		});
		wrapper.addEventListener('dragover', (e) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
		});
		wrapper.addEventListener('dragleave', (e) => {
			if (!hasFiles(e)) return;
			dragDepth = Math.max(0, dragDepth - 1);
			if (dragDepth === 0) wrapper.classList.remove('dtf-gallery-tool--dragover');
		});
		wrapper.addEventListener('drop', (e) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			e.stopPropagation();
			dragDepth = 0;
			wrapper.classList.remove('dtf-gallery-tool--dragover');
			const files = [...(e.dataTransfer?.files ?? [])].filter(
				(f) => f.type.startsWith('image/') || f.type.startsWith('video/')
			);
			if (files.length) this.enqueue(files);
		});

		wrapper.append(header, this.emptyEl, this.grid, this.addBtn, input);

		this.entries = this.initialItems.map((item) => this.createReadyEntry(item));
		this.grid.replaceChildren(...this.entries.map((e) => e.el));
		this.syncMeta();
		this.syncVisibility();
		return wrapper;
	}

	private syncMeta() {
		const count = this.entries.length;
		this.countEl.textContent = count > 0 ? `${count} ${pluralFiles(count)}` : 'Пусто';
	}

	private syncVisibility() {
		const hasItems = this.entries.length > 0 || this.grid.childElementCount > 0;
		this.emptyEl.hidden = hasItems;
		this.grid.hidden = !hasItems;
		this.addBtn.hidden = !hasItems;
	}

	private createCell(captionValue: string, onCaption: (val: string) => void, onRemove: () => void) {
		const el = document.createElement('div');
		el.classList.add('dtf-gallery-tool-item');

		const mediaWrap = document.createElement('div');
		mediaWrap.classList.add('dtf-gallery-tool-media-wrap');

		const caption = document.createElement('input');
		caption.type = 'text';
		caption.classList.add('dtf-gallery-tool-caption');
		caption.placeholder = 'Подпись';
		caption.value = captionValue;
		caption.addEventListener('input', () => onCaption(caption.value));

		const remove = document.createElement('button');
		remove.type = 'button';
		remove.classList.add('dtf-gallery-tool-remove');
		remove.ariaLabel = 'Удалить из галереи';
		remove.title = 'Удалить';
		remove.textContent = '×';
		remove.addEventListener('click', onRemove);

		mediaWrap.appendChild(remove);
		el.append(mediaWrap, caption);
		return { el, mediaWrap };
	}

	private createReadyEntry(item: Item): Entry {
		const entry: Entry = {
			item,
			...this.createCell(
				item.caption,
				(val) => {
					if (entry.item) {
						entry.item.caption = val;
						this.onChange();
					}
				},
				() => this.removeEntry(entry)
			)
		};
		const media = createMediaEl(item.file.url, !!item.file.isVideo, 'dtf-gallery-tool-media');
		entry.mediaWrap.insertBefore(media, entry.mediaWrap.firstChild);
		return entry;
	}

	private createPendingEntry(file: File): Entry {
		const controller = new AbortController();
		const previewUrl = URL.createObjectURL(file);
		const isVideo = file.type.startsWith('video/');
		const previewEl = createMediaEl(previewUrl, isVideo, 'dtf-gallery-tool-media', true);

		const entry: Entry = {
			...this.createCell(
				'',
				(val) => {
					// Обработчики держат ссылку на один объект entry на весь его жизненный цикл
					if (entry.item) {
						entry.item.caption = val;
						this.onChange();
					} else if (entry.pending) {
						entry.pending.caption = val;
					}
				},
				() => this.removeEntry(entry)
			)
		};

		entry.mediaWrap.insertBefore(previewEl, entry.mediaWrap.firstChild);
		entry.pending = {
			file,
			caption: '',
			previewUrl,
			previewEl,
			controller,
			progress: mountUploadProgress(entry.mediaWrap, { size: 'md', queued: true })
		};
		return entry;
	}

	private enqueue(files: File[]) {
		this.status.textContent = '';
		for (const file of files) {
			const entry = this.createPendingEntry(file);
			this.entries.push(entry);
			this.grid.appendChild(entry.el);
			play(entry.el, activeTheme.motion?.uploadIn);
		}
		this.syncMeta();
		this.syncVisibility();
		if (!this.draining) void this.drainQueue();
	}

	private async drainQueue() {
		this.draining = true;
		let completed = 0;

		try {
			while (!this.destroyed) {
				const entry = this.entries.find((e) => e.pending !== undefined);
				const pending = entry?.pending;
				if (!entry || !pending) break;

				const remaining = this.entries.filter((e) => e.pending !== undefined).length;
				const total = completed + remaining;
				this.status.textContent = total > 1 ? `Загрузка ${completed + 1} из ${total}…` : 'Загрузка…';
				pending.progress.update({ queued: false, progress: 0, processing: false });

				try {
					const uploaded = await uploadToFile(pending.file, {
						signal: pending.controller.signal,
						onProgress: (info) => {
							pending.progress.update({
								progress: info.progress,
								processing: !!info.processing
							});
						}
					});

					if (this.destroyed || pending.controller.signal.aborted) continue;

					pending.progress.update({ progress: 1, processing: true });

					// Сначала прогружаем финальное медиа за оверлеем, затем плавно снимаем оверлей
					const media = createMediaEl(uploaded.url, !!uploaded.isVideo, 'dtf-gallery-tool-media');
					entry.mediaWrap.insertBefore(media, pending.previewEl);
					await waitMediaReady(media);
					if (this.destroyed || pending.controller.signal.aborted || !this.entries.includes(entry)) {
						media.remove();
						continue;
					}

					entry.item = { file: uploaded, caption: pending.caption };
					entry.pending = undefined;
					pending.previewEl.remove();
					URL.revokeObjectURL(pending.previewUrl);
					play(media, activeTheme.motion?.mediaIn);
					void pending.progress.finish();

					completed++;
					this.onChange();
				} catch (err) {
					if (this.destroyed) break;
					if (pending.controller.signal.aborted || isAbortError(err)) {
						this.cleanupPending(entry, pending);
						continue;
					}
					console.error('Gallery upload failed', err);
					this.abortAllPending();
					this.status.textContent = `Не удалось загрузить «${pending.file.name}»`;
					this.onChange();
					return;
				}
			}

			if (!this.destroyed) this.status.textContent = '';
		} finally {
			this.draining = false;
		}
	}

	private cleanupPending(entry: Entry, pending = entry.pending) {
		if (!pending) return;
		pending.progress.destroy();
		URL.revokeObjectURL(pending.previewUrl);
		entry.pending = undefined;
		const idx = this.entries.indexOf(entry);
		if (idx !== -1) this.entries.splice(idx, 1);
		entry.el.remove();
		this.syncMeta();
		this.syncVisibility();
	}

	private abortAllPending() {
		for (const entry of [...this.entries]) {
			if (entry.pending) {
				entry.pending.controller.abort();
				this.cleanupPending(entry);
			}
		}
	}

	private removeEntry(entry: Entry) {
		const idx = this.entries.indexOf(entry);
		if (idx === -1) return;
		this.entries.splice(idx, 1);

		if (entry.pending) {
			entry.pending.controller.abort();
			entry.pending.progress.destroy();
			URL.revokeObjectURL(entry.pending.previewUrl);
			entry.pending = undefined;
		}
		if (entry.item) {
			this.onChange();
		}

		this.syncMeta();
		const anim = play(entry.el, activeTheme.motion?.uploadOut, 'forwards');
		if (anim) {
			void anim.finished.catch(() => {}).then(() => {
				entry.el.remove();
				this.syncVisibility();
			});
		} else {
			entry.el.remove();
			this.syncVisibility();
		}
	}

	validate(data: { items: Item[] }) {
		return data.items.length > 0;
	}

	save() {
		return {
			items: this.entries.filter((e): e is Entry & { item: Item } => Boolean(e.item)).map((e) => e.item)
		};
	}

	destroy() {
		this.destroyed = true;
		this.abortAllPending();
	}
}
