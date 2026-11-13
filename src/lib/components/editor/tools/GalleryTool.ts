import { uploadToFile } from '../upload';

type Item = { file: Awaited<ReturnType<typeof uploadToFile>>; caption: string };

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

	private items: Item[];
	private grid = document.createElement('div');
	private status = document.createElement('div');
	private onChange: () => void;

	constructor({ data, block }: { data: { items?: Item[] }; block?: { dispatchChange(): void } }) {
		this.items = data?.items ?? [];
		this.onChange = () => block?.dispatchChange();
	}

	render() {
		const wrapper = document.createElement('div');
		wrapper.classList.add('dtf-gallery-tool');
		this.grid.classList.add('dtf-gallery-tool-grid');
		this.status.classList.add('dtf-gallery-tool-status');

		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		input.accept = 'image/*, video/mp4, video/webm, image/gif, video/quicktime';
		input.style.display = 'none';
		input.addEventListener('change', () => this.upload([...(input.files ?? [])]).then(() => (input.value = '')));

		const add = document.createElement('button');
		add.type = 'button';
		add.classList.add('dtf-quiz-tool-add-btn');
		add.textContent = '+ Добавить';
		add.addEventListener('click', () => input.click());

		wrapper.append(this.grid, this.status, add, input);
		this.renderItems();
		return wrapper;
	}

	private async upload(files: File[]) {
		for (const [i, file] of files.entries()) {
			this.status.textContent = `Загрузка ${i + 1} из ${files.length}…`;
			try {
				this.items.push({ file: await uploadToFile(file), caption: '' });
				this.renderItems();
			} catch (e) {
				console.error('Gallery upload failed', e);
				this.status.textContent = `Не удалось загрузить «${file.name}»`;
				this.onChange();
				return;
			}
		}
		this.status.textContent = '';
		this.onChange();
	}

	private renderItems() {
		this.grid.replaceChildren(
			...this.items.map((item, index) => {
				const cell = document.createElement('div');
				cell.classList.add('dtf-gallery-tool-item');

				const media = document.createElement(item.file.isVideo ? 'video' : 'img');
				media.classList.add('dtf-gallery-tool-media');
				media.src = item.file.url;
				if (media instanceof HTMLVideoElement) Object.assign(media, { muted: true, loop: true, autoplay: true, playsInline: true });

				const caption = document.createElement('input');
				caption.type = 'text';
				caption.classList.add('dtf-person-tool-input');
				caption.placeholder = 'Подпись';
				caption.value = item.caption;
				caption.addEventListener('input', () => {
					item.caption = caption.value;
					this.onChange();
				});

				const remove = document.createElement('button');
				remove.type = 'button';
				remove.classList.add('dtf-quiz-tool-option-remove');
				remove.textContent = '×';
				remove.addEventListener('click', () => {
					this.items.splice(index, 1);
					this.renderItems();
					this.onChange();
				});

				cell.append(media, caption, remove);
				return cell;
			})
		);
	}

	validate(data: { items: Item[] }) {
		return data.items.length > 0;
	}

	save() {
		return { items: this.items };
	}
}
