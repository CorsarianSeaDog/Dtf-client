import type { CommentTreeItem, MentionUser } from '$lib/api/types';

export type EditorPart =
	| { type: 'text'; text: string }
	| { type: 'mention'; id: number; nickname: string; name: string };

const MENTION_TAG_RE = /<mention\b([^>]*)>([\s\S]*?)<\/mention\s*>|\[@(\d+)\|([^\]\r\n]+)\]/g;
const MENTION_ID_RE = /\bid=["'](\d+)["']/;
const MENTION_NICK_RE = /\bnickname=["']([^"']*)["']/;
const MENTION_QUERY_RE = /(?:^|\s)(@[^\s@]*)$/;

const escapeXml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const unescapeXml = (s: string) =>
	s.replace(/&(quot|lt|gt|#39|amp);/g, (_, name) =>
		name === 'quot' ? '"' : name === 'lt' ? '<' : name === 'gt' ? '>' : name === '#39' ? "'" : '&'
	);

export function formatMentionTag(mention: { id: number; nickname?: string; name: string }): string {
	return `<mention id="${mention.id}" nickname="${escapeXml(mention.nickname ?? '')}">${escapeXml(mention.name)}</mention>`;
}

export function mentionDisplayText(name: string): string {
	return name.startsWith('@') ? name : `@${name}`;
}

/** Разбирает текст комментария на обычный текст и упоминания (для загрузки черновика/правки в редактор) */
export function parseCommentEditorParts(raw: string): EditorPart[] {
	if (!raw) return [];
	const parts: EditorPart[] = [];
	const pushText = (text: string) => {
		if (!text) return;
		const prev = parts[parts.length - 1];
		if (prev?.type === 'text') prev.text += text;
		else parts.push({ type: 'text', text });
	};

	let last = 0;
	for (const match of raw.matchAll(MENTION_TAG_RE)) {
		const [all, attrs, xname, bid, bname] = match;
		pushText(raw.slice(last, match.index));
		last = match.index + all.length;

		if (attrs !== undefined) {
			const idMatch = MENTION_ID_RE.exec(attrs);
			if (!idMatch) {
				pushText(all);
				continue;
			}
			const nickMatch = MENTION_NICK_RE.exec(attrs);
			parts.push({
				type: 'mention',
				id: Number(idMatch[1]),
				nickname: unescapeXml(nickMatch?.[1] ?? ''),
				name: unescapeXml(xname)
			});
		} else if (bid) {
			parts.push({ type: 'mention', id: Number(bid), nickname: '', name: bname });
		}
	}
	pushText(raw.slice(last));
	return parts;
}

/** Собирает строку комментария из DOM-дерева `contenteditable`, сохраняя `<mention>`-теги и переносы */
export function serializeEditorElement(root: { childNodes: ArrayLike<Node> }): string {
	let out = '';

	function walk(nodes: ArrayLike<Node>, topLevel: boolean) {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node.nodeType === 3) {
				out += node.textContent ?? '';
				continue;
			}
			if (node.nodeType !== 1) continue;
			const el = node as HTMLElement;
			const mentionId = Number(el.getAttribute('data-mention-id'));
			if (mentionId > 0) {
				out += formatMentionTag({
					id: mentionId,
					nickname: el.getAttribute('data-mention-nickname') ?? '',
					name: el.getAttribute('data-mention-name') ?? (el.textContent ?? '').replace(/^@/, '')
				});
				continue;
			}
			const tag = el.tagName?.toUpperCase();
			if (tag === 'BR') {
				const prev = i > 0 ? (nodes[i - 1] as Element).tagName?.toUpperCase() : undefined;
				const isTrailingSentinel = topLevel && i === nodes.length - 1 && prev !== 'BR';
				if (!isTrailingSentinel) out += '\n';
				continue;
			}
			if ((tag === 'DIV' || tag === 'P') && out.length > 0 && !out.endsWith('\n')) {
				out += '\n';
			}
			walk(el.childNodes, false);
		}
	}

	walk(root.childNodes, true);
	return out;
}

/** Ищет `@запрос` непосредственно перед кареткой в текстовом узле */
export function findMentionQuery(textBeforeCaret: string): { query: string; start: number } | null {
	const match = MENTION_QUERY_RE.exec(textBeforeCaret);
	if (!match) return null;
	const token = match[1];
	const start = match.index + match[0].length - token.length;
	return { query: token.slice(1), start };
}

export function matchesMentionQuery(user: Pick<MentionUser, 'name' | 'nickname'>, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (!needle) return true;
	return user.name.toLowerCase().includes(needle) || (user.nickname?.toLowerCase().includes(needle) ?? false);
}

/** Сливает локальных участников ветки (сначала) и выдачу API без дублей */
export function mergeMentionCandidates(
	local: MentionUser[],
	remote: MentionUser[],
	query: string,
	limit = 10,
	filterRemote = false
): MentionUser[] {
	const result: MentionUser[] = [];
	const seen = new Set<number>();

	for (const [source, filter] of [
		[local, true],
		[remote, filterRemote]
	] as const) {
		for (const user of source) {
			if (user.id <= 0 || seen.has(user.id) || (filter && !matchesMentionQuery(user, query))) continue;
			seen.add(user.id);
			result.push(user);
			if (result.length >= limit) return result;
		}
	}

	return result;
}

/** Авторы целевого комментария и его предков (от ближайшего к корню), без текущего пользователя */
export function collectThreadMentionAuthors(
	path: CommentTreeItem[] | undefined,
	currentUserId?: number
): MentionUser[] {
	if (!path?.length) return [];
	const seen = new Set<number>();
	const result: MentionUser[] = [];

	for (let i = path.length - 1; i >= 0; i--) {
		const c = path[i];
		if (c.isRemoved || c.sourceId !== 'dtf') continue;
		const { id, name, avatarUrl } = c.author;
		if (id <= 0 || id === currentUserId || seen.has(id)) continue;
		seen.add(id);
		result.push({ id, name, avatarUrl });
	}
	return result;
}
