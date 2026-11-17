import { it, expect } from 'vitest';
import { render } from 'svelte/server';
import AudioBlock from './AudioBlock.svelte';

const data = {
	title: 'Подкаст',
	audio: { data: { uuid: 'abc', filename: 'ep.mp3', audio_info: { duration: 215, listens_count: 1234 } } }
};

it('рисует название, длительность из данных, число прослушиваний и скачивание', () => {
	const { body } = render(AudioBlock, { props: { data } });
	expect(body).toContain('Подкаст');
	expect(body).toContain('3:35');
	expect(body).toMatch(/1\s234/);
	expect(body).toContain('download="ep.mp3"');
});

it('без файла ничего не рисует', () => {
	expect(render(AudioBlock, { props: { data: { title: 'x' } } }).body).not.toContain('class="audio');
});
