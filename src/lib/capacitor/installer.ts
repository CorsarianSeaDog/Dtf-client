import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/*
 * Обновление APK внутри приложения (плагин NativeInstaller): загрузка с прогрессом и запуск системного установщика.
 * OTA обновляет только JS, поэтому в старых оболочках плагина нет: `installerAvailable()` отличает их.
 */

export interface InstallerProgress {
	loaded: number;
	/** `0`, если сервер не сообщил размер */
	total: number;
}

interface NativeInstallerPlugin {
	download: (options: { url: string; filename: string }) => Promise<void>;
	cancel: () => Promise<void>;
	canInstall: () => Promise<{ allowed: boolean }>;
	openInstallSettings: () => Promise<void>;
	install: (options: { filename: string }) => Promise<{ needsPermission?: boolean }>;
	cleanup: () => Promise<void>;
	addListener(event: 'progress', listener: (e: InstallerProgress) => void): Promise<PluginListenerHandle>;
}

export const NativeInstaller = registerPlugin<NativeInstallerPlugin>('NativeInstaller');

export const installerAvailable = () => Capacitor.isPluginAvailable('NativeInstaller');

/** Доля загрузки в процентах; `null`, если размер файла неизвестен */
export function progressPercent({ loaded, total }: InstallerProgress): number | null {
	return total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : null;
}

/** Размер для подписи под прогрессом: «12,4 МБ» */
export function formatMegabytes(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}
