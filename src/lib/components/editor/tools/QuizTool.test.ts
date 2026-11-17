import { describe, it, expect, vi, afterEach } from 'vitest';
import QuizTool from './QuizTool';

describe('QuizTool', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('не отдаёт поля опроса на правила EditorJS по умолчанию: ключи вариантов совпадали с именами тегов (a, b, i…)', () => {
		expect(QuizTool.sanitize).toEqual({ hash: false, title: false, items: false });
	});

	it('сохраняет только непустые варианты', () => {
		vi.stubGlobal('document', { createElement: () => ({ classList: { add() {} } }) });
		const tool = new QuizTool({ data: { hash: 'h', title: 'Q', items: { a: 'Да', b: '  ', c: 'Нет' } } });
		expect(tool.save()).toEqual({ hash: 'h', title: 'Q', items: { a: 'Да', c: 'Нет' } });
	});
});
