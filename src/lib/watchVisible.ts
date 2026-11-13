/**
 * Зовёт `load`, когда узел (низ списка) подъезжает к экрану с запасом в 1000px. Если `load` вернул промис,
 * новые вызовы ждут его завершения, а при `true` наблюдение перезапускается: свежий ответ наблюдателя
 * покажет, виден ли узел после добавления. Иначе узел, не уехавший из зоны (пачка без высоты, высокий экран),
 * больше не сообщил бы о себе: наблюдатель срабатывает только на смене видимости.
 * Возвращает снятие наблюдателя.
 */
export function watchVisible(node: Element, load: () => unknown): () => void {
	let busy = false;
	let stopped = false;
	const observer = new IntersectionObserver(
		(entries) => {
			if (busy || !entries[entries.length - 1].isIntersecting) return;
			const res = load();
			if (!(res instanceof Promise)) return;
			busy = true;
			res.then(
				(added) => {
					busy = false;
					if (!added || stopped) return;
					observer.unobserve(node);
					observer.observe(node);
				},
				() => (busy = false)
			);
		},
		{ rootMargin: '1000px' }
	);
	observer.observe(node);
	return () => {
		stopped = true;
		observer.disconnect();
	};
}
