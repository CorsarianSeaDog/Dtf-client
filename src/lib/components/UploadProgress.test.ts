import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import fs from 'fs';
import path from 'path';
import UploadProgress from './UploadProgress.svelte';

describe('UploadProgress', () => {
	it('рендерит прогресс в процентах и ARIA-атрибуты', () => {
		const { body } = render(UploadProgress, {
			props: { progress: 0.42, size: 'md' }
		});

		expect(body).toContain('role="progressbar"');
		expect(body).toContain('aria-valuenow="42"');
		expect(body).toContain('42%');
	});

	it('отображает состояние очереди и обработки', () => {
		const queued = render(UploadProgress, {
			props: { queued: true, size: 'md' }
		});
		expect(queued.body).toContain('В очереди');
		expect(queued.body).toContain('aria-valuenow="0"');

		const processing = render(UploadProgress, {
			props: { progress: 0.9, processing: true, size: 'lg' }
		});
		expect(processing.body).toContain('Обработка…');
		expect(processing.body).toContain('aria-valuenow="100"');
	});

	it('рендерит кнопку отмены только при переданном oncancel', () => {
		const withoutCancel = render(UploadProgress, { props: { progress: 0.5 } });
		expect(withoutCancel.body).not.toContain('upload-progress__cancel');

		const withCancel = render(UploadProgress, { props: { progress: 0.5, oncancel: () => {} } });
		expect(withCancel.body).toContain('upload-progress__cancel');
		expect(withCancel.body).toContain('aria-label="Отменить загрузку"');
	});

	it('уважает настройку отключения прозрачности и размытия', () => {
		const source = fs.readFileSync(path.join(__dirname, 'UploadProgress.svelte'), 'utf-8');
		expect(source).toContain(':root[data-transparency="false"]');
		expect(source).toContain('backdrop-filter: none');
	});
});
