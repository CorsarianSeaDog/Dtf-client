import { describe, it, expect, vi, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import {
	isFieldVisible,
	getCurrentDevice,
	getCurrentPlatform,
	hasTouchInput,
	matchesVisibility,
	MOBILE_BREAKPOINT,
	type SettingField
} from './types';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('isFieldVisible', () => {
	const fieldWithoutDeps: SettingField = {
		key: 'votes',
		type: 'radio',
		title: 'Оценки',
		default: 'likes',
		options: [{ value: 'likes', title: 'Лайки' }]
	};

	const fieldWithSingleDep: SettingField = {
		key: 'arrowsSide',
		type: 'radio',
		title: 'Стрелки',
		default: 'right',
		dependsOn: { key: 'votes', value: 'rating' },
		options: [{ value: 'right', title: 'Справа' }]
	};

	const fieldWithArrayDep: SettingField = {
		key: 'arrowsOrder',
		type: 'radio',
		title: 'Порядок',
		default: 'down-up',
		dependsOn: { key: 'votes', value: ['rating', 'custom'] },
		options: [{ value: 'down-up', title: 'Вниз / вверх' }]
	};

	const mobileOnlyField: SettingField = {
		key: 'mobileBarBlur',
		type: 'toggle',
		title: 'Блюр мобильного бара',
		default: false,
		device: 'mobile'
	};

	const desktopOnlyField: SettingField = {
		key: 'contentWidth',
		type: 'slider',
		title: 'Ширина контента',
		default: 640,
		steps: [640, 720],
		cssVars: () => ({}),
		device: 'desktop'
	};

	const mobileWithDepField: SettingField = {
		key: 'mobileArrowsSide',
		type: 'radio',
		title: 'Стрелки на мобильном',
		default: 'right',
		device: 'mobile',
		dependsOn: { key: 'votes', value: 'rating' },
		options: [{ value: 'right', title: 'Справа' }]
	};

	it('всегда видимо, если dependsOn не задан', () => {
		expect(isFieldVisible(fieldWithoutDeps, {})).toBe(true);
		expect(isFieldVisible(fieldWithoutDeps, { votes: 'likes' })).toBe(true);
	});

	it('скрытое поле (hidden) не показывается, как бы ни были заданы значения', () => {
		expect(isFieldVisible({ ...fieldWithoutDeps, hidden: true }, { votes: 'likes' })).toBe(false);
	});

	it('видимо только при совпадении одиночного значения dependsOn', () => {
		expect(isFieldVisible(fieldWithSingleDep, { votes: 'likes' })).toBe(false);
		expect(isFieldVisible(fieldWithSingleDep, { votes: 'rating' })).toBe(true);
		expect(isFieldVisible(fieldWithSingleDep, {})).toBe(false);
	});

	it('видимо при совпадении с одним из значений массива dependsOn', () => {
		expect(isFieldVisible(fieldWithArrayDep, { votes: 'likes' })).toBe(false);
		expect(isFieldVisible(fieldWithArrayDep, { votes: 'rating' })).toBe(true);
		expect(isFieldVisible(fieldWithArrayDep, { votes: 'custom' })).toBe(true);
	});

	it('учитывает ограничение по устройству (device: mobile)', () => {
		expect(isFieldVisible(mobileOnlyField, {}, undefined, { device: 'mobile' })).toBe(true);
		expect(isFieldVisible(mobileOnlyField, {}, undefined, { device: 'desktop' })).toBe(false);
	});

	it('учитывает ограничение по устройству (device: desktop)', () => {
		expect(isFieldVisible(desktopOnlyField, {}, undefined, { device: 'desktop' })).toBe(true);
		expect(isFieldVisible(desktopOnlyField, {}, undefined, { device: 'mobile' })).toBe(false);
	});

	it('комбинирует device и dependsOn', () => {
		// Не подходит устройство, даже если dependsOn совпал
		expect(isFieldVisible(mobileWithDepField, { votes: 'rating' }, undefined, { device: 'desktop' })).toBe(false);
		// Устройство подходит, но dependsOn не совпал
		expect(isFieldVisible(mobileWithDepField, { votes: 'likes' }, undefined, { device: 'mobile' })).toBe(false);
		// И устройство, и dependsOn совпали
		expect(isFieldVisible(mobileWithDepField, { votes: 'rating' }, undefined, { device: 'mobile' })).toBe(true);
	});

	it('учитывает ограничение по сенсорному вводу (touch) независимо от ширины экрана', () => {
		const touchField: SettingField = {
			key: 'swipeColumn',
			type: 'toggle',
			title: 'Свайп',
			default: false,
			touch: true
		};

		expect(isFieldVisible(touchField, {}, undefined, { device: 'desktop', touch: false })).toBe(false);
		expect(isFieldVisible(touchField, {}, undefined, { device: 'mobile', touch: false })).toBe(false);
		expect(isFieldVisible(touchField, {}, undefined, { device: 'desktop', touch: true })).toBe(true);
		expect(isFieldVisible(touchField, {}, undefined, { device: 'mobile', touch: true })).toBe(true);
	});

	it('учитывает ограничение по платформе (platform) и нативной оболочке (native)', () => {
		const androidField: SettingField = {
			key: 'haptics',
			type: 'toggle',
			title: 'Вибрация',
			default: true,
			platform: 'android'
		};
		const nativeAndroidField: SettingField = {
			key: 'predictiveBack',
			type: 'toggle',
			title: 'Predictive Back',
			default: false,
			platform: 'android',
			native: true
		};
		const mobileOsField: SettingField = {
			key: 'mobileOsFeature',
			type: 'toggle',
			title: 'Только Android и iOS',
			default: false,
			platform: ['android', 'ios']
		};

		expect(isFieldVisible(androidField, {}, undefined, { device: 'mobile', touch: true, platform: 'android', native: false })).toBe(true);
		expect(isFieldVisible(androidField, {}, undefined, { device: 'mobile', touch: true, platform: 'android', native: true })).toBe(true);
		expect(isFieldVisible(androidField, {}, undefined, { device: 'mobile', touch: true, platform: 'ios', native: false })).toBe(false);
		expect(isFieldVisible(androidField, {}, undefined, { device: 'desktop', touch: false, platform: 'windows', native: false })).toBe(false);

		expect(isFieldVisible(nativeAndroidField, {}, undefined, { device: 'mobile', touch: true, platform: 'android', native: false })).toBe(false);
		expect(isFieldVisible(nativeAndroidField, {}, undefined, { device: 'mobile', touch: true, platform: 'android', native: true })).toBe(true);
		expect(isFieldVisible(nativeAndroidField, {}, undefined, { device: 'mobile', touch: true, platform: 'ios', native: true })).toBe(false);

		expect(isFieldVisible(mobileOsField, {}, undefined, { device: 'desktop', touch: true, platform: 'android', native: false })).toBe(true);
		expect(isFieldVisible(mobileOsField, {}, undefined, { device: 'mobile', touch: true, platform: 'ios', native: false })).toBe(true);
		expect(isFieldVisible(mobileOsField, {}, undefined, { device: 'desktop', touch: false, platform: 'linux', native: false })).toBe(false);
	});
});

describe('matchesVisibility', () => {
	it('проверяет native: false только для браузера', () => {
		expect(matchesVisibility({ native: false }, { native: false })).toBe(true);
		expect(matchesVisibility({ native: false }, { native: true })).toBe(false);
	});
});

describe('getCurrentPlatform', () => {
	it('возвращает other без window (SSR)', () => {
		expect(getCurrentPlatform()).toBe('other');
	});

	it('определяет Android и iOS через Capacitor даже без мобильного User-Agent', () => {
		vi.stubGlobal('window', {});
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64', maxTouchPoints: 0 });
		const spy = vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
		expect(getCurrentPlatform()).toBe('android');

		spy.mockReturnValue('ios');
		expect(getCurrentPlatform()).toBe('ios');
	});

	it('определяет Android в браузере (Chrome, Firefox, планшет, desktop mode через userAgentData)', () => {
		vi.stubGlobal('window', {});
		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
			platform: 'Linux armv81',
			maxTouchPoints: 5
		});
		expect(getCurrentPlatform()).toBe('android');

		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0',
			platform: 'Linux aarch64',
			maxTouchPoints: 5
		});
		expect(getCurrentPlatform()).toBe('android');

		// Режим ПК на Android при сохранённом Client Hint
		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
			platform: 'Linux x86_64',
			userAgentData: { platform: 'Android' },
			maxTouchPoints: 5
		});
		expect(getCurrentPlatform()).toBe('android');
	});

	it('определяет iOS и iPadOS в браузере', () => {
		vi.stubGlobal('window', {});
		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
			platform: 'iPhone',
			maxTouchPoints: 5
		});
		expect(getCurrentPlatform()).toBe('ios');

		// iPadOS 13+ представляется как Macintosh, но с тачскрином
		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
			platform: 'MacIntel',
			maxTouchPoints: 5
		});
		expect(getCurrentPlatform()).toBe('ios');
	});

	it('определяет десктопные ОС в браузере', () => {
		vi.stubGlobal('window', {});
		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
			platform: 'Win32',
			maxTouchPoints: 0
		});
		expect(getCurrentPlatform()).toBe('windows');

		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
			platform: 'MacIntel',
			maxTouchPoints: 0
		});
		expect(getCurrentPlatform()).toBe('macos');

		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36',
			platform: 'MacIntel',
			userAgentData: { platform: 'macOS' },
			maxTouchPoints: 5
		});
		expect(getCurrentPlatform()).toBe('macos');

		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
			platform: 'Linux x86_64',
			maxTouchPoints: 0
		});
		expect(getCurrentPlatform()).toBe('linux');
	});
});

describe('hasTouchInput', () => {
	it('определяет тач по (any-pointer: coarse) и navigator.maxTouchPoints', () => {
		vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: q === '(any-pointer: coarse)' }) });
		vi.stubGlobal('navigator', { maxTouchPoints: 0 });
		expect(hasTouchInput()).toBe(true);

		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		vi.stubGlobal('navigator', { maxTouchPoints: 5 });
		expect(hasTouchInput()).toBe(true);

		vi.stubGlobal('navigator', { maxTouchPoints: 0 });
		expect(hasTouchInput()).toBe(false);
		vi.unstubAllGlobals();
	});
});

describe('getCurrentDevice', () => {
	it('MOBILE_BREAKPOINT равен 719', () => {
		expect(MOBILE_BREAKPOINT).toBe(719);
	});

	it('возвращает mobile если ширина попадает в max-width 719px', () => {
		vi.stubGlobal('window', {
			matchMedia: (query: string) => ({
				matches: query === `(max-width: ${MOBILE_BREAKPOINT}px)`
			})
		});
		expect(getCurrentDevice()).toBe('mobile');
		vi.unstubAllGlobals();
	});

	it('возвращает desktop если ширина превышает 719px', () => {
		vi.stubGlobal('window', {
			matchMedia: () => ({ matches: false })
		});
		expect(getCurrentDevice()).toBe('desktop');
		vi.unstubAllGlobals();
	});
});
