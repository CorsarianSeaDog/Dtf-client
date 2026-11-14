/** Общие правила набора поискового запроса: сколько ждать после ввода и с какой длины искать */
export const SEARCH_DEBOUNCE = 2000;
export const SEARCH_MIN_LENGTH = 2;

/** Запрос, по которому можно искать: слишком короткий считается пустым */
export function searchableQuery(text: string): string {
	const query = text.trim();
	return query.length >= SEARCH_MIN_LENGTH ? query : '';
}
