<script lang="ts">
	import { wordCount } from './wordCount';

	/*
	 * Слова и время чтения по последнему снимку содержимого сессии и заголовку; у пустой записи ничего не рисуется.
	 * sticky — липкая строка у нижнего края экрана редактора (десктоп); без него — просто строка текста (шторка публикации).
	 */
	let { session, sticky = false }: { session: any; sticky?: boolean } = $props();

	const stats = $derived(wordCount(session.title, session.content));

	// слово / слова / слов
	function plural(n: number) {
		const rest = n % 100 > 10 && n % 100 < 20 ? 5 : n % 10;
		return rest === 1 ? 'слово' : rest >= 2 && rest <= 4 ? 'слова' : 'слов';
	}
</script>

{#if stats.words > 0}
	<div class={['editor-counter', { 'editor-counter--sticky': sticky }]}>{stats.words} {plural(stats.words)} · ~{stats.minutes} мин чтения</div>
{/if}

<style>
	.editor-counter {
		color: var(--text-muted);
		font-size: 13px;
		line-height: 16px;
	}

	/* Левый край — по колонке текста записи (ширина и поля те же, что у .writing__body) */
	.editor-counter--sticky {
		position: sticky;
		bottom: 0;
		z-index: 1;
		margin-top: auto;
		padding: 8px max(16px, calc((100% - var(--content-width)) / 2 + 16px));
		border-top: 1px solid var(--border-color);
		background-color: var(--bg-card);
	}
</style>
