// Извлечение и обрезка SVG-спрайтов: оставляет только используемые <symbol> и нужные им <defs>.

export interface ParsedSprites {
	symbols: Map<string, string>;
	defs: Map<string, string>;
}

const SYMBOL_RE = /<symbol\b[^>]*>[\s\S]*?<\/symbol>/g;
const ID_ATTR_RE = /\bid=(["'])([^"']+)\1/;
const DEF_ELEMENT_RE = /<(linearGradient|radialGradient|clipPath|mask|filter|pattern|marker)\b[^>]*\bid=(["'])([^"']+)\2[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g;
const DEF_REF_RE = /url\(\s*#([^)\s'"]+)\s*\)|(?:xlink:)?href=(["'])#([^"']+)\2/g;
const TOKEN_RE = /#([a-zA-Z0-9_-]+)|(['"`])([a-zA-Z0-9_-]+)\2/g;

const compactXml = (xml: string) => xml.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').replace(/<defs><\/defs>/g, '').trim();

export function parseSvgSprites(sources: string[]): ParsedSprites {
	const symbols = new Map<string, string>();
	const defs = new Map<string, string>();

	for (const source of sources) {
		const outsideSymbols = source.replace(SYMBOL_RE, (block) => {
			const id = block.match(ID_ATTR_RE)?.[2];
			if (id && !symbols.has(id)) symbols.set(id, block);
			return '';
		});

		for (const match of outsideSymbols.matchAll(DEF_ELEMENT_RE)) {
			const id = match[3];
			if (id && !defs.has(id)) defs.set(id, match[0]);
		}
	}

	return { symbols, defs };
}

export function collectUsedSymbolIds(chunks: Iterable<string>, candidateIds: Iterable<string>): Set<string> {
	const candidates = new Set(candidateIds);
	const used = new Set<string>();

	for (const code of chunks) {
		for (const match of code.matchAll(TOKEN_RE)) {
			const id = match[1] ?? match[3];
			if (candidates.has(id)) used.add(id);
		}
	}

	return used;
}

export function buildSvgSpriteDefs(sources: string[], usedIds?: Set<string>): string {
	const { symbols, defs } = parseSvgSprites(sources);

	if (!usedIds) {
		const all = [...symbols.values(), ...defs.values()].map(compactXml).join('');
		return `<defs>${all}</defs>`;
	}

	const keptSymbols: string[] = [];
	for (const [id, block] of symbols) {
		if (usedIds.has(id)) keptSymbols.push(block);
	}

	const keptDefs = new Map<string, string>();
	const queue = [...keptSymbols];
	while (queue.length > 0) {
		const block = queue.pop()!;
		for (const match of block.matchAll(DEF_REF_RE)) {
			const refId = match[1] ?? match[3];
			if (!refId || keptDefs.has(refId)) continue;
			const defBlock = defs.get(refId);
			if (defBlock) {
				keptDefs.set(refId, defBlock);
				queue.push(defBlock);
			}
		}
	}

	const body = [...keptSymbols, ...keptDefs.values()].map(compactXml).join('');
	return `<defs>${body}</defs>`;
}
