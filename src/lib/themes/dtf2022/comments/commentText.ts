/*
 * Текст комментария DTF — это plain text: переносы \r\n, цитаты строками с «>»,
 * упоминания `<mention id="1" nickname="">Имя</mention>` или `[@1|Имя]` и голые ссылки.
 * В сниппетах поиска найденные слова обёрнуты в `<mark>`, в том числе внутри ссылок и упоминаний.
 * Разбираем в структуру и рендерим текстовыми узлами — без {@html}.
 */

export interface TextSegment {
	text: string;
	mark: boolean;
}

/** `parts` есть, только если в имени или ссылке что-то выделено */
export type Inline =
	| { type: 'text'; text: string; mark?: boolean }
	| { type: 'mention'; id: number; name: string; parts?: TextSegment[] }
	| { type: 'link'; url: string; parts?: TextSegment[] };

export interface Paragraph {
	quote: boolean;
	lines: Inline[][];
}

// Поиск ставит <mark> и внутрь атрибутов (`<mention id="1" <mark>nickname</mark>="">`) и обрезает сниппет
// посреди тега: незакрытое упоминание в конце строки берём как есть, обрывки тегов (последние три варианта) выбрасываем
const INLINE_RE =
	/<mention id="(\d+)"(?:<\/?mark>|[^<>])*>([\s\S]*?)(?:<\/mention\s*>|$)|\[@(\d+)\|([^\]\r\n]+)(?:\]|$)|(https?:\/\/(?:<\/?mark>|[^\s<])+)|<(\/?)mark>|<\/mention\s*>|<mention\b(?:<\/?mark>|[^<>])*$|\[@\d*$/g;

const unmark = (raw: string) => raw.replace(/<\/?mark>/g, '');

function segments(raw: string): TextSegment[] | undefined {
	if (!raw.includes('<mark>')) return undefined;
	const parts = raw.split(/<(\/?)mark>/); // текст, '' или '/', текст, …
	return parts.flatMap((text, i) => (i % 2 || !text ? [] : [{ text, mark: parts[i - 1] === '' }]));
}

function parseInline(line: string): Inline[] {
	const result: Inline[] = [];
	let mark = false;
	const pushText = (text: string) => text && result.push({ type: 'text', text, ...(mark && { mark }) });

	let last = 0;
	for (const match of line.matchAll(INLINE_RE)) {
		const [all, xid, xname, bid, bname, rawUrl, close] = match;
		pushText(line.slice(last, match.index));
		last = match.index + all.length;
		if (close !== undefined) {
			mark = !close;
		} else if (rawUrl) {
			// Точка или скобка в конце обычно относится к предложению, а не к ссылке
			const trimmed = rawUrl.replace(/[.,!?)]+$/, '');
			result.push({ type: 'link', url: unmark(trimmed), parts: segments(trimmed) });
			pushText(rawUrl.slice(trimmed.length));
		} else if (xid || bid) {
			const name = xname ?? bname;
			result.push({ type: 'mention', id: Number(xid ?? bid), name: unmark(name), parts: segments(name) });
		}
	}
	pushText(line.slice(last));
	return result;
}

const textCache = new Map<string, Paragraph[]>();
const MAX_TEXT_CACHE = 1000;

export function parseCommentText(raw: string): Paragraph[] {
	if (!raw) return [];
	const cached = textCache.get(raw);
	if (cached !== undefined) return cached;

	const paragraphs: Paragraph[] = [];
	let current: Paragraph | null = null;

	for (const rawLine of raw.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (!line.trim()) {
			current = null;
			continue;
		}
		const quote = line.startsWith('>');
		const text = quote ? line.slice(1).trimStart() : line;
		if (!current || current.quote !== quote) {
			current = { quote, lines: [] };
			paragraphs.push(current);
		}
		current.lines.push(parseInline(text));
	}

	if (textCache.size >= MAX_TEXT_CACHE) {
		const firstKey = textCache.keys().next().value;
		if (firstKey !== undefined) textCache.delete(firstKey);
	}
	textCache.set(raw, paragraphs);

	return paragraphs;
}
