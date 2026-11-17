import type { OutputData } from '@editorjs/editorjs';

/** Слов в минуту при чтении про себя (русский текст) */
const WORDS_PER_MINUTE = 200;

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** Текст блока EditorJS → чистый текст: теги вырезаются, сущности раскрываются (иначе «&nbsp;» стал бы словом) */
function plain(html: unknown) {
	// «<br>» разделяет слова, остальные теги (жирный, ссылка) — нет: «сло<b>во</b>» это одно слово
	return typeof html === 'string' ? html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? m) : '';
}

/** Текст, который есть у блока. Картинка, галерея, опрос, персона и разделитель слов не дают */
function blockText(block: { type: string; data: any }): string[] {
	const { data } = block;
	switch (block.type) {
		case 'paragraph':
		case 'header':
			return [plain(data.text)];
		case 'quote':
			return [plain(data.text), plain(data.caption)];
		case 'code':
			return [plain(data.code)];
		case 'list':
			// Пункты бывают строками (старый формат) и вложенными { content, items }
			return flat(data.items);
		default:
			return [];
	}
}

function flat(items: unknown): string[] {
	if (!Array.isArray(items)) return [];
	return items.flatMap((item) => (typeof item === 'string' ? [plain(item)] : [plain(item?.content), ...flat(item?.items)]));
}

/** Слова записи (заголовок и тело) и минуты чтения, округлённые вверх; у пустой записи минут нет */
export function wordCount(title: string, data?: OutputData) {
	const text = [plain(title), ...(data?.blocks ?? []).flatMap(blockText)].join(' ');
	const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
	return { words, minutes: Math.ceil(words / WORDS_PER_MINUTE) };
}
