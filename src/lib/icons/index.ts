import { asset } from '$app/paths';
import { isNative } from '$lib/capacitor';

export type AppIconId = 'default' | 'bluer' | 'white' | 'custom';

export type AppSvgAsset = 'icons/app-default.svg' | 'icons/app-bluer.svg' | 'icons/app-white.svg';
export type FavSvgAsset = 'icons/fav-default.svg' | 'icons/fav-bluer.svg' | 'icons/fav-white.svg';
export type AppleIconAsset = 'icons/app-default-180.png' | 'icons/app-bluer-180.png' | 'icons/app-white-180.png';
export type ManifestAsset = 'manifest.webmanifest' | 'manifest-bluer.webmanifest' | 'manifest-white.webmanifest';

export interface AppIconInfo {
	id: AppIconId;
	title: string;
	description: string;
	bgColor: string;
	textColor: string;
	appSvg: AppSvgAsset;
	favSvg: FavSvgAsset;
	appleIcon: AppleIconAsset;
	manifest: ManifestAsset;
}

export const APP_ICONS: AppIconInfo[] = [
	{
		id: 'default',
		title: 'Стандартная',
		description: 'Светло-голубой фон с чёрным логотипом',
		bgColor: '#D9F5FF',
		textColor: '#000000',
		appSvg: 'icons/app-default.svg',
		favSvg: 'icons/fav-default.svg',
		appleIcon: 'icons/app-default-180.png',
		manifest: 'manifest.webmanifest'
	},
	{
		id: 'bluer',
		title: 'Голубая',
		description: 'Насыщенный небесно-голубой фон',
		bgColor: '#BEE6FF',
		textColor: '#000000',
		appSvg: 'icons/app-bluer.svg',
		favSvg: 'icons/fav-bluer.svg',
		appleIcon: 'icons/app-bluer-180.png',
		manifest: 'manifest-bluer.webmanifest'
	},
	{
		id: 'white',
		title: 'Белая',
		description: 'Белый фон с синим логотипом DTF',
		bgColor: '#FFFFFF',
		textColor: '#1693E5',
		appSvg: 'icons/app-white.svg',
		favSvg: 'icons/fav-white.svg',
		appleIcon: 'icons/app-white-180.png',
		manifest: 'manifest-white.webmanifest'
	}
];

export function getAppIcon(id: string): AppIconInfo {
	return APP_ICONS.find((i) => i.id === id) || APP_ICONS[0];
}

/**
 * Проверка, запущено ли приложение в режиме PWA / standalone (на домашнем экране).
 */
export function isPwa(): boolean {
	if (typeof window === 'undefined') return false;
	const nav = navigator as unknown as { standalone?: boolean };
	return (
		window.matchMedia?.('(display-mode: standalone)').matches === true ||
		window.matchMedia?.('(display-mode: window-controls-overlay)').matches === true ||
		nav.standalone === true ||
		(typeof document !== 'undefined' && document.referrer.includes('android-app://'))
	);
}

/**
 * Точка интеграции для Capacitor / нативных обёрток.
 * Когда в проект будет добавлен Capacitor, зарегистрируйте обработчик смены нативного значка:
 * registerCapacitorIconBridge(async (iconId) => { await AppIconPlugin.change({ name: iconId }); });
 */
export type CapacitorIconBridge = (iconId: AppIconId) => Promise<boolean | void> | boolean | void;

let customCapacitorBridge: CapacitorIconBridge | null = null;

export function registerCapacitorIconBridge(bridge: CapacitorIconBridge | null) {
	customCapacitorBridge = bridge;
}

export async function notifyCapacitorIconChange(id: AppIconId): Promise<void> {
	if (customCapacitorBridge) {
		try {
			await customCapacitorBridge(id);
			return;
		} catch (err) {
			console.warn('[appIcon] Capacitor bridge error:', err);
		}
	}

	// Автоопределение типичного плагина Capacitor, если он объявлен в глобальной области
	if (typeof window !== 'undefined') {
		const cap = (window as unknown as {
			Capacitor?: {
				Plugins?: {
					AppIcon?: {
						change?: (options: { name: string }) => Promise<unknown>;
						set?: (options: { name: string }) => Promise<unknown>;
					};
				};
			};
		}).Capacitor;

		const plugin = cap?.Plugins?.AppIcon;
		if (plugin) {
			try {
				if (plugin.change) {
					await plugin.change({ name: id });
				} else if (plugin.set) {
					await plugin.set({ name: id });
				}
			} catch (err) {
				console.warn('[appIcon] Native Capacitor icon change failed:', err);
			}
		}
	}
}

/**
 * Генерирует data URI веб-манифеста с пользовательской иконкой.
 */
export function createCustomManifest(dataUri: string): string {
	const isSvg = dataUri.startsWith('data:image/svg');
	const manifest = {
		name: 're:DTF',
		short_name: 're:DTF',
		description: 'Неофициальный клиент для DTF',
		start_url: './',
		scope: './',
		display: 'standalone',
		display_override: ['window-controls-overlay', 'standalone'],
		background_color: '#141414',
		theme_color: '#141414',
		lang: 'ru',
		icons: [
			{
				src: dataUri,
				sizes: 'any',
				type: isSvg ? 'image/svg+xml' : 'image/png',
				purpose: 'any'
			},
			{
				src: dataUri,
				sizes: 'any',
				type: isSvg ? 'image/svg+xml' : 'image/png',
				purpose: 'maskable'
			}
		]
	};
	return 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest));
}

/**
 * Обрабатывает загруженный файл (SVG или растровое изображение):
 * масштабирует в квадрат 512x512 через Canvas или читает SVG, возвращая data URI.
 */
export async function processCustomIcon(file: File): Promise<string> {
	if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
		if (file.size > 256 * 1024) {
			throw new Error('SVG файл слишком большой (максимальный размер: 256 КБ)');
		}
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(new Error('Не удалось прочитать SVG файл'));
			reader.readAsDataURL(file);
		});
	}

	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => {
			URL.revokeObjectURL(url);
			const canvas = document.createElement('canvas');
			canvas.width = 192;
			canvas.height = 192;
			const ctx = canvas.getContext('2d');
			if (!ctx) return reject(new Error('Не удалось создать контекст рисования'));

			// Центрируем и масштабируем квадратную область по центру
			const minDim = Math.min(img.width, img.height);
			const sx = (img.width - minDim) / 2;
			const sy = (img.height - minDim) / 2;
			ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 192, 192);

			resolve(canvas.toDataURL('image/png'));
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Не удалось загрузить изображение'));
		};
		img.src = url;
	});
}

let faviconGen = 0;
let badgeCache: { src: string; dataUrl: string } | null = null;
let currentFavBase: { url: string; type: string } | null = null;
let hasUnreadDot = false;

function ensureLink(rel: string): HTMLLinkElement {
	let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
	if (!link) {
		link = document.createElement('link');
		link.rel = rel;
		document.head.appendChild(link);
	}
	return link;
}

function setFavicon(link: HTMLLinkElement, type: string, href: string) {
	if (link.type !== type) link.type = type;
	if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

function renderUnreadFavicon(src: string, gen: number, favLink: HTMLLinkElement) {
	if (typeof Image === 'undefined') return;

	const img = new Image();
	img.onload = () => {
		if (gen !== faviconGen) return;
		const size = 64;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const cx = size * 0.8;
		const cy = size * 0.8;
		const r = size * 0.183;

		ctx.drawImage(img, 0, 0, size, size);

		// Прозрачный зазор под точкой отделяет её от букв и пёстрых кастомных иконок на любом фоне вкладки
		ctx.globalCompositeOperation = 'destination-out';
		ctx.beginPath();
		ctx.arc(cx, cy, r + size * 0.045, 0, Math.PI * 2);
		ctx.fill();

		ctx.globalCompositeOperation = 'source-over';
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.fillStyle = '#e62e3b';
		ctx.fill();

		try {
			const dataUrl = canvas.toDataURL('image/png');
			badgeCache = { src, dataUrl };
			setFavicon(favLink, 'image/png', dataUrl);
		} catch {
			// Tainted canvas у некорректного источника — остаётся базовый favicon
		}
	};
	img.src = src;
}

function syncFavicon() {
	if (typeof document === 'undefined' || !currentFavBase) return;
	const favLink = ensureLink('icon');
	const { url, type } = currentFavBase;
	const gen = ++faviconGen;

	if (!hasUnreadDot) {
		setFavicon(favLink, type, url);
		return;
	}
	if (badgeCache?.src === url) {
		setFavicon(favLink, 'image/png', badgeCache.dataUrl);
		return;
	}
	setFavicon(favLink, type, url);
	renderUnreadFavicon(url, gen, favLink);
}

function syncPwaAppBadge(unread: number) {
	if (typeof navigator === 'undefined') return;
	const nav = navigator as Navigator & {
		setAppBadge?: (contents?: number) => Promise<void>;
		clearAppBadge?: () => Promise<void>;
	};
	if (unread > 0) {
		nav.setAppBadge?.(unread)?.catch?.(() => {});
	} else {
		nav.clearAppBadge?.()?.catch?.(() => {});
	}
}

/**
 * Обновляет индикатор непрочитанных уведомлений: красная точка на favicon в браузере
 * или системный бейдж через Badging API в установленном PWA.
 */
export function setUnreadBadge(unread: number) {
	if (isNative()) return;
	const pwa = isPwa();
	if (pwa) {
		syncPwaAppBadge(unread);
	}
	const nextDot = unread > 0 && !pwa;
	if (nextDot === hasUnreadDot) return;
	hasUnreadDot = nextDot;
	syncFavicon();
}

/**
 * Обновляет иконки в браузере (favicon), apple-touch-icon и ссылку на веб-манифест PWA.
 */
export function applyAppIcon(iconId: AppIconId, customData?: string | null) {
	if (typeof document === 'undefined') return;

	const appleLink = ensureLink('apple-touch-icon');
	const manifestLink = ensureLink('manifest');

	if (iconId === 'custom' && customData) {
		currentFavBase = {
			url: customData,
			type: customData.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png'
		};
		if (appleLink.getAttribute('href') !== customData) {
			appleLink.setAttribute('href', customData);
		}
		const customManifest = createCustomManifest(customData);
		if (manifestLink.getAttribute('href') !== customManifest) {
			manifestLink.setAttribute('href', customManifest);
		}
	} else {
		const info = getAppIcon(iconId);
		currentFavBase = {
			url: asset(info.favSvg),
			type: 'image/svg+xml'
		};
		const appleUrl = asset(info.appleIcon);
		if (appleLink.getAttribute('href') !== appleUrl) {
			appleLink.setAttribute('href', appleUrl);
		}
		const manifestUrl = asset(info.manifest);
		if (manifestLink.getAttribute('href') !== manifestUrl) {
			manifestLink.setAttribute('href', manifestUrl);
		}
	}

	syncFavicon();

	// Уведомление Capacitor / нативного окружения
	notifyCapacitorIconChange(iconId).catch(() => {});
}
