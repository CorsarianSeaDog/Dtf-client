import { defineTheme } from '../types';
import { palettes } from './palettes';

// Колонка «Комментарии» ждёт вебсокет DTF (см. live/source.ts): без него у неё нет данных.
// Пока флаг true, её настройки скрыты, а сама колонка выключена. Когда вебсокет подключат, флаг убрать.
const LIVE_HIDDEN = true;

export default defineTheme({
	id: 'dtf2022',
	name: 'DTF 2022',
	hidden: true,
	description: 'Копия дизайна DTF начала 2023 года',
	palettes,
	// У DTF анимировалось только меню профиля (slide-and-fade): сдвиг на 5px за 0.2s, прозрачность меняется сразу, уход без анимации
	motion: {
		menuIn: { keyframes: [{ transform: 'translateY(-5px)' }, { transform: 'none' }], duration: 200, easing: 'ease' }
	},
	settings: [
		{
			key: 'votes',
			type: 'radio',
			title: 'Оценки',
			description: 'Как выглядят оценки постов и комментариев.',
			default: 'likes',
			options: [
				{ value: 'rating', title: 'Стрелки · осень 2022', description: 'Рейтинг со стрелками вверх и вниз у постов и комментариев' },
				{ value: 'likes', title: 'Лайки · начало 2023', description: 'Лайк и дизлайк, как в ленте весной 2023' },
				{ value: 'reactions', title: 'Реакции · как сейчас', description: 'Набор реакций, как на сайте сегодня' }
			]
		},
		{
			key: 'arrowsSide',
			type: 'radio',
			title: 'Стрелки оценки',
			description: 'С какой стороны стоят стрелки.',
			default: 'right',
			dependsOn: { key: 'votes', value: 'rating' },
			options: [
				{ value: 'right', title: 'Справа' },
				{ value: 'left', title: 'Слева' }
			]
		},
		{
			key: 'arrowsOrder',
			type: 'radio',
			title: 'Порядок стрелок',
			description: 'В каком порядке стоят стрелки.',
			default: 'down-up',
			dependsOn: { key: 'votes', value: 'rating' },
			options: [
				{ value: 'down-up', title: 'Вниз / вверх', description: 'Стрелка вниз слева, вверх — справа' },
				{ value: 'up-down', title: 'Вверх / вниз', description: 'Стрелка вверх слева, вниз — справа' }
			]
		},
		{
			key: 'repostsView',
			type: 'radio',
			title: 'Список репостов',
			description: 'Что открывает счётчик репостов под записью.',
			default: 'page',
			options: [
				{ value: 'page', title: 'Страница с записями', description: 'Репосты — записи-ответы, их видно карточками, как в ленте' },
				{ value: 'list', title: 'Короткий список', description: 'Аватар и имя автора под кнопкой, как у DTF в 2022 году' }
			]
		},
		{
			key: 'liveEnabled',
			type: 'toggle',
			title: 'Колонка «Комментарии»',
			description: 'Живая лента комментариев справа от записей, как у DTF в 2022 году. Показывается от 1180px.',
			default: false,
			hidden: LIVE_HIDDEN
		},
		{
			key: 'liveContent',
			type: 'radio',
			title: 'Что показывать в колонке',
			default: 'comments',
			dependsOn: { key: 'liveEnabled', value: true },
			hidden: LIVE_HIDDEN,
			options: [
				{ value: 'comments', title: 'Новые комментарии' },
				{ value: 'comments-notifications', title: 'Новые комментарии и входящие уведомления', description: 'Ответы, оценки и комментарии к вашим записям появляются плашками среди комментариев' }
			]
		},
		{
			key: 'liveCollapsed',
			type: 'toggle',
			title: 'Свернуть колонку',
			description: 'Колонка сужается до 80px, заголовок встаёт вдоль неё. Сворачивается и кликом по заголовку.',
			default: false,
			dependsOn: { key: 'liveEnabled', value: true },
			hidden: LIVE_HIDDEN
		}
	]
});
