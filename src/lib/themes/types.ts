import { Capacitor } from '@capacitor/core';
import type { ThemeMotion } from '$lib/motion';

/** Описание темы. Лежит в `<тема>/theme.ts`, реестр находит его сам (см. registry.ts). */

export interface FieldDependency {
	/** Ключ поля, от которого зависит видимость */
	key: string;
	/** Значение или список значений, при которых поле видимо */
	value: SettingValue | SettingValue[];
}

/** Брейкпоинт мобильных устройств (смартфонов). До 719px включительно — мобильный режим, выше — десктоп */
export const MOBILE_BREAKPOINT = 719;

/** Устройство, на котором отображается настройка */
export type SettingDevice = 'mobile' | 'desktop';

/** Платформа (ОС), на которой отображается настройка */
export type SettingPlatform = 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'other';

export interface SettingVisibility {
	/** Устройство, на котором доступна настройка: только смартфоны ('mobile') или десктопы ('desktop') */
	device?: SettingDevice | SettingDevice[];
	/** Настройка актуальна только при наличии сенсорного ввода (смартфоны, планшеты, гибридные экраны) */
	touch?: boolean;
	/** Платформа (ОС), на которой доступна настройка (определяется и в браузере, и в Capacitor) */
	platform?: SettingPlatform | SettingPlatform[];
	/** Настройка только для нативного приложения Capacitor (`true`) или только для браузера (`false`) */
	native?: boolean;
}

export interface VisibilityContext {
	device?: SettingDevice;
	touch?: boolean;
	platform?: SettingPlatform;
	native?: boolean;
}

interface FieldBase extends SettingVisibility {
	/** Ключ в сохранённых настройках темы */
	key: string;
	title: string;
	description?: string;
	/** Условие показа: поле отображается только если значение другого поля совпадает с указанным */
	dependsOn?: FieldDependency;
	/** Жёлтая пометка рядом с названием настройки, например `EXPERIMENTAL`. Снимается удалением этого поля */
	note?: string;
	/** Настройка временно не показывается в настройках; значение по умолчанию и сохранённое продолжают действовать */
	hidden?: boolean;
}

/** Текст пометки для `note`: так её проще найти поиском и убрать, когда функция перестанет быть экспериментальной */
export const EXPERIMENTAL = 'experimental';

export interface ChoiceOption {
	value: string;
	title: string;
	description?: string;
	/** Жёлтая пометка рядом с названием варианта, как `note` у поля */
	note?: string;
}

/** Выбор одного из вариантов (радиокнопки или выпадающий список) */
export interface ChoiceField extends FieldBase {
	type: 'radio' | 'select';
	options: ChoiceOption[];
	default: string;
}

/** Переключатель вкл/выкл */
export interface ToggleField extends FieldBase {
	type: 'toggle';
	default: boolean;
}

/** Ползунок с делениями: выбирается одно из чисел `steps` */
export interface SliderField extends FieldBase {
	type: 'slider';
	steps: number[];
	default: number;
	/** Подпись к значению, например `px` */
	unit?: string;
	/** CSS-переменные корня, которые выставляются по значению */
	cssVars: (value: number) => Record<string, string>;
}

export type SettingField = ChoiceField | ToggleField | SliderField;
export type SettingValue = string | boolean | number;

/** Определяет текущий тип устройства по медиавыражению ширины экрана (<= 719px — mobile, иначе desktop) */
export function getCurrentDevice(): SettingDevice {
	if (typeof window !== 'undefined') {
		if (typeof window.matchMedia === 'function') {
			return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches ? 'mobile' : 'desktop';
		}
		if (typeof window.innerWidth === 'number') {
			return window.innerWidth <= MOBILE_BREAKPOINT ? 'mobile' : 'desktop';
		}
	}
	return 'desktop';
}

/** Определяет, поддерживает ли устройство сенсорный ввод (смартфоны, планшеты, гибридные экраны) */
export function hasTouchInput(): boolean {
	if (typeof window !== 'undefined') {
		if (typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches) {
			return true;
		}
		if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) {
			return true;
		}
	}
	return false;
}

function fromCapacitor<T>(read: () => T | undefined): T | undefined {
	if (typeof window === 'undefined') return undefined;
	try {
		return read();
	} catch {
		return undefined;
	}
}

/** Определяет текущую платформу (ОС) одинаково надёжно и в браузере, и в Capacitor */
export function getCurrentPlatform(): SettingPlatform {
	const capPlatform = fromCapacitor(() => Capacitor.getPlatform?.());
	if (capPlatform === 'android' || capPlatform === 'ios') return capPlatform;
	if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'other';

	const hint = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform?.toLowerCase();
	if (hint === 'android' || hint === 'ios' || hint === 'windows' || hint === 'macos' || hint === 'linux') {
		return hint;
	}

	const ua = navigator.userAgent || '';
	const navPlatform = navigator.platform || '';
	const source = `${ua}\n${navPlatform}`;

	// Android проверяем до Linux, потому что в его User-Agent есть строка «Linux»
	if (/android/i.test(source)) return 'android';

	// iPhone/iPad/iPod, включая iPadOS 13+, который представляется как Macintosh с тачскрином
	if (/iphone|ipad|ipod/i.test(source) || (/mac/i.test(source) && navigator.maxTouchPoints > 1)) {
		return 'ios';
	}

	if (/windows|\bwin/i.test(source)) return 'windows';
	if (/\bmac/i.test(source)) return 'macos';
	if (/linux|x11/i.test(source)) return 'linux';
	return 'other';
}

function matchesOneOf<T>(expected: T | T[], actual: T): boolean {
	return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}

/** Выбирает только поля видимости (удобно при пробросе метаданных в поиск) */
export function pickVisibility(v: SettingVisibility): SettingVisibility {
	return { device: v.device, touch: v.touch, platform: v.platform, native: v.native };
}

/** Проверяет ограничения видимости по устройству, сенсорному вводу, платформе и нативной оболочке */
export function matchesVisibility(target: SettingVisibility, ctx: VisibilityContext = {}): boolean {
	if (target.touch && !(ctx.touch ?? hasTouchInput())) return false;
	if (target.native !== undefined && target.native !== (ctx.native ?? Boolean(fromCapacitor(() => Capacitor.isNativePlatform?.())))) return false;
	if (target.device && !matchesOneOf(target.device, ctx.device ?? getCurrentDevice())) return false;
	if (target.platform && !matchesOneOf(target.platform, ctx.platform ?? getCurrentPlatform())) return false;
	return true;
}

/** Проверяет, должно ли отображаться поле с учётом `dependsOn` и ограничений видимости */
export function isFieldVisible(
	field: SettingField,
	values: Record<string, any> = {},
	allFields?: SettingField[],
	ctx: VisibilityContext = {}
): boolean {
	if (field.hidden) return false;
	if (!matchesVisibility(field, ctx)) return false;

	if (!field.dependsOn) return true;
	let current = values[field.dependsOn.key];
	if (current === undefined && allFields) {
		const target = allFields.find((f) => f.key === field.dependsOn?.key);
		if (target) current = target.default;
	}
	return matchesOneOf(field.dependsOn.value, current);
}

export interface ThemePalette {
	id: string;
	title: string;
	/** Базовый режим системных элементов и общих компонентов. */
	mode: 'light' | 'dark';
	/** Фон страницы до загрузки CSS темы. */
	background: string;
	/** Цвет панели браузера. */
	themeColor: string;
}

export interface ThemePalettes {
	/** Палитра при неизвестном сохранённом выборе. */
	default: string;
	/** Соответствие системного режима палитрам темы. */
	system: { light: string; dark: string };
	options: [ThemePalette, ...ThemePalette[]];
}

export interface ThemeManifest {
	/** Совпадает с именем папки темы */
	id: string;
	name: string;
	/** Скрыть из обычного выбора темы; в дебаге тема остаётся доступной. */
	hidden?: boolean;
	/** Жесты пальцем: свайп лент и «назад» в мобильной раскладке, свайп по комментарию. Форк не наследует поле, включает сам */
	gestures?: boolean;
	/** Поиск по записям и комментариям в профиле (поле dtf2022/Profile). Форк не наследует поле, включает сам */
	profileSearch?: boolean;
	description?: string;
	/**
	 * id темы-основы (форк). Недостающие компоненты, стили и настройки берутся у неё,
	 * так что исправления основы попадают в форк сами.
	 */
	extends?: string;
	/** Набор палитр. Форк без своего набора наследует набор основы целиком. */
	palettes?: ThemePalettes;
	/**
	 * Анимации темы (docs/architecture/motion.md), например `fluent` из `$lib/motion`. Не указаны —
	 * тема не анимирует ничего, кроме затемнения за окном. Форк не наследует поле.
	 * Функция получает значения настроек темы: так набор зависит от её настроек (и от устройства).
	 */
	motion?: ThemeMotion | ((values: Record<string, SettingValue>) => ThemeMotion | undefined);
	/** Настройки, которые тема показывает на своей вкладке в настройках */
	settings?: SettingField[];
}

/** Нужна только ради подсказок типов в theme.ts */
export function defineTheme(manifest: ThemeManifest): ThemeManifest {
	return manifest;
}
