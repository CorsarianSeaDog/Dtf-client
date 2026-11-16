/*
 * Движение интерфейса. Тема описывает анимации данными (ThemeMotion в манифесте), ядро их проигрывает.
 * Тема без поля motion не анимирует ничего. Подробнее: docs/architecture/motion.md.
 */

/** Длительность в мс и кривая CSS */
export interface Timing {
	duration: number;
	easing: string;
}

/** Одна анимация: ключевые кадры Web Animations и время */
export interface Anim extends Timing {
	keyframes: Keyframe[];
	iterations?: number;
	direction?: PlaybackDirection;
}

/** Какие анимации есть у темы; чего нет, того не анимируем */
export interface ThemeMotion {
	/** Блок-заглушка загрузки заменяется содержимым: высота переезжает от заглушки к содержимому (см. Reveal) */
	grow?: Timing;
	/** Сколько мс заглушка загрузки тает поверх растущего блока */
	placeholderOut?: number;
	/** Окно (вход, настройки, редактор) готово и появляется */
	modalIn?: Anim;
	/** Окно закрывается: проигрывается на подложке вместе с окном */
	modalOut?: Anim;
	/** Выпадающее меню или панель открываются из кнопки-триггера */
	popoverIn?: Anim;
	/** Выпадающее меню или панель закрываются */
	popoverOut?: Anim;
	/** Меню профиля в шапке открывается: у оригинального DTF анимировалось только оно */
	menuIn?: Anim;
	/** Содержимое экрана пришло: пост, комментарии */
	contentIn?: Anim;
	/** Пришёл список ленты */
	feedIn?: Anim;
	/** Картинка или видео в посте догрузились: проявляются поверх цветной заглушки, а не выскакивают */
	mediaIn?: Anim;
	/** Появление слота или индикатора загрузки медиа */
	uploadIn?: Anim;
	/** Уход оверлея прогресса после завершения загрузки или при отмене */
	uploadOut?: Anim;
	/** Страницу закрыли: она остаётся на месте поверх слоя под ней и уходит, пока тот возвращается (`pageBack`) */
	pageOut?: Anim;
	/** Слой под закрытой страницей (лента или прежняя страница) возвращается на экран; без неё берётся `pageIn` */
	pageBack?: Anim;
	/** Страницу открыли или закрыли: слой, который встал наверх (страница или лента под ней), выходит на экран */
	pageIn?: Anim;

	/** Экран уходит вглубь при переходе на новую страницу (Recede) */
	recede?: Anim;
	/** Загрузка затянулась: старый экран плавно размывается (Hold) */
	wait?: Anim;
	/** Размытый экран мягко «дышит», пока ждём загрузку */
	breathe?: Anim;
	/** Старый экран окончательно растворяется и уходит, когда новый готов (Depart) */
	depart?: Anim;
	/** Новый экран приближается к зрителю (Approach) */
	approach?: Anim;
	/** Быстрый переход: старый экран синхронно отдаляется и тает (при быстрой готовности) */
	fastDepart?: Anim;
	/** Быстрый переход: новый экран всплывает на передний план (при быстрой готовности) */
	fastApproach?: Anim;
	/**
	 * Вместо спиннера при ожидании: панель будущей страницы выдвигается краем (компонент темы `PagePeek`).
	 * Анимация двигает обёртку на весь экран; когда страница готова, она выезжает с позиции панели (время из `approach`)
	 */
	peek?: Anim;
}

/** Поля ThemeMotion, которые являются анимациями (их проигрывает `play`) */
export type AnimKey =
	| 'modalIn'
	| 'modalOut'
	| 'popoverIn'
	| 'popoverOut'
	| 'menuIn'
	| 'contentIn'
	| 'feedIn'
	| 'mediaIn'
	| 'uploadIn'
	| 'uploadOut'
	| 'pageIn'
	| 'pageOut'
	| 'pageBack'
	| 'recede'
	| 'wait'
	| 'breathe'
	| 'depart'
	| 'approach'
	| 'fastDepart'
	| 'fastApproach'
	| 'peek';

/**
 * Кривая emphasized из Material 3 (токен `m3_sys_motion_easing_emphasized`). У M3 это не одна кривая Безье, а путь из двух,
 * поэтому он снят по точкам в `linear()`. Где `linear()` не поддерживается, берётся приближение `cubic-bezier`
 */
const M3_EMPHASIZED =
	'linear(0, 0.003 2%, 0.013 4%, 0.03 6%, 0.056 8%, 0.093 10%, 0.146 12%, 0.222 14%, 0.341 16%, 0.52 18%, 0.636 20%, 0.706 22%, 0.754 24%, 0.804 27%, 0.84 30%, 0.876 34%, 0.902 38%, 0.926 43%, 0.951 50%, 0.973 60%, 0.987 70%, 0.997 85%, 1)';
const supportsLinear = () => typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)') === true;

/** Кривые: QuarticEase, Fluent и Material */
export const ease = {
	m3Emphasized: supportsLinear() ? M3_EMPHASIZED : 'cubic-bezier(0.2, 0, 0, 1)',
	out: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
	inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
	decelerate: 'cubic-bezier(0.1, 0.9, 0.2, 1)',
	accelerate: 'cubic-bezier(0.9, 0.1, 1, 0.2)',
	standard: 'cubic-bezier(0.8, 0, 0.2, 1)',
	emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
	emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
	smooth: 'cubic-bezier(0.2, 0, 0, 1)'
};

const popoverIn: Anim = {
	keyframes: [
		{ opacity: 0, transform: 'translateY(-6px) scale(0.95)' },
		{ opacity: 1, transform: 'none' }
	],
	duration: 180,
	easing: ease.emphasizedDecelerate
};

/** Готовый набор в духе Fluent: плавные «прилёты» с замедлением */
export const fluent: ThemeMotion = {
	modalIn: {
		keyframes: [
			{ opacity: 0, transform: 'scale(1.025)', filter: 'blur(4px)' },
			{ opacity: 1, transform: 'none', filter: 'blur(0px)' }
		],
		duration: 340,
		easing: ease.smooth
	},
	modalOut: {
		keyframes: [
			{ opacity: 1, transform: 'none', filter: 'blur(0px)' },
			{ opacity: 0, transform: 'scale(1.025)', filter: 'blur(4px)' }
		],
		duration: 240,
		easing: ease.smooth
	},
	popoverIn,
	menuIn: popoverIn,
	popoverOut: {
		keyframes: [
			{ opacity: 1, transform: 'none' },
			{ opacity: 0, transform: 'translateY(-4px) scale(0.96)' }
		],
		duration: 110,
		easing: ease.emphasizedAccelerate
	},
	contentIn: {
		keyframes: [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }],
		duration: 520,
		easing: ease.out
	},
	feedIn: {
		keyframes: [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }],
		duration: 480,
		easing: ease.out
	},
	uploadIn: {
		keyframes: [{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'none' }],
		duration: 260,
		easing: ease.smooth
	},
	uploadOut: {
		keyframes: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.92)' }],
		duration: 200,
		easing: ease.smooth
	},
	recede: {
		keyframes: [
			{ transform: 'none', opacity: 1 },
			{ transform: 'scale(0.94)', opacity: 0.6 }
		],
		duration: 350,
		easing: ease.out
	},
	wait: {
		keyframes: [
			{ transform: 'scale(0.9)', opacity: 0.5, filter: 'blur(18px) saturate(1.2)' }
		],
		duration: 1200,
		easing: ease.emphasizedDecelerate
	},
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
	depart: {
		keyframes: [
			{ opacity: 0 }
		],
		duration: 280,
		easing: ease.out
	},
	approach: {
		keyframes: [
			{ transform: 'scale(0.94)', opacity: 0 },
			{ transform: 'scale(0.95)', opacity: 1, offset: 0.15 },
			{ transform: 'none', opacity: 1 }
		],
		duration: 500,
		easing: ease.out
	},
	fastDepart: {
		keyframes: [
			{ transform: 'none', opacity: 1 },
			{ transform: 'translateY(-16px) scale(0.98)', opacity: 0 }
		],
		duration: 300,
		easing: ease.smooth
	},
	fastApproach: {
		keyframes: [
			{ transform: 'translateY(36px) scale(0.97)', opacity: 0 },
			{ transform: 'none', opacity: 1 }
		],
		duration: 400,
		easing: ease.smooth
	}
};

/**
 * Затемнение за окном: отклик на нажатие, поэтому играет у всех тем, а не только у тех, что задали motion.
 * Первый кадр — начальный, пустой последний берёт обычный стиль подложки. Один кадр стал бы конечным,
 * и подложка гасла бы до прозрачной, а потом снова темнела.
 */
export const backdropIn: Anim = {
	keyframes: [{ backgroundColor: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none' }, {}],
	duration: 280,
	easing: ease.smooth
};

/**
 * Плавное растворение затемнения при закрытии окна в унисон с уходом самого окна.
 */
export const backdropOut: Anim = {
	keyframes: [{}, { backgroundColor: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none' }],
	duration: 240,
	easing: ease.smooth
};

export const reducedMotion = () =>
	typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia('(prefers-reduced-motion: reduce)').matches
		: false;

/** Поведение программной прокрутки: плавная, если пользователь не просил уменьшить движение */
export const scrollBehavior = (): ScrollBehavior => (reducedMotion() ? 'auto' : 'smooth');

/**
 * Плавно изменить высоту блока с `from` до нынешней. Растёт не дальше `from` + экран: остальное ниже сгиба,
 * его не видно, а длинную ленту иначе пришлось бы «разворачивать» на десятки тысяч пикселей.
 */
export function grow(el: HTMLElement, from: number, timing?: Timing) {
	if (!timing || reducedMotion()) return;
	const to = Math.min(el.offsetHeight, from + innerHeight);
	if (Math.abs(to - from) < 2) return;
	el.style.overflow = 'clip';
	const animation = el.animate({ height: [`${from}px`, `${to}px`] }, { ...timing });
	animation.onfinish = animation.oncancel = () => el.style.removeProperty('overflow');
}

/**
 * Проиграть анимацию на элементе. Без анимации или при «уменьшить движение» в системе не делает ничего.
 * fill: 'forwards' для ухода, чтобы элемент не мелькнул прежним видом перед удалением.
 */
export function play(el: Element, anim?: Anim, fill: FillMode = 'none') {
	if (!anim || reducedMotion()) return;
	return el.animate(anim.keyframes, {
		duration: anim.duration,
		easing: anim.easing,
		fill,
		iterations: anim.iterations ?? 1,
		direction: anim.direction ?? 'normal'
	});
}

/**
 * Как play, но на время анимации обрезает элемент по низу окна (`overflow: clip`): размытие и трансформация
 * считаются по одному экрану, а не по всему длинному посту. Запас 10% — под масштаб, который поднимает нижний край.
 * Пока анимация идёт, на элементе стоит `data-animating`: под ним не стартуют видео (см. lazyVideo).
 */
export function playClipped(el: HTMLElement, anim?: Anim, fill: FillMode = 'none') {
	const top = el.getBoundingClientRect().top;
	const animation = play(el, anim, fill);
	if (!animation) return;
	const { maxHeight, overflow } = el.style;
	Object.assign(el.style, { maxHeight: `${Math.round(Math.max(100, (innerHeight - top) * 1.1))}px`, overflow: 'clip' });
	el.setAttribute('data-animating', '');
	const restore = () => {
		Object.assign(el.style, { maxHeight, overflow });
		el.removeAttribute('data-animating');
	};
	animation.finished.then(restore, restore);
	return animation;
}

/**
 * Проиграть анимацию на детях элемента. Если у ребёнка `display: contents`,
 * анимируются его непосредственные потомки (обёртка `display: contents` не имеет геометрии).
 */
export function playChildren(parent: Element, anim?: Anim, fill: FillMode = 'none') {
	if (!anim || reducedMotion()) return;
	const isContents = (el: Element) =>
		typeof getComputedStyle === 'function' && getComputedStyle(el).display === 'contents';

	for (const child of parent.children) {
		const targets = isContents(child) ? Array.from(child.children) : [child];
		for (const el of targets) {
			if (isContents(el)) {
				playChildren(el, anim, fill);
			} else {
				play(el, anim, fill);
			}
		}
	}
}
