import type { I18nConfig } from '@editorjs/editorjs';

// Словарь интерфейса EditorJS. Ключи — английские строки из исходников ядра и @editorjs/*
// (проверены по их dist); свои блоки и настройки уже на русском.
export const editorMessages: NonNullable<I18nConfig['messages']> = {
	ui: {
		blockTunes: {
			toggler: {
				'Click to tune': 'Настройки блока',
				'or drag to move': 'или перетащите'
			}
		},
		inlineToolbar: { converter: { 'Convert to': 'Преобразовать в' } },
		toolbar: { toolbox: { Add: 'Добавить блок' } },
		popover: {
			Filter: 'Поиск',
			'Nothing found': 'Ничего не найдено',
			'Convert to': 'Преобразовать в'
		}
	},
	toolNames: {
		Text: 'Текст',
		Heading: 'Заголовок',
		'Unordered List': 'Список',
		'Ordered List': 'Нумерованный',
		Quote: 'Цитата',
		Code: 'Код',
		Image: 'Фото или видео',
		Delimiter: 'Разделитель',
		Link: 'Ссылка',
		Bold: 'Жирный',
		Italic: 'Курсив'
	},
	tools: {
		link: { 'Add a link': 'Вставьте ссылку' },
		stub: {
			Error: 'Ошибка',
			'The block can not be displayed correctly.': 'Блок нельзя показать правильно.'
		},
		header: { 'Heading 2': 'Заголовок 2', 'Heading 3': 'Заголовок 3' },
		list: {
			Unordered: 'Маркированный',
			Ordered: 'Нумерованный',
			'Start with': 'Начать с',
			'Counter type': 'Вид нумерации',
			Numeric: 'Числа',
			'Lower Roman': 'Римские строчные',
			'Upper Roman': 'Римские заглавные',
			'Lower Alpha': 'Буквы строчные',
			'Upper Alpha': 'Буквы заглавные'
		},
		quote: {
			'Enter a quote': 'Введите цитату',
			'Enter a caption': 'Подпись',
			'Align Left': 'По левому краю',
			'Align Center': 'По центру'
		},
		code: { 'Enter a code': 'Введите код' },
		image: {
			Caption: 'Подпись',
			'Select an Image': 'Выберите файл',
			'With border': 'С рамкой',
			'Stretch image': 'На всю ширину',
			'With background': 'С фоном',
			'With caption': 'С подписью',
			'Couldn’t upload image. Please try another.': 'Не удалось загрузить файл. Попробуйте другой.'
		}
	},
	blockTunes: {
		delete: { Delete: 'Удалить', 'Click to delete': 'Нажмите ещё раз, чтобы удалить' },
		moveUp: { 'Move up': 'Выше' },
		moveDown: { 'Move down': 'Ниже' }
	}
};
