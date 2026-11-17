<script lang="ts">
	import { onMount, flushSync } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { notify } from '../dtf2022/ui/notify.svelte';
	import { keyboardOffset } from './keyboardOffset';
	import { themeSettings } from './themeSettings.svelte';

	let { session }: { session: any } = $props();

	// Панель только на телефоне: та же граница, с которой редактор всегда на весь экран
	const mobile = new MediaQuery('max-width: 719px');

	// Где фокус: в тексте, в заголовке или нигде (тогда панели нет)
	let where = $state<'editor' | 'title' | null>(null);
	let offset = $state(0);
	let viewHeight = $state(0);
	// Отладочная настройка «Поднять панель над клавиатурой»: Chrome на части Android-телефонов занижает высоту клавиатуры
	// (visualViewport и VirtualKeyboard API врут одинаково, safe-area-inset-bottom там 0), и панель наполовину под ней.
	// Высоту ошибки из страницы не узнать, поэтому это ручной костыль; по умолчанию выключен
	const keyboardGap = $derived(themeSettings.keyboardBarGap ? 26 : 0);
	let gap = $state(0);
	let panelHeight = $state(0);
	const visible = $derived(mobile.current && where !== null);

	let panel = $state<HTMLElement>();
	let space = $state<HTMLElement>();
	let linkInput = $state<HTMLInputElement>();
	let linkOpen = $state(false);
	let linkValue = $state('');
	let savedRange: Range | null = null;
	let fmt = $state({ text: false, selected: false, bold: false, italic: false, link: false });

	onMount(() => {
		const vv = window.visualViewport;
		const update = () => {
			offset = vv ? keyboardOffset(innerHeight, vv.height, vv.offsetTop, keyboardGap) : 0;
			gap = offset > 0 ? keyboardGap : 0;
			viewHeight = (vv ? vv.height : innerHeight) - gap;
			revealCaret();
		};
		update();
		vv?.addEventListener('resize', update);
		vv?.addEventListener('scroll', update);
		return () => {
			vv?.removeEventListener('resize', update);
			vv?.removeEventListener('scroll', update);
			CSS.highlights?.delete('redtf-link');
		};
	});

	// Нижние шторки меню блоков (theme.css) встают над клавиатурой и над панелью, а высоту берут из видимой области
	$effect(() => {
		const style = document.documentElement.style;
		const above = visible ? panelHeight : 0;
		const bottom = offset + above;
		style.setProperty('--redtf-sheet-bottom', `${bottom}px`);
		// Сколько места над панелью в видимой области: выше шторка не растёт
		style.setProperty('--redtf-sheet-room', `${viewHeight - above}px`);
		// Системная полоса снизу нужна, только если под шторкой нет ни клавиатуры, ни панели
		style.setProperty('--redtf-sheet-safe', bottom > 0 ? '0px' : 'env(safe-area-inset-bottom, 0px)');
		return () => ['bottom', 'room', 'safe'].forEach((name) => style.removeProperty(`--redtf-sheet-${name}`));
	});

	function focusin(e: FocusEvent) {
		const el = e.target as Element;
		if (el.closest('.writing__title')) where = 'title';
		else if (el.closest('.codex-editor')) where = 'editor';
		else if (!panel?.contains(el)) where = null;
	}

	// Фокус ушёл в никуда (тап мимо, «Скрыть клавиатуру»): панель и поле ссылки закрываем
	function focusout(e: FocusEvent) {
		if (e.relatedTarget) return;
		where = null;
		closeLink();
	}

	// Состояние кнопок форматирования читаем по выделению: так же, как это делают строчные инструменты EditorJS
	function selectionchange() {
		if (linkOpen) return;
		const sel = getSelection();
		const node = sel?.anchorNode;
		const el = node && (node instanceof Element ? node : node.parentElement);
		const text = !!sel && !!el?.closest('.codex-editor [contenteditable="true"]');
		fmt = {
			text,
			selected: text && !sel.isCollapsed,
			bold: text && document.queryCommandState('bold'),
			italic: text && document.queryCommandState('italic'),
			link: text && !!el?.closest('a')
		};
		revealCaret();
	}

	// Строка с курсором не должна оказаться под панелью: прокручиваем тело записи ровно настолько
	function revealCaret() {
		if (!visible || linkOpen) return;
		const field = document.activeElement;
		const range = getSelection()?.rangeCount ? getSelection()!.getRangeAt(0) : null;
		const node = range?.startContainer;
		const rect =
			field instanceof HTMLTextAreaElement
				? field.getBoundingClientRect()
				: range && (range.getClientRects()[0] ?? (node instanceof Element ? node : node?.parentElement)?.getBoundingClientRect());
		if (!rect) return;
		const vv = window.visualViewport;
		const limit = (vv ? vv.offsetTop + vv.height : innerHeight) - gap - panelHeight - 12;
		if (rect.bottom > limit) space?.closest('.writing')?.scrollBy({ top: rect.bottom - limit });
	}

	// Кнопки не должны забирать фокус: иначе клавиатура закроется и выделение пропадёт (поле ссылки — исключение)
	function keepFocus(e: Event) {
		if (!(e.target as Element).closest('input')) e.preventDefault();
	}

	// То же для меню блока и меню блоков EditorJS: пункт без фокуса отнимал бы его у текста, панель исчезала, раскладка
	// сдвигалась между нажатием и отпусканием, и первый тап по пункту не срабатывал (поле поиска в меню остаётся нормальным)
	function keepFocusInMenu(e: Event) {
		if ((e.target as Element).closest('.ce-popover')) keepFocus(e);
	}

	// Блоки, которые EditorJS умеет преобразовывать друг в друга
	const TEXT_BLOCKS = ['paragraph', 'header', 'list', 'quote'];

	function current() {
		const ed = session.editorInstance;
		const index: number = ed ? ed.blocks.getCurrentBlockIndex() : -1;
		return { ed, index, block: index >= 0 ? ed.blocks.getBlockByIndex(index) : undefined };
	}

	// Текстовый блок преобразуем (повторное нажатие возвращает абзац), с картинкой, галереей и т. п. вставляем новый после
	async function turnInto(type: string, data: object) {
		const { ed, index, block } = current();
		if (!ed || where !== 'editor') return;
		try {
			if (block && TEXT_BLOCKS.includes(block.name)) {
				const next = await ed.blocks.convert(block.id, block.name === type ? 'paragraph' : type, block.name === type ? undefined : data);
				// Курсор в конец первого поля (у цитаты «end» увёл бы его в подпись автора)
				ed.caret.setToBlock(next, 'start');
				const field = document.activeElement as HTMLElement | null;
				if (field?.isContentEditable) {
					getSelection()?.selectAllChildren(field);
					getSelection()?.collapseToEnd();
				}
			} else {
				ed.blocks.insert(type, data, undefined, index >= 0 ? index + 1 : undefined, true);
			}
		} catch (e: any) {
			notify.error(e.message);
		}
	}

	// Штатное меню блоков EditorJS; шторкой его делает theme.css
	function addBlock() {
		if (where === 'editor') session.editorInstance?.toolbar.toggleToolbox(true);
	}

	// Вставляем блок картинки и сразу открываем выбор файла: загрузка целиком на существующем инструменте
	function photo() {
		const { ed, index, block } = current();
		if (!ed || where !== 'editor') return;
		const replace = block?.name === 'paragraph' && block.isEmpty;
		const added = ed.blocks.insert('image', {}, undefined, replace ? index : index >= 0 ? index + 1 : undefined, true, replace);
		(added.holder.querySelector('.cdx-button') as HTMLElement | null)?.click();
	}

	// bold и italic применяются тем же execCommand, что и в штатных строчных инструментах
	function format(command: 'bold' | 'italic') {
		if (fmt.text) document.execCommand(command);
	}

	function hideKeyboard() {
		(document.activeElement as HTMLElement | null)?.blur();
	}

	// Ссылка: адрес вводим в поле панели, а выделение держим в сохранённом диапазоне и подсвечиваем
	function link() {
		const sel = getSelection();
		if (!fmt.text || !sel?.rangeCount) return;
		if (fmt.link) {
			// Как в EditorJS: ссылка снимается целиком
			const anchor = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode!.parentElement)!.closest('a')!;
			const all = document.createRange();
			all.selectNodeContents(anchor);
			sel.removeAllRanges();
			sel.addRange(all);
			document.execCommand('unlink');
			selectionchange();
		} else if (fmt.selected) {
			savedRange = sel.getRangeAt(0).cloneRange();
			CSS.highlights?.set('redtf-link', new Highlight(savedRange));
			linkValue = '';
			linkOpen = true;
			// Фокус должен перейти в поле в том же жесте, иначе iOS закроет клавиатуру
			flushSync();
			linkInput?.focus();
		}
	}

	function restoreSelection() {
		if (!savedRange) return;
		const node = savedRange.startContainer;
		(node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true });
		const sel = getSelection();
		sel?.removeAllRanges();
		sel?.addRange(savedRange);
	}

	function closeLink() {
		CSS.highlights?.delete('redtf-link');
		linkOpen = false;
		savedRange = null;
	}

	// Протокол добавляем, как EditorJS: http:// для «dtf.ru», ничего для «mailto:…», «/путь» и «#якорь»
	function prepareLink(raw: string) {
		const url = raw.trim();
		if (/\s/.test(url)) return '';
		return /^(\w+):(\/\/)?/.test(url) || /^\/[^/\s]|^\/\/[^/\s]|^#/.test(url) ? url : `http://${url}`;
	}

	function applyLink() {
		const href = prepareLink(linkValue);
		if (!href) {
			notify.error('Адрес ссылки не должен содержать пробелов');
			return;
		}
		restoreSelection();
		document.execCommand('createLink', false, href);
		getSelection()?.collapseToEnd();
		closeLink();
		selectionchange();
	}

	function cancelLink() {
		restoreSelection();
		closeLink();
		selectionchange();
	}
</script>

<svelte:document onfocusin={focusin} onfocusout={focusout} onselectionchange={selectionchange} onpointerdown={keepFocusInMenu} onmousedown={keepFocusInMenu} />

{#if visible}
	<div class="kbar-space" bind:this={space} style:height="{panelHeight + offset}px"></div>
	<!-- Обработчики только гасят потерю фокуса, это не действия пользователя -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class={['kbar', { 'kbar--keyboard': offset > 0 }]}
		role="group"
		aria-label="Инструменты записи"
		bind:this={panel}
		bind:offsetHeight={panelHeight}
		style:bottom="{offset}px"
		onpointerdown={keepFocus}
		onmousedown={keepFocus}
	>
		{#if linkOpen}
			<form class="kbar__link" onsubmit={(e) => (e.preventDefault(), applyLink())}>
				<input
					bind:this={linkInput}
					bind:value={linkValue}
					class="kbar__input"
					type="text"
					inputmode="url"
					enterkeyhint="done"
					autocapitalize="off"
					autocorrect="off"
					spellcheck="false"
					placeholder="Адрес ссылки"
					aria-label="Адрес ссылки"
				/>
				<button type="submit" class="kbar__text-button kbar__text-button--accent">Готово</button>
				<button type="button" class="kbar__text-button" onclick={cancelLink}>Отмена</button>
			</form>
		{:else}
			<div class="kbar__row">
				<button type="button" aria-label="Добавить блок" disabled={where !== 'editor'} onclick={addBlock}>
					<svg class="icon" width="24" height="24" aria-hidden="true"><use href="#v_plus"></use></svg>
				</button>
				<button type="button" aria-label="Фото" disabled={where !== 'editor'} onclick={photo}>
					<svg class="icon" width="24" height="24" aria-hidden="true"><use href="#v_image"></use></svg>
				</button>
				<button type="button" aria-label="Заголовок" disabled={where !== 'editor'} onclick={() => turnInto('header', { level: 2 })}>
					<span class="kbar__glyph">H</span>
				</button>
				<button type="button" aria-label="Список" disabled={where !== 'editor'} onclick={() => turnInto('list', { style: 'unordered' })}>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
						<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
					</svg>
				</button>
				<button type="button" aria-label="Цитата" disabled={where !== 'editor'} onclick={() => turnInto('quote', {})}>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
					</svg>
				</button>
				<span class="kbar__divider" aria-hidden="true"></span>
				<button type="button" aria-label="Жирный" aria-pressed={fmt.bold} disabled={!fmt.text} onclick={() => format('bold')}>
					<span class="kbar__glyph kbar__glyph--bold">B</span>
				</button>
				<button type="button" aria-label="Курсив" aria-pressed={fmt.italic} disabled={!fmt.text} onclick={() => format('italic')}>
					<span class="kbar__glyph kbar__glyph--italic">I</span>
				</button>
				<button
					type="button"
					aria-label={fmt.link ? 'Убрать ссылку' : 'Ссылка'}
					aria-pressed={fmt.link}
					disabled={!fmt.link && !fmt.selected}
					onclick={link}
				>
					<svg class="icon" width="24" height="24" aria-hidden="true"><use href="#v_link"></use></svg>
				</button>
				<span class="kbar__divider" aria-hidden="true"></span>
				<button type="button" aria-label="Скрыть клавиатуру" onclick={hideKeyboard}>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<rect x="3" y="3" width="18" height="11" rx="2" />
						<path d="M7 7h.01M11 7h.01M15 7h.01M8 10.5h8M8 18l4 3 4-3" />
					</svg>
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Место под панель и клавиатуру в конце тела записи: без этого последняя строка не прокручивается выше них */
	.kbar-space {
		flex: none;
	}

	.kbar {
		position: fixed;
		left: 0;
		right: 0;
		z-index: 3;
		padding: 0 env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
		border-top: 1px solid var(--border-color);
		background-color: var(--bg-card);
		color: var(--text-primary);
	}

	/* Над клавиатурой нижняя системная полоса уже не мешает */
	.kbar--keyboard {
		padding-bottom: 0;
	}

	.kbar__row,
	.kbar__link {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 48px;
		padding: 0 8px;
		box-sizing: border-box;
	}

	.kbar__row {
		overflow-x: auto;
		scrollbar-width: none;
	}

	.kbar__row::-webkit-scrollbar {
		display: none;
	}

	.kbar__row button {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		height: 44px;
		border-radius: 8px;
		color: inherit;
		cursor: pointer;
	}

	.kbar__row button:disabled {
		opacity: 0.3;
	}

	.kbar__row button[aria-pressed='true'] {
		background-color: var(--bg-card-hover);
		color: var(--text-link);
	}

	.kbar__glyph {
		font-size: 20px;
		font-weight: 600;
		line-height: 1;
	}

	.kbar__glyph--bold {
		font-weight: 800;
	}

	.kbar__glyph--italic {
		font-style: italic;
		font-weight: 500;
		font-family: serif;
	}

	.kbar__divider {
		flex: 0 0 1px;
		align-self: center;
		height: 24px;
		margin: 0 4px;
		background-color: var(--border-color);
	}

	.kbar__input {
		flex: 1;
		min-width: 0;
		height: 36px;
		padding: 0 12px;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		background-color: var(--bg-secondary);
		color: inherit;
		/* 16px: меньше iOS при фокусе увеличивает страницу */
		font: inherit;
		font-size: 16px;
		outline: none;
	}

	.kbar__input:focus {
		border-color: var(--border-focus, var(--text-link));
	}

	.kbar__text-button {
		flex: 0 0 auto;
		min-height: 44px;
		padding: 0 8px;
		color: var(--text-muted);
		font: inherit;
		font-size: 15px;
		cursor: pointer;
	}

	.kbar__text-button--accent {
		color: var(--text-link);
		font-weight: 600;
	}
</style>
