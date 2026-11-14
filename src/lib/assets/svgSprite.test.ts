import { describe, it, expect } from 'vitest';
import { buildSvgSpriteDefs, collectUsedSymbolIds } from './svgSprite';

const SAMPLE_SPRITE = `<svg xmlns="http://www.w3.org/2000/svg">
	<defs>
		<symbol id="v_like" viewBox="0 0 20 20"><path d="M1 1"/></symbol>
		<symbol id="v_like_active" viewBox="0 0 20 20">
			<path fill="url(#like_grad)" d="M2 2"/>
			<defs></defs>
		</symbol>
		<linearGradient id="like_grad" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#f00"/>
		</linearGradient>
		<symbol id="unused_icon" viewBox="0 0 20 20">
			<path fill="url(#unused_grad)" d="M9 9"/>
		</symbol>
		<radialGradient id="unused_grad"><stop offset="0" stop-color="#000"/></radialGradient>
	</defs>
</svg>`;

describe('svgSprite', () => {
	it('собирает id из шаблонных якорей и строковых литералов в чанках', () => {
		const chunk = `const a = '<use href="#v_like"></use>'; const b = { icon: "v_like_active" };`;
		const used = collectUsedSymbolIds([chunk], ['v_like', 'v_like_active', 'unused_icon', 'like']);

		expect([...used].sort()).toEqual(['v_like', 'v_like_active']);
	});

	it('оставляет только используемые символы и зависимые градиенты из <defs>', () => {
		const defs = buildSvgSpriteDefs([SAMPLE_SPRITE], new Set(['v_like_active']));

		expect(defs).toContain('id="v_like_active"');
		expect(defs).toContain('id="like_grad"');
		expect(defs).not.toContain('id="v_like"');
		expect(defs).not.toContain('id="unused_icon"');
		expect(defs).not.toContain('id="unused_grad"');
		expect(defs).not.toContain('<defs></defs>');
	});
});
