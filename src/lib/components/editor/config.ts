import type { EditorConfig } from '@editorjs/editorjs';
import SpoilerTune from './tools/SpoilerTune';
import AnchorTune from './tools/AnchorTune';
import QuizTool from './tools/QuizTool';
import PersonTool from './tools/PersonTool';
import GalleryTool from './tools/GalleryTool';
import { createImageTool } from './tools/ImageTool';

function createCustomList(List: any) {
	return class CustomList extends List {
		static get toolbox() {
			const tools = super.toolbox;
			if (Array.isArray(tools)) {
				return tools.filter((t: any) => t.data?.style !== 'checklist');
			}
			return tools;
		}
		
		renderSettings() {
			const settings = super.renderSettings();
			if (Array.isArray(settings)) {
				return settings.filter((s: any) => s.label !== 'Checklist' && s.title !== 'Checklist' && s.name !== 'checklist');
			}
			return settings;
		}
	};
}

export async function getEditorConfig(): Promise<{ tools: EditorConfig['tools'], tunes: string[] }> {
	const Header = (await import('@editorjs/header')).default;
	const List = (await import('@editorjs/list')).default;
	const Quote = (await import('@editorjs/quote')).default;
	const Delimiter = (await import('@editorjs/delimiter')).default;
	const Code = (await import('@editorjs/code')).default;
	const ImageTool = (await import('@editorjs/image')).default;

	const CustomList = createCustomList(List);
	const ProgressImageTool = createImageTool(ImageTool);

	return {
		tunes: ['spoiler', 'anchor'],
		tools: {
			// На DTF только h2 и h3
			header: { class: Header, config: { levels: [2, 3], defaultLevel: 2 } },
			// Список на DTF плоский: вложенность при сохранении пропала бы
			list: { class: CustomList as any, config: { maxLevel: 1 } },
			quote: Quote,
			delimiter: Delimiter,
			code: Code,
			image: {
				class: ProgressImageTool as any,
				config: {
					types: 'image/*, video/mp4, video/webm, image/gif, video/quicktime',
					features: { border: false, background: false, stretch: false },
					endpoints: {
						byFile: ''
					}
				}
			},
			gallery: GalleryTool,
			spoiler: SpoilerTune,
			anchor: AnchorTune,
			quiz: {
				class: QuizTool,
				inlineToolbar: true
			},
			person: {
				class: PersonTool,
				inlineToolbar: true
			}
		}
	};
}
