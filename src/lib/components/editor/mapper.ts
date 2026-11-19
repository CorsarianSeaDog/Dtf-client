import type { DtfEditorBlock, DtfEditorEntry } from '$lib/api/types';
import type { OutputData, OutputBlockData } from '@editorjs/editorjs';
import { buildEditorEntry, getLeonardoUrl } from '$lib/api/utils';

type EditorJsToDtfMapper = (block: OutputBlockData) => Pick<DtfEditorBlock, 'type' | 'data'> | null;
type DtfToEditorJsMapper = (block: DtfEditorBlock) => Pick<OutputBlockData, 'type' | 'data'> | null;

const editorJsToDtfRegistry: Record<string, EditorJsToDtfMapper> = {
	paragraph: (block) => ({
		type: 'text',
		data: { text: `<p>${block.data.text}</p>` }
	}),
	header: (block) => ({
		type: 'header',
		data: { style: `h${block.data.level || 2}`, text: block.data.text }
	}),
	list: (block) => ({
		type: 'list',
		data: {
			items: Array.isArray(block.data.items) ? block.data.items.map((item: any) => {
				if (typeof item === 'string') return item;
				if (item && typeof item === 'object') return item.content || item.text || '';
				return String(item);
			}) : [],
			type: block.data.style === 'ordered' ? 'OL' : 'UL'
		}
	}),
	quote: (block) => ({
		type: 'quote',
		data: {
			text: `<p>${block.data.text}</p>`,
			subline1: block.data.caption || ''
		}
	}),
	delimiter: (block) => ({
		type: 'delimiter',
		data: { type: 'default' }
	}),
	code: (block) => ({
		type: 'code',
		data: { text: block.data.code, lang: '' }
	}),
	image: (block) => ({
		type: 'media',
		data: {
			items: [{ title: block.data.caption || '', image: fileToImage(block.data.file) }]
		}
	}),
	gallery: (block) =>
		block.data.items?.length
			? { type: 'media', data: { items: block.data.items.map((item: any) => ({ title: item.caption || '', image: fileToImage(item.file) })) } }
			: null,
	quiz: (block) => ({
		type: 'quiz',
		data: { hash: block.data.hash, title: block.data.title, items: block.data.items }
	}),
	person: (block) => ({
		type: 'person',
		data: {
			title: block.data.title,
			description: block.data.description,
			image: block.data.image ? { type: 'image', data: withoutUrl(block.data.image) } : undefined
		}
	})
};

/** `url` нужен только превью в редакторе, на сервер он не уходит */
function withoutUrl({ url, ...image }: any) {
	return image;
}

const dtfToEditorJsRegistry: Record<string, DtfToEditorJsMapper> = {
	text: (block) => ({
		type: 'paragraph',
		data: { text: block.data.text.replace(/^<p>/, '').replace(/<\/p>$/, '') }
	}),
	header: (block) => ({
		type: 'header',
		data: {
			text: block.data.text,
			level: parseInt(block.data.style?.replace('h', '') || '2', 10)
		}
	}),
	list: (block) => ({
		type: 'list',
		data: {
			style: block.data.type === 'OL' ? 'ordered' : 'unordered',
			items: (block.data.items || []).map((item: string) => ({ content: item, items: [] }))
		}
	}),
	quote: (block) => ({
		type: 'quote',
		data: {
			text: block.data.text.replace(/^<p.*?>/, '').replace(/<\/p>$/, ''),
			caption: block.data.subline1 || ''
		}
	}),
	delimiter: (block) => ({
		type: 'delimiter',
		data: {}
	}),
	code: (block) => ({
		type: 'code',
		data: { code: block.data.text }
	}),
	quiz: (block) => ({
		type: 'quiz',
		data: { hash: block.data.hash, title: block.data.title, items: block.data.items }
	}),
	person: (block) => ({
		type: 'person',
		data: {
			title: block.data.title,
			description: block.data.description,
			image: block.data.image?.data || null
		}
	}),
	media: (block) => {
		const items: any[] = block.data.items ?? [];
		// Блок без картинок редактор не рисует: он уходит обратно нетронутым
		if (!items.length || items.some((item) => !item.image?.data?.uuid)) return preserved(block);
		const toItem = (item: any) => ({ file: imageToFile(item.image), caption: item.title || '' });
		return items.length === 1
			? { type: 'image', data: toItem(items[0]) }
			: { type: 'gallery', data: { items: items.map(toItem) } };
	}
};

/** Адрес для превью в редакторе. Блок картинки считает файл видео, только если адрес кончается на `.mp4`: пустой фрагмент это обеспечивает */
export function editorMediaUrl(uuid: string, isVideo: boolean) {
	return isVideo ? `${getLeonardoUrl(uuid, { format: 'mp4' })}#.mp4` : getLeonardoUrl(uuid, { format: 'webp' });
}

/** Картинка DTF → файл блока в редакторе. Гифка у DTF — видео (`isVideo`) */
function imageToFile(image: any) {
	const data = image.data;
	const isVideo = !!data.isVideo || image.type === 'movie' || ['mp4', 'movie', 'gif'].includes(data.type);
	return {
		url: editorMediaUrl(data.uuid, isVideo),
		uuid: data.uuid,
		width: data.width,
		height: data.height,
		type: data.type || (isVideo ? 'movie' : 'image'),
		kind: image.type,
		size: data.size,
		color: data.color,
		...(isVideo && { isVideo: true, duration: data.duration, has_audio: data.has_audio })
	};
}

/** Файл блока в редакторе → картинка DTF */
function fileToImage(file: any) {
	return {
		type: file.kind ?? (file.type === 'movie' ? 'movie' : 'image'),
		data: {
			uuid: file.uuid || file.url,
			width: file.width || 1000,
			height: file.height || 1000,
			type: file.type || 'jpg',
			size: file.size || 0,
			color: file.color || '000000',
			...(file.isVideo && { isVideo: true, duration: file.duration ?? null, has_audio: file.has_audio ?? false })
		}
	};
}

/** Блок, который редактор не рисует: хранится как заглушка и уходит на сервер как был */
function preserved(block: DtfEditorBlock): Pick<OutputBlockData, 'type' | 'data'> {
	return { type: 'raw', data: { ...block.data, _isFallback: true, _originalType: block.type } };
}

export function editorJsToDtf(editorData: OutputData, originalEntry?: Partial<DtfEditorEntry>): DtfEditorEntry {
	const blocks: DtfEditorBlock[] = editorData.blocks.map(convertEditorJsBlockToDtf).filter(Boolean) as DtfEditorBlock[];
	return buildEditorEntry(blocks, originalEntry);
}

function convertEditorJsBlockToDtf(block: OutputBlockData): DtfEditorBlock | null {
	const mapper = editorJsToDtfRegistry[block.type];
	if (!mapper) {
		// Fallback for unknown blocks that were preserved
		if (block.data && (block.data as any)._isFallback) {
			const { _isFallback, _originalType, ...data } = block.data as any;
			return {
				type: _originalType,
				data,
				cover: false,
				hidden: block.tunes?.spoiler?.hidden || false,
				anchor: block.tunes?.anchor?.id || ''
			} as DtfEditorBlock;
		}
		return null;
	}

	const mapped = mapper(block);
	if (!mapped) return null;

	return {
		type: mapped.type,
		data: mapped.data,
		cover: false,
		hidden: block.tunes?.spoiler?.hidden || false,
		anchor: block.tunes?.anchor?.id || ''
	} as DtfEditorBlock;
}

export function dtfToEditorJs(dtfEntry: DtfEditorEntry): OutputData {
	if (!dtfEntry.entry || !dtfEntry.entry.blocks) {
		return { blocks: [] };
	}

	const blocks: OutputBlockData[] = dtfEntry.entry.blocks.map(convertDtfBlockToEditorJs).filter(Boolean) as OutputBlockData[];
	return {
		time: Date.now(),
		blocks,
		version: '2.30.0'
	};
}

function convertDtfBlockToEditorJs(block: DtfEditorBlock): OutputBlockData | null {
	const mapper = dtfToEditorJsRegistry[block.type];
	let mapped: Pick<OutputBlockData, 'type' | 'data'> | null = null;
	
	if (mapper) {
		mapped = mapper(block);
	} else {
		mapped = preserved(block);
	}

	if (!mapped) return null;

	const tunes: any = {};
	if (block.hidden) {
		tunes.spoiler = { hidden: true };
	}
	if (block.anchor) {
		tunes.anchor = { id: block.anchor };
	}

	return {
		type: mapped.type,
		data: mapped.data,
		tunes
	} as OutputBlockData;
}
