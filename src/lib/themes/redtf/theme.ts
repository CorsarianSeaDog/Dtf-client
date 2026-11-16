import { ease, fluent, type ThemeMotion } from '$lib/motion';
import { EASE as SWIPE_EASE } from '$lib/swipe';
import { defineTheme, EXPERIMENTAL, getCurrentDevice, type SettingValue } from '../types';
import { extendsTheme, palettes } from './palettes';

function defaultTransparency(): boolean {
	if (typeof window === 'undefined') return true;
	return !window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;
}

function isTransparencyEnabled(): boolean {
	if (typeof document !== 'undefined') {
		const val = document.documentElement.dataset.transparency;
		if (val !== undefined) return val === 'true';
	}
	return defaultTransparency();
}

/** Какую часть экрана занимает панель будущей страницы, пока та грузится (её рисует PagePeek) */
export const PEEK = 0.25;

/** Переход между страницами: на телефоне его вид выбирается настройкой `mobileTransition` */
type PageMotion = Pick<ThemeMotion, 'recede' | 'wait' | 'breathe' | 'depart' | 'approach' | 'fastDepart' | 'fastApproach' | 'peek' | 'pageOut' | 'pageBack' | 'pageIn'>;

// «Слайд»: движение как у свайпа «назад», только в обратную сторону. Новая страница выезжает справа с кривой броска
// (сразу на скорости и плавно тормозит), старая отъезжает на треть влево и затемняется, но не размывается: размытие,
// нарастающее на ходу, глаз пытается навести на резкость, и переход утомляет. Пока страница грузится, старая стоит
// на месте и размывается (без эффектов прозрачности — белеет), а справа выдвинута панель будущей страницы с индикатором
// Темп слайда (настройка `transitionSpeed`). «Плавно» — кривая шторок iOS: разгон мягче броска, торможение длиннее
const SLIDE_TIMING: Record<string, { duration: number; easing: string }> = {
	fast: { duration: 260, easing: SWIPE_EASE },
	normal: { duration: 380, easing: SWIPE_EASE },
	smooth: { duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
};

function slide(blur: boolean, speed: SettingValue | undefined): PageMotion {
	const timing = SLIDE_TIMING[String(speed)] ?? SLIDE_TIMING.normal;
	const shift = (x: string): Keyframe => ({ transform: `translateX(${x})`, filter: 'brightness(0.9)' });
	const still: Keyframe = { transform: 'none', filter: 'brightness(1)' };
	const waiting: Keyframe = blur ? { filter: 'blur(6px)', opacity: 0.7 } : { opacity: 0.45 };
	const peeked = `translateX(${(1 - PEEK) * 100}%)`;
	// «Плавно»: старая страница начинает размываться на хвосте торможения, когда уже почти встала. Кадры стоят по прогрессу
	// после кривой, а не по времени: 0.85 у этой кривой — около трети времени
	const settling: Keyframe[] =
		speed === 'smooth' && blur
			? [
					{ transform: 'none', filter: 'brightness(1) blur(0px)' },
					{ transform: 'translateX(-25.5%)', filter: 'brightness(0.915) blur(0px)', offset: 0.85 },
					{ transform: 'translateX(-30%)', filter: 'brightness(0.9) blur(6px)' }
			  ]
			: [still, shift('-30%')];
	return {
		fastApproach: { keyframes: [{ transform: 'translateX(100%)' }, { transform: 'none' }], ...timing },
		fastDepart: { keyframes: settling, ...timing },
		peek: { keyframes: [{ transform: 'translateX(100%)' }, { transform: peeked }], ...timing },
		recede: { keyframes: [blur ? { filter: 'blur(0px)', opacity: 1 } : { opacity: 1 }, waiting], duration: 300, easing: ease.out },
		wait: undefined,
		breathe: undefined,
		// Уже размытая страница уезжает, не меняя резкости
		depart: { keyframes: [{ transform: 'translateX(-30%)' }], ...timing },
		approach: { keyframes: [{ transform: peeked }, { transform: 'none' }], ...timing },
		pageOut: { keyframes: [{ transform: 'none' }, { transform: 'translateX(100%)' }], ...timing },
		pageBack: { keyframes: [shift('-30%'), still], ...timing }
	};
}

// «Material»: общая ось X из Material 3, как MaterialSharedAxis в Material Components: сдвиг на 30dp, кривая emphasized,
// длительность — токены M3 («Обычно» — long1, их значение по умолчанию; «Быстро» — medium2; «Плавно» — long4).
// У M3 слои сменяются «через пустоту»: старый гаснет на первых 35% прогресса, новый проявляется после. Здесь в этот миг
// проглядывал бы серый фон приложения без панелей, поэтому новый проявляется поверх старого, а старый уходит под ним.
// Закрытие — то же в обратную сторону: закрытая страница гаснет на первых 35%, как у M3, а слой под ней только подъезжает.
// Кадры прозрачности стоят по прогрессу после кривой, как и пороги у M3
const MATERIAL_DURATION: Record<string, number> = { fast: 300, normal: 450, smooth: 600 };

function material(speed: SettingValue | undefined): PageMotion {
	const timing = { duration: MATERIAL_DURATION[String(speed)] ?? MATERIAL_DURATION.normal, easing: ease.m3Emphasized };
	const enter: Keyframe[] = [
		{ opacity: 0, transform: 'translateX(30px)' },
		{ opacity: 1, transform: 'translateX(6px)', offset: 0.8 },
		{ opacity: 1, transform: 'none' }
	];
	return {
		fastApproach: { keyframes: enter, ...timing },
		fastDepart: { keyframes: [{ transform: 'none' }, { transform: 'translateX(-30px)' }], ...timing },
		peek: undefined,
		recede: { keyframes: [{ opacity: 1, transform: 'none' }, { opacity: 0.35, transform: 'translateX(-30px)' }], ...timing },
		wait: undefined,
		breathe: undefined,
		// Притушенная страница остаётся под проявляющейся новой
		depart: { keyframes: [{ opacity: 0.35 }], ...timing },
		approach: { keyframes: enter, ...timing },
		pageOut: {
			keyframes: [
				{ opacity: 1, transform: 'none' },
				{ opacity: 0, transform: 'translateX(10.5px)', offset: 0.35 },
				{ opacity: 0, transform: 'translateX(30px)' }
			],
			...timing
		},
		pageBack: { keyframes: [{ transform: 'translateX(-30px)' }, { transform: 'none' }], ...timing },
		// Слой под закрытой страницей (и прокрученная лента) не проявляется из пустоты: он уже стоит под гаснущей страницей
		pageIn: undefined
	};
}

// Содержимое «материализуется» из размытия, как приветствие. Размытие только у страниц: на длинной ленте слой слишком велик.
// При выключенных эффектах прозрачности используются быстрые анимации без фильтров размытия.
function getMotion(values: Record<string, SettingValue>): ThemeMotion {
	const blur = isTransparencyEnabled();
	const motion: ThemeMotion = {
		...fluent,
		modalIn: blur
			? fluent.modalIn
			: {
					keyframes: [{ opacity: 0, transform: 'scale(1.02)' }, { opacity: 1, transform: 'none' }],
					duration: 280,
					easing: ease.smooth
			  },
		modalOut: blur
			? fluent.modalOut
			: {
					keyframes: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.02)' }],
					duration: 200,
					easing: ease.smooth
			  },
		grow: { duration: 600, easing: ease.out },
		placeholderOut: 220,
		// Страница не смещается и не масштабируется (на краях картинок проступают полосы фона): проявляется на месте из размытия
		contentIn: blur
			? {
					keyframes: [{ opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0px)' }],
					duration: 750,
					easing: ease.out
			  }
			: {
					keyframes: [{ opacity: 0, transform: 'scale(0.98)' }, { opacity: 1, transform: 'none' }],
					duration: 320,
					easing: ease.out
			  },
		// Только прозрачность: слой (лента или страница) выходит на экран целиком, на длинной ленте не нужно ни размытия, ни сдвига
		pageIn: { keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 450, easing: ease.out },
		// Уходящая страница чуть приближается, размывается и растворяется; слой под ней подплывает снизу.
		// Сдвиг только по вертикали и без масштаба: у длинной ленты центр масштаба был бы далеко от экрана
		pageOut: blur
			? {
					keyframes: [
						{ opacity: 1, transform: 'none', filter: 'blur(0px)' },
						{ opacity: 0, transform: 'scale(1.06)', filter: 'blur(12px)' }
					],
					duration: 420,
					easing: ease.standard
			  }
			: {
					keyframes: [
						{ opacity: 1, transform: 'none' },
						{ opacity: 0, transform: 'scale(1.04)' }
					],
					duration: 250,
					easing: ease.standard
			  },
		pageBack: { keyframes: [{ opacity: 0, transform: 'translateY(36px)' }, { opacity: 1, transform: 'none' }], duration: 560, easing: ease.out },
		// Картинка или видео в посте догрузились: обратное растворение из размытия, как pageOut наоборот
		mediaIn: blur
			? {
					keyframes: [
						{ opacity: 0, filter: 'blur(12px)', transform: 'scale(1.04)' },
						{ opacity: 1, filter: 'blur(0px)', transform: 'none' }
					],
					duration: 460,
					easing: ease.out
			  }
			: {
					keyframes: [{ opacity: 0 }, { opacity: 1 }],
					duration: 250,
					easing: ease.out
			  },
		uploadIn: blur
			? {
					keyframes: [
						{ opacity: 0, transform: 'scale(0.9)', filter: 'blur(6px)' },
						{ opacity: 1, transform: 'none', filter: 'blur(0px)' }
					],
					duration: 320,
					easing: ease.smooth
			  }
			: {
					keyframes: [{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }],
					duration: 220,
					easing: ease.smooth
			  },
		uploadOut: blur
			? {
					keyframes: [
						{ opacity: 1, transform: 'none', filter: 'blur(0px)' },
						{ opacity: 0, transform: 'scale(0.92)', filter: 'blur(6px)' }
					],
					duration: 240,
					easing: ease.smooth
			  }
			: {
					keyframes: [{ opacity: 1 }, { opacity: 0 }],
					duration: 180,
					easing: ease.smooth
			  },
		feedIn: { keyframes: [{ opacity: 0, transform: 'translateY(32px) scale(0.99)' }, { opacity: 1, transform: 'none' }], duration: 650, easing: ease.out },

		// Универсальный переход между страницами:
		// 1. Старый экран уходит вглубь
		recede: {
			keyframes: [
				{ transform: 'none', opacity: 1 },
				{ transform: 'scale(0.94)', opacity: 0.6 }
			],
			duration: 350,
			easing: ease.out
		},
		// 2. Если загрузка затянулась: размытие и легкое отдаление
		wait: blur
			? {
					keyframes: [
						{ transform: 'scale(0.9)', opacity: 0.5, filter: 'blur(18px) saturate(1.2)' }
					],
					duration: 1200,
					easing: ease.emphasizedDecelerate
			  }
			: {
					keyframes: [
						{ transform: 'scale(0.92)', opacity: 0.5 }
					],
					duration: 800,
					easing: ease.emphasizedDecelerate
			  },
		// 3. Живое «дыхание» экрана
		breathe: {
			keyframes: [
				{ transform: 'scale(0.9)', opacity: 0.5 },
				{ transform: 'scale(0.915)', opacity: 0.42 }
			],
			duration: 2400,
			easing: 'ease-in-out',
			iterations: Infinity,
			direction: 'alternate'
		},
		// 4. Старый экран на заднем плане спокойно тает
		depart: {
			keyframes: [
				{ opacity: 0 }
			],
			duration: 280,
			easing: ease.out
		},
		// 5. Новый экран приближается к зрителю
		approach: {
			keyframes: [
				{ transform: 'scale(0.94)', opacity: 0 },
				{ transform: 'scale(0.95)', opacity: 1, offset: 0.15 },
				{ transform: 'none', opacity: 1 }
			],
			duration: 500,
			easing: ease.out
		},
		// 6. Быстрый переход (при быстрой готовности): старый экран мягко растворяется с отходом вглубь
		fastDepart: {
			keyframes: [
				{ transform: 'none', opacity: 1 },
				{ transform: 'translateY(-16px) scale(0.98)', opacity: 0 }
			],
			duration: 300,
			easing: ease.smooth
		},
		// 7. Быстрый переход (при быстрой готовности): новый экран плавно всплывает с мягким размытием (если включена прозрачность)
		fastApproach: blur
			? {
					keyframes: [
						{ transform: 'translateY(36px) scale(0.97)', opacity: 0, filter: 'blur(8px)' },
						{ transform: 'none', opacity: 1, filter: 'blur(0px)' }
					],
					duration: 400,
					easing: ease.smooth
			  }
			: {
					keyframes: [
						{ transform: 'translateY(36px) scale(0.97)', opacity: 0 },
						{ transform: 'none', opacity: 1 }
					],
					duration: 400,
					easing: ease.smooth
			  }
	};
	if (getCurrentDevice() !== 'mobile' || values.mobileTransition === 'zoom') return motion;
	return { ...motion, ...(values.mobileTransition === 'material' ? material(values.transitionSpeed) : slide(blur, values.transitionSpeed)) };
}

export default defineTheme({
	// Форк
	extends: extendsTheme,

	id: 'redtf',
	name: 'Re:DTF',
	gestures: true,
	profileSearch: true,
	description: 'Основная тема. Вдохновлена DTF 2022-23 года, но с адаптацией под современность.',
	palettes,
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
			key: 'swipeColumn',
			type: 'radio',
			title: 'Действия свайпа по комментарию',
			description: 'Как выглядит выбор действия, когда комментарий сдвинут влево и палец ведёт вниз.',
			default: 'list',
			touch: true,
			options: [
				{ value: 'list', title: 'Колонка', description: 'Кнопки стоят на месте, по ним двигается выделение' },
				{ value: 'drum', title: 'Барабан · как в Telegram X', description: 'Выбранное действие крупно в центре, остальные уменьшены сверху и снизу' }
			]
		},
		{
			key: 'mobileTransition',
			type: 'radio',
			title: 'Переходы между страницами',
			description: 'Как открывается новая страница на телефоне.',
			default: 'slide',
			device: 'mobile',
			options: [
				{ value: 'slide', title: 'Слайд', description: 'Страница выезжает справа. Пока она грузится, справа выдвинут её край с индикатором' },
				{ value: 'material', title: 'Material', description: 'Короткий сдвиг с растворением, как в Android' },
				{ value: 'zoom', title: 'Глубина · как на компьютере', description: 'Старая страница уходит вглубь, новая приближается' }
			]
		},
		{
			key: 'transitionSpeed',
			type: 'radio',
			title: 'Темп перехода',
			description: 'С какой скоростью сменяются страницы.',
			default: 'normal',
			device: 'mobile',
			dependsOn: { key: 'mobileTransition', value: ['slide', 'material'] },
			options: [
				{ value: 'fast', title: 'Быстро', description: 'Короткое движение, страница почти сразу на месте' },
				{ value: 'normal', title: 'Обычно', description: 'Слайд — как свайп «назад», Material — как в Android по умолчанию' },
				{ value: 'smooth', title: 'Плавно', description: 'Медленнее, мягкий разгон и долгое торможение' }
			]
		},
		{
			key: 'editorFullscreen',
			type: 'toggle',
			title: 'Редактор на весь экран',
			description: 'Выключено — редактор открывается окном. Переключается и кнопкой в самом редакторе.',
			default: true
		},
		{
			key: 'avatarOpensMenu',
			type: 'toggle',
			title: 'Меню по клику на аватар',
			description: 'Клик на аватар в шапке открывает меню вместо перехода в профиль',
			default: true,
			device: 'desktop'
		},
		{
			key: 'createButtonPos',
			type: 'radio',
			title: 'Расположение кнопки «Создать»',
			description: 'Сверху в шапке или в левом сайдбаре.',
			default: 'top',
			device: 'desktop',
			options: [
				{ value: 'top', title: 'Сверху', description: 'Кнопка «Создать» отображается в шапке' },
				{ value: 'sidebar', title: 'На левом сайдбаре', description: 'Кнопка «Создать» отображается в боковой панели' }
			]
		},
		{
			key: 'searchBarMode',
			type: 'radio',
			title: 'Строка поиска',
			description: 'Отображать строку поиска всегда или скрывать за кнопкой.',
			default: 'always',
			device: 'desktop',
			options: [
				{ value: 'always', title: 'Отображать всегда', description: 'Строка поиска всегда видна в шапке' },
				{ value: 'button', title: 'Скрывать за кнопкой', description: 'Показывать кнопку поиска слева от кнопки уведомления' }
			]
		},
		{
			key: 'mobileTopBar',
			type: 'radio',
			title: 'Вид верхней панели',
			default: 'compact',
			device: 'mobile',
			options: [
				{ value: 'compact', title: 'Компактная', note: EXPERIMENTAL, description: 'Панель с иконками и действиями для текущего экрана' },
				{ value: 'web', title: 'Как на сайте', description: 'Шапка с логотипом и поиском' }
			]
		},
		// Пока только в отладке (DebugSettings), визуально не прижилась
		{
			key: 'mobileTopBarFloating',
			type: 'toggle',
			title: 'Плавающая верхняя панель',
			default: false,
			device: 'mobile',
			hidden: true
		},
		{
			key: 'postTitleInBar',
			type: 'toggle',
			title: 'Заголовок поста в верхней панели',
			description: 'Показывать заголовок, когда он уходит за верх экрана',
			default: false,
			device: 'mobile',
			dependsOn: { key: 'mobileTopBar', value: 'compact' }
		},
		{
			key: 'hideTopBarOnScroll',
			type: 'toggle',
			title: 'Скрывать верхнюю панель при прокрутке',
			description: 'Панель уезжает при прокрутке вниз и возвращается при прокрутке вверх',
			default: false,
			device: 'mobile',
			dependsOn: { key: 'mobileTopBar', value: 'compact' }
		},
		{
			key: 'headerBlur',
			type: 'toggle',
			title: 'Блюр верхней панели',
			description: 'Размытие фона под шапкой при прокрутке',
			default: false
		},
		{
			key: 'mobileBarBlur',
			type: 'toggle',
			title: 'Блюр мобильного бара',
			description: 'Размытие фона под нижней навигационной панелью',
			default: false,
			device: 'mobile'
		},
		{
			key: 'mobileBarFloating',
			type: 'toggle',
			title: 'Плавающий мобильный бар',
			description: 'Скругление углов и отступы у нижней панели',
			default: false,
			device: 'mobile'
		},
		{
			key: 'transparencyEffects',
			type: 'toggle',
			title: 'Продвинутые эффекты прозрачности и размытия',
			description: 'Размытие при переходах и предпросмотр медиа. Без них анимации быстрее и легче.',
			default: defaultTransparency()
		},
		{
			key: 'contentWidth',
			type: 'slider',
			title: 'Ширина контента',
			description: 'Ширина ленты, поста, профиля и комментариев на широких экранах.',
			steps: [640, 680, 720, 740, 820, 940],
			default: 640,
			unit: 'px',
			// Колонка текста у́же самой ленты на 40px (как у DTF: 600 при 640)
			cssVars: (width) => ({ '--content-width': `${width}px`, '--inner-content-width': `${width - 40}px` }),
			device: 'desktop'
		},
		{
			key: 'postMediaWidth',
			type: 'radio',
			title: 'Медиа в посте',
			description: 'Как отображать фото, видео и галереи на странице поста.',
			default: 'full',
			options: [
				{ value: 'full', title: 'На всю ширину', description: 'Горизонтальные медиа выходят на всю ширину поста, как на DTF 2022' },
				{ value: 'content', title: 'На ширину контента', description: 'Медиа выравниваются по ширине текста, как на современном DTF' }
			]
		}
	],
	motion: getMotion
});
