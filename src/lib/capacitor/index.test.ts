import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	openDtfUrl: vi.fn(),
	openDtfLink: vi.fn(),
	closeOverlay: vi.fn(),
	popSubstate: vi.fn()
}));

const mockPageState: { overlays: any[] } = { overlays: [] };
vi.mock('$app/state', () => ({
	page: {
		get state() {
			return mockPageState;
		}
	}
}));

const appMocks = vi.hoisted(() => ({
	minimizeApp: vi.fn().mockResolvedValue(undefined),
	isNativePlatform: vi.fn(() => false),
	browserOpen: vi.fn().mockResolvedValue(undefined),
	setBackEnabled: vi.fn()
}));

vi.mock('./back', () => ({
	getBackDriver: vi.fn(),
	initNativeBack: vi.fn(),
	setBackEnabled: appMocks.setBackEnabled
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: appMocks.isNativePlatform,
		isPluginAvailable: () => false
	},
	registerPlugin: () => ({})
}));

vi.mock('@capacitor/browser', () => ({
	Browser: {
		open: appMocks.browserOpen
	}
}));

vi.mock('@capacitor/app', () => ({
	App: {
		minimizeApp: appMocks.minimizeApp,
		addListener: vi.fn(),
		getLaunchUrl: vi.fn().mockResolvedValue({ url: '' })
	}
}));

vi.mock('$lib/navigation', () => ({
	openDtfUrl: mocks.openDtfUrl,
	openDtfLink: mocks.openDtfLink,
	closeOverlay: mocks.closeOverlay,
	popSubstate: mocks.popSubstate
}));

import { getBackDriver, initNativeBack } from './back';
import { contextMenuState } from '$lib/contextMenu.svelte';
import { isNative, openExternalUrl, updateStatusBar, hideSplashScreen, notifyAppReady, initCapacitor, handleAppUrl, handleNativeLinkClick, handleBackButton, syncBackHandler } from './index';

describe('Capacitor bridge', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		contextMenuState.close();
		mocks.openDtfUrl.mockReset();
		mocks.openDtfLink.mockReset();
		mocks.closeOverlay.mockReset();
		mocks.popSubstate.mockReset();
		appMocks.minimizeApp.mockReset();
		appMocks.minimizeApp.mockResolvedValue(undefined);
		appMocks.isNativePlatform.mockReset();
		appMocks.isNativePlatform.mockReturnValue(false);
		appMocks.browserOpen.mockReset();
		appMocks.browserOpen.mockResolvedValue(undefined);
		appMocks.setBackEnabled.mockReset();
		mockPageState.overlays = [];
	});

	it('корректно определяет отсутствие нативной платформы в тестовом окружении', () => {
		expect(isNative()).toBe(false);
	});

	it('безопасно выполняется без ошибок вне нативного контейнера', async () => {
		await expect(updateStatusBar(true)).resolves.toBeUndefined();
		await expect(hideSplashScreen()).resolves.toBeUndefined();
		await expect(notifyAppReady()).resolves.toBeUndefined();
		expect(() => initCapacitor()).not.toThrow();
	});

	it('системный жест поверх меню закрывает меню и оставляет страницу на месте', () => {
		appMocks.isNativePlatform.mockReturnValue(true);
		vi.stubGlobal('window', { history: { length: 1 } });
		vi.stubGlobal('document', { addEventListener: vi.fn(), documentElement: { dataset: {} } });
		initCapacitor();
		const [driver, invoke] = vi.mocked(initNativeBack).mock.lastCall!;
		const pageDriver = { start: vi.fn(), move: vi.fn(), end: vi.fn() };
		vi.mocked(getBackDriver).mockReturnValue(pageDriver);
		contextMenuState.open({ x: 0, y: 0, mode: 'sheet', payload: { items: [{ id: 'open', label: 'Открыть' }] } });
		expect(driver()).toBeUndefined();
		invoke();
		expect(contextMenuState.current).toBeNull();
		expect(driver()).toBe(pageDriver);
		expect(mocks.closeOverlay).not.toHaveBeenCalled();
	});

	it('openExternalUrl вызывает window.open при вызове в браузере', async () => {
		const openMock = vi.fn();
		vi.stubGlobal('window', { open: openMock });
		await openExternalUrl('https://dtf.ru');
		expect(openMock).toHaveBeenCalledWith('https://dtf.ru', '_blank', 'noopener,noreferrer');
	});

	describe('openExternalUrl в нативном приложении', () => {
		it.each([
			'https://dtf.ru/5389802',
			'https://www.dtf.ru/5389802?comment=123',
			'http://dtf.ru/settings/general',
			'https://redtf.org/post/5389802',
			'https://www.redtf.org/'
		])('открывает %s через AndroidBridge.openExternalUrl в обход App Links', async (url) => {
			appMocks.isNativePlatform.mockReturnValue(true);
			const bridgeOpen = vi.fn().mockReturnValue(true);
			const openMock = vi.fn();
			vi.stubGlobal('window', { open: openMock, AndroidBridge: { openExternalUrl: bridgeOpen } });

			await openExternalUrl(url);

			expect(bridgeOpen).toHaveBeenCalledWith(url);
			expect(appMocks.browserOpen).not.toHaveBeenCalled();
			expect(openMock).not.toHaveBeenCalled();
		});

		it('откатывается на Browser.open, если AndroidBridge.openExternalUrl отсутствует или вернул false', async () => {
			appMocks.isNativePlatform.mockReturnValue(true);
			vi.stubGlobal('window', { open: vi.fn() });

			await openExternalUrl('https://dtf.ru/5389802');
			expect(appMocks.browserOpen).toHaveBeenCalledWith({ url: 'https://dtf.ru/5389802' });

			appMocks.browserOpen.mockClear();
			const bridgeOpen = vi.fn().mockReturnValue(false);
			vi.stubGlobal('window', { open: vi.fn(), AndroidBridge: { openExternalUrl: bridgeOpen } });

			await openExternalUrl('https://dtf.ru/5389802');
			expect(bridgeOpen).toHaveBeenCalledWith('https://dtf.ru/5389802');
			expect(appMocks.browserOpen).toHaveBeenCalledWith({ url: 'https://dtf.ru/5389802' });
		});

		it('откатывается на Browser.open, если AndroidBridge.openExternalUrl выбросил исключение', async () => {
			appMocks.isNativePlatform.mockReturnValue(true);
			const bridgeOpen = vi.fn(() => {
				throw new Error('bridge error');
			});
			vi.stubGlobal('window', { open: vi.fn(), AndroidBridge: { openExternalUrl: bridgeOpen } });

			await openExternalUrl('https://dtf.ru/5389802');

			expect(appMocks.browserOpen).toHaveBeenCalledWith({ url: 'https://dtf.ru/5389802' });
		});

		it.each([
			'https://github.com/re-dtf',
			'https://m.dtf.ru/5389802',
			'https://evil-dtf.ru/5389802'
		])('для стороннего домена %s использует Browser.open без AndroidBridge', async (url) => {
			appMocks.isNativePlatform.mockReturnValue(true);
			const bridgeOpen = vi.fn().mockReturnValue(true);
			vi.stubGlobal('window', { open: vi.fn(), AndroidBridge: { openExternalUrl: bridgeOpen } });

			await openExternalUrl(url);

			expect(bridgeOpen).not.toHaveBeenCalled();
			expect(appMocks.browserOpen).toHaveBeenCalledWith({ url });
		});

		it('откатывается на window.open, если Browser.open завершился ошибкой', async () => {
			appMocks.isNativePlatform.mockReturnValue(true);
			appMocks.browserOpen.mockRejectedValueOnce(new Error('no browser'));
			const openMock = vi.fn();
			vi.stubGlobal('window', { open: openMock });

			await openExternalUrl('https://github.com/re-dtf');

			expect(openMock).toHaveBeenCalledWith('https://github.com/re-dtf', '_blank', 'noopener,noreferrer');
		});
	});

	describe('handleAppUrl', () => {
		it.each([
			'https://dtf.ru/games/111111-test',
			'https://dtf.ru/donatovnet',
			'https://redtf.org/post/111111',
			'https://redtf.org/u/donatovnet'
		])('открывает %s через openDtfUrl', async (url) => {
			mocks.openDtfUrl.mockReturnValue(true);

			const result = await handleAppUrl(url);

			expect(mocks.openDtfUrl).toHaveBeenCalledWith(url);
			expect(result).toBe(true);
		});

		it('для неподдерживаемых страниц dtf.ru и redtf.org открывает системный браузер', async () => {
			mocks.openDtfUrl.mockReturnValue(false);
			const openMock = vi.fn();
			vi.stubGlobal('window', { open: openMock });

			const dtfResult = await handleAppUrl('https://dtf.ru/rules');
			expect(mocks.openDtfUrl).toHaveBeenCalledWith('https://dtf.ru/rules');
			expect(openMock).toHaveBeenCalledWith('https://dtf.ru/rules', '_blank', 'noopener,noreferrer');
			expect(dtfResult).toBe(true);

			const redtfResult = await handleAppUrl('https://redtf.org/rules');
			expect(mocks.openDtfUrl).toHaveBeenCalledWith('https://redtf.org/rules');
			expect(openMock).toHaveBeenCalledWith('https://redtf.org/rules', '_blank', 'noopener,noreferrer');
			expect(redtfResult).toBe(true);
		});

		it.each(['https://google.com/search', 'https://dtf.ru.evil.com/rules'])('игнорирует посторонний URL %s', async (url) => {
			mocks.openDtfUrl.mockReturnValue(false);

			const result = await handleAppUrl(url);

			expect(mocks.openDtfUrl).not.toHaveBeenCalled();
			expect(result).toBe(false);
		});

		it('дедуплицирует повторные вызовы одного и того же URL при одновременных событиях', async () => {
			mocks.openDtfUrl.mockReturnValue(true);

			const first = await handleAppUrl('https://dtf.ru/games/222222-dedup');
			const second = await handleAppUrl('https://dtf.ru/games/222222-dedup');

			expect(first).toBe(true);
			expect(second).toBe(true);
			expect(mocks.openDtfUrl).toHaveBeenCalledTimes(1);
		});
	});

	describe('handleNativeLinkClick', () => {
		it.each([
			'https://dtf.ru/games/333333',
			'https://dtf.ru/donatovnet',
			'https://redtf.org/post/333333',
			'https://redtf.org/u/donatovnet'
		])('перехватывает клик по %s через openDtfLink', (url) => {
			mocks.openDtfLink.mockReturnValue(true);

			const anchor = {
				closest: (selector: string) => (selector === 'a' ? anchor : null),
				getAttribute: (attr: string) => (attr === 'href' ? url : null)
			};

			const event = {
				defaultPrevented: false,
				button: 0,
				target: anchor,
				preventDefault: vi.fn()
			} as unknown as MouseEvent;

			handleNativeLinkClick(event);

			expect(mocks.openDtfLink).toHaveBeenCalledWith(event, url);
			expect(event.preventDefault).not.toHaveBeenCalled();
		});

		it('перехватывает внешние ссылки и открывает через openExternalUrl', () => {
			mocks.openDtfLink.mockReturnValue(false);
			const openMock = vi.fn();
			vi.stubGlobal('window', { open: openMock, location: { origin: 'https://localhost' } });

			const anchor = {
				closest: (selector: string) => (selector === 'a' ? anchor : null),
				getAttribute: (attr: string) => (attr === 'href' ? 'https://github.com/re-dtf' : null)
			};

			const preventDefault = vi.fn();
			const event = {
				defaultPrevented: false,
				button: 0,
				target: anchor,
				preventDefault
			} as unknown as MouseEvent;

			handleNativeLinkClick(event);

			expect(preventDefault).toHaveBeenCalled();
			expect(openMock).toHaveBeenCalledWith('https://github.com/re-dtf', '_blank', 'noopener,noreferrer');
		});

		it('не перехватывает ссылки с атрибутом download', () => {
			mocks.openDtfLink.mockReturnValue(false);
			const openMock = vi.fn();
			vi.stubGlobal('window', { open: openMock });

			const anchor = {
				closest: (selector: string) => (selector === 'a' ? anchor : null),
				getAttribute: (attr: string) => (attr === 'href' ? 'https://leonardo.osnova.io/test.jpg' : null),
				hasAttribute: (attr: string) => attr === 'download'
			};

			const preventDefault = vi.fn();
			const event = {
				defaultPrevented: false,
				button: 0,
				target: anchor,
				preventDefault
			} as unknown as MouseEvent;

			handleNativeLinkClick(event);

			expect(preventDefault).not.toHaveBeenCalled();
			expect(openMock).not.toHaveBeenCalled();
		});

		it.each(['https://dtf.ru/5389802', 'https://redtf.org/post/5389802'])(
			'ссылку %s с target="_blank" открывает во внешнем браузере в обход openDtfLink, даже при совпадении origin',
			async (href) => {
				appMocks.isNativePlatform.mockReturnValue(true);
				const bridgeOpen = vi.fn().mockReturnValue(true);
				vi.stubGlobal('window', {
					open: vi.fn(),
					location: { origin: 'https://redtf.org' },
					AndroidBridge: { openExternalUrl: bridgeOpen }
				});

				const anchor = {
					closest: (selector: string) => (selector === 'a' ? anchor : null),
					getAttribute: (attr: string) => ({ href, target: '_blank' })[attr] ?? null
				};
				const preventDefault = vi.fn();
				const event = { defaultPrevented: false, button: 0, target: anchor, preventDefault } as unknown as MouseEvent;

				handleNativeLinkClick(event);
				await Promise.resolve();

				expect(mocks.openDtfLink).not.toHaveBeenCalled();
				expect(preventDefault).toHaveBeenCalled();
				expect(bridgeOpen).toHaveBeenCalledWith(href);
			}
		);
	});

	describe('handleBackButton', () => {
		it('закрывает открытое контекстное меню раньше popSubstate и closeOverlay', () => {
			contextMenuState.open({
				x: 0,
				y: 0,
				mode: 'sheet',
				payload: { items: [{ id: 'save', label: 'Сохранить' }] }
			});
			mocks.popSubstate.mockReturnValue(true);
			mockPageState.overlays = [{ id: 'post-1', type: 'post' }];

			handleBackButton(true);

			expect(contextMenuState.current).toBeNull();
			expect(mocks.popSubstate).not.toHaveBeenCalled();
			expect(mocks.closeOverlay).not.toHaveBeenCalled();
			expect(appMocks.minimizeApp).not.toHaveBeenCalled();
		});

		it('выходит из полноэкранного режима вместо закрытия оверлея или сворачивания приложения', () => {
			const exitFullscreen = vi.fn().mockResolvedValue(undefined);
			vi.stubGlobal('document', {
				fullscreenElement: {},
				exitFullscreen
			});
			mocks.popSubstate.mockReturnValue(true);
			mockPageState.overlays = [{ id: 'post-1', type: 'post' }];

			handleBackButton(true);

			expect(exitFullscreen).toHaveBeenCalledTimes(1);
			expect(mocks.popSubstate).not.toHaveBeenCalled();
			expect(mocks.closeOverlay).not.toHaveBeenCalled();
			expect(appMocks.minimizeApp).not.toHaveBeenCalled();
		});

		it('выходит из полноэкранного режима через webkitExitFullscreen при наличии webkitFullscreenElement', () => {
			const webkitExitFullscreen = vi.fn();
			vi.stubGlobal('document', {
				fullscreenElement: null,
				webkitFullscreenElement: {},
				webkitExitFullscreen
			});

			handleBackButton(false);

			expect(webkitExitFullscreen).toHaveBeenCalledTimes(1);
			expect(appMocks.minimizeApp).not.toHaveBeenCalled();
		});

		it('вызывает popSubstate и не закрывает оверлей, если есть активный вложенный шаг', () => {
			mocks.popSubstate.mockReturnValue(true);
			mockPageState.overlays = [{ id: 'settings-1', type: 'settings' }];

			handleBackButton(true);

			expect(mocks.popSubstate).toHaveBeenCalled();
			expect(mocks.closeOverlay).not.toHaveBeenCalled();
			expect(appMocks.minimizeApp).not.toHaveBeenCalled();
		});

		it('закрывает оверлей через closeOverlay, если вложенных шагов нет, но открыт оверлей', () => {
			mocks.popSubstate.mockReturnValue(false);
			mockPageState.overlays = [{ id: 'settings-1', type: 'settings' }];

			handleBackButton(true);

			expect(mocks.popSubstate).toHaveBeenCalled();
			expect(mocks.closeOverlay).toHaveBeenCalled();
			expect(appMocks.minimizeApp).not.toHaveBeenCalled();
		});

		it('переходит назад по истории, если нет оверлеев и canGoBack=true на глубоком URL', () => {
			mocks.popSubstate.mockReturnValue(false);
			mockPageState.overlays = [];
			const backMock = vi.fn();
			vi.stubGlobal('window', {
				location: { pathname: '/post/123' },
				history: { back: backMock }
			});

			handleBackButton(true);

			expect(backMock).toHaveBeenCalled();
			expect(appMocks.minimizeApp).not.toHaveBeenCalled();
		});

		it('сворачивает приложение на главном экране без оверлеев', () => {
			mocks.popSubstate.mockReturnValue(false);
			mockPageState.overlays = [];
			vi.stubGlobal('window', {
				location: { pathname: '/' },
				history: { back: vi.fn() }
			});

			handleBackButton(false);

			expect(appMocks.minimizeApp).toHaveBeenCalled();
		});
	});

	describe('syncBackHandler', () => {
		it('ничего не делает вне нативной платформы', () => {
			appMocks.isNativePlatform.mockReturnValue(false);
			syncBackHandler(true);
			expect(appMocks.setBackEnabled).not.toHaveBeenCalled();
		});

		it('всегда включает перехват, если предиктивный жест выключен', () => {
			appMocks.isNativePlatform.mockReturnValue(true);
			vi.stubGlobal('window', { location: { pathname: '/' } });
			vi.stubGlobal('document', {});
			syncBackHandler(false);
			expect(appMocks.setBackEnabled).toHaveBeenCalledWith(true);
		});

		it('отключает перехват на главной без оверлеев при включённом предиктивном жесте', () => {
			appMocks.isNativePlatform.mockReturnValue(true);
			mockPageState.overlays = [];
			vi.stubGlobal('window', { location: { pathname: '/' } });
			vi.stubGlobal('document', {});
			syncBackHandler(true);
			expect(appMocks.setBackEnabled).toHaveBeenCalledWith(false);
		});

		it('включает перехват, если открыто контекстное меню на главной без оверлеев', () => {
			appMocks.isNativePlatform.mockReturnValue(true);
			mockPageState.overlays = [];
			vi.stubGlobal('window', { location: { pathname: '/' } });
			vi.stubGlobal('document', {});
			contextMenuState.open({
				x: 0,
				y: 0,
				mode: 'sheet',
				payload: { items: [{ id: 'save', label: 'Сохранить' }] }
			});

			syncBackHandler(true);
			expect(appMocks.setBackEnabled).toHaveBeenCalledWith(true);
		});

		it('включает перехват, если есть оверлеи', () => {
			appMocks.isNativePlatform.mockReturnValue(true);
			mockPageState.overlays = [{ id: 'post-1', type: 'post' }];
			vi.stubGlobal('window', { location: { pathname: '/' } });
			vi.stubGlobal('document', {});
			syncBackHandler(true);
			expect(appMocks.setBackEnabled).toHaveBeenCalledWith(true);
		});
	});
});
