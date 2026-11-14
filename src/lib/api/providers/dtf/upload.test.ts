import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadWithAuth, resetRefreshCooldown } from './client';
import { authStorage } from '$lib/storage/auth.svelte';
import { settings } from '$lib/storage/settings.svelte';
import type { UploadProgress } from '../../types';

class MockXHR {
	static instances: MockXHR[] = [];
	static onSend?: (xhr: MockXHR, attempt: number) => void;

	method = '';
	url = '';
	headers: Record<string, string> = {};
	status = 200;
	statusText = 'OK';
	responseText = '';
	upload: {
		onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
		onload: (() => void) | null;
	} = { onprogress: null, onload: null };
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onabort: (() => void) | null = null;
	aborted = false;

	constructor() {
		MockXHR.instances.push(this);
	}

	open(method: string, url: string) {
		this.method = method;
		this.url = url;
	}

	setRequestHeader(key: string, value: string) {
		this.headers[key] = value;
	}

	send() {
		MockXHR.onSend?.(this, MockXHR.instances.length);
	}

	abort() {
		this.aborted = true;
		this.onabort?.();
	}
}

describe('uploadWithAuth', () => {
	const origXhr = globalThis.XMLHttpRequest;

	beforeEach(() => {
		MockXHR.instances = [];
		MockXHR.onSend = undefined;
		resetRefreshCooldown();
		(globalThis as any).XMLHttpRequest = MockXHR;
		authStorage.session = {
			type: 'Bearer',
			accessToken: 'old-token',
			refreshToken: 'ref-token',
			accessExpTimestamp: 0,
			refreshExpTimestamp: 0
		};
		settings.value = {
			...settings.value,
			proxies: [{ id: 'p1', name: 'Proxy', url: 'https://proxy.example.com', enabled: true }]
		};
	});

	afterEach(() => {
		globalThis.XMLHttpRequest = origXhr;
		vi.restoreAllMocks();
	});

	it('отправляет прогресс байтов, этап обработки и заголовок авторизации', async () => {
		const events: UploadProgress[] = [];
		MockXHR.onSend = (xhr) => {
			queueMicrotask(() => {
				xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
				xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
				xhr.upload.onload?.();
				xhr.status = 200;
				xhr.responseText = JSON.stringify({ result: [{ data: { uuid: 'u1' } }] });
				xhr.onload?.();
			});
		};

		const formData = new FormData();
		const res = await uploadWithAuth('https://upload.dtf.ru/v2.8/uploader/upload', formData, {
			onProgress: (info) => events.push(info)
		});

		expect(res.status).toBe(200);
		expect(MockXHR.instances[0].headers['JWTAuthorization']).toBe('Bearer old-token');
		expect(events).toEqual([
			{ loaded: 0, total: 0, progress: 0, processing: false },
			{ loaded: 50, total: 100, progress: 0.5, processing: false },
			{ loaded: 100, total: 100, progress: 1, processing: false },
			{ loaded: 100, total: 100, progress: 1, processing: true }
		]);
	});

	it('обновляет токен при 401 и повторяет загрузку', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			Response.json({
				data: { accessToken: 'new-token', refreshToken: 'ref-2' }
			})
		);

		MockXHR.onSend = (xhr, attempt) => {
			queueMicrotask(() => {
				if (attempt === 1) {
					xhr.status = 401;
					xhr.responseText = JSON.stringify({ message: 'Unauthorized' });
				} else {
					xhr.status = 200;
					xhr.responseText = JSON.stringify({ result: [{ data: { uuid: 'u2' } }] });
				}
				xhr.onload?.();
			});
		};

		const res = await uploadWithAuth('https://upload.dtf.ru/v2.8/uploader/upload', new FormData());
		expect(res.status).toBe(200);
		expect(MockXHR.instances).toHaveLength(2);
		expect(MockXHR.instances[0].headers['JWTAuthorization']).toBe('Bearer old-token');
		expect(MockXHR.instances[1].headers['JWTAuthorization']).toBe('Bearer new-token');
	});

	it('прерывает загрузку по AbortSignal с AbortError', async () => {
		const controller = new AbortController();
		MockXHR.onSend = () => {
			queueMicrotask(() => controller.abort());
		};

		await expect(
			uploadWithAuth('https://upload.dtf.ru/v2.8/uploader/upload', new FormData(), {
				signal: controller.signal
			})
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(MockXHR.instances[0].aborted).toBe(true);
	});
});
