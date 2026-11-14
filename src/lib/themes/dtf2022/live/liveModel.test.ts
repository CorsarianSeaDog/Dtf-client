import { describe, expect, it } from 'vitest';
import { applyEvent, applyEvents, isVisible, LIVE_LIMIT, shorten, uniqueByType, visibleItems, type LiveItem } from './liveModel';

const NOW = 1_700_000_000_000;
const item = (hash: string, extra: Partial<LiveItem> = {}): LiveItem => ({
	type: 'comment_add',
	hash,
	date: NOW,
	user: { id: 1, name: 'Автор' },
	text: 'текст',
	postId: 10,
	commentId: Number(hash.replace(/\D/g, '')) || undefined,
	postTitle: 'Запись',
	...extra
});
const notice = (hash: string, extra: Partial<LiveItem> = {}) => item(hash, { notification: { kind: 'reply', text: 'ответил на ваш комментарий' }, ...extra });

describe('liveModel', () => {
	it('карточка с тем же hash заменяется, лишнего не накапливается', () => {
		let list = applyEvent([], item('c1'));
		list = applyEvent(list, item('c1', { text: 'новый' }));
		expect(list).toHaveLength(1);
		expect(list[0].text).toBe('новый');
	});

	it('ответ убирает прежние карточки того же комментария, но не плашки', () => {
		const list = applyEvent([notice('n5', { commentId: 5 }), item('c5')], item('r5', { type: 'comment_replied', commentId: 5 }));
		expect(list.map((i) => i.hash)).toEqual(['n5', 'r5']);
	});

	it('правка меняет текст, удаление убирает карточки комментария', () => {
		let list = [item('c1'), item('c2')];
		list = applyEvent(list, { type: 'comment_edited', commentId: 1, text: 'поправил' });
		expect(list[0].text).toBe('поправил');
		list = applyEvent(list, { type: 'comment_removed', commentId: 2 });
		expect(list.map((i) => i.hash)).toEqual(['c1']);
	});

	it('хранит не больше 20 последних', () => {
		const list = applyEvents([], Array.from({ length: LIVE_LIMIT + 5 }, (_, i) => item(`c${i + 1}`)));
		expect(list).toHaveLength(LIVE_LIMIT);
		expect(list[0].hash).toBe('c6');
	});

	it('плашки-уведомления обрабатываются первыми', () => {
		const list = applyEvents([], [item('c1'), notice('n2')]);
		expect(list.map((i) => i.hash)).toEqual(['n2', 'c1']);
	});

	it('режим «комментарии» прячет плашки, режим с уведомлениями показывает их; новые сверху', () => {
		const list = [item('c1', { date: NOW }), notice('n2', { date: NOW + 2 }), item('c3', { date: NOW + 1 })];
		expect(visibleItems(list, 'comments').map((i) => i.hash)).toEqual(['c3', 'c1']);
		expect(visibleItems(list, 'comments-notifications').map((i) => i.hash)).toEqual(['n2', 'c3', 'c1']);
	});

	it('фильтр: чужой подсайт и игнорируемый автор не показываются', () => {
		const filter = (subscribed: number[], ignored: number[]) => ({ subscribed: new Set(subscribed), ignored: new Set(ignored) });
		expect(isVisible(item('c1', { subsiteId: 7 }), filter([7], []))).toBe(true);
		expect(isVisible(item('c1', { subsiteId: 8 }), filter([7], []))).toBe(false);
		expect(isVisible(item('c1'), filter([], [1]))).toBe(false);
		expect(isVisible(item('c1'), filter([], []))).toBe(true);
	});

	it('текст: упоминания без разметки, не длиннее 90 символов; вложения без повторов типа', () => {
		expect(shorten('[@12|Вася], привет')).toBe('@Вася, привет');
		expect(shorten('а'.repeat(100))).toBe('а'.repeat(90) + '…');
		expect(uniqueByType([{ type: 'image', value: 'a' }, { type: 'image', value: 'b' }, { type: 'link', value: 'c' }])).toHaveLength(2);
	});
});
