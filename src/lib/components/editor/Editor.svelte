<script lang="ts">
	import { untrack } from 'svelte';
	import type { OutputData } from '@editorjs/editorjs';
	import { smartTypography } from '$lib/smartTypography';
	import './editor.css';
	import { getEditorConfig } from './config';
	import { editorMessages } from './i18n';
	import { parseShortcut } from './shortcuts';

	let { 
		initialData = undefined, 
		placeholder = 'Напишите что-нибудь...', 
		onChange = () => {},
		editorInstance = $bindable(null)
	}: {
		initialData?: OutputData;
		placeholder?: string;
		onChange?: () => void;
		editorInstance?: any;
	} = $props();

	let editorElement: HTMLElement;

	$effect(() => {
		if (!editorElement) return;

		let isDestroyed = false;
		let instance: any = null;

		(async () => {
			const EditorJS = (await import('@editorjs/editorjs')).default;
			const config = await getEditorConfig();

			if (isDestroyed) return;

			instance = new EditorJS({
				holder: editorElement,
				placeholder,
				i18n: { messages: editorMessages },
				tunes: config.tunes,
				tools: config.tools,
				data: untrack(() => initialData),
				onChange: () => {
					if (!instance) return;
					onChange();
				}
			});
			editorInstance = instance;
		})();

		// «## » + пробел в пустом абзаце превращает его в заголовок, список или цитату. beforeinput, а не keydown:
		// на телефонах keydown пробела приходит без кода. У EditorJS своей отмены нет, а родная не видит замены блока:
		// Ctrl+Z сразу после превращения возвращает набранное сам (любое следующее нажатие это отменяет)
		let undo: { id: string; text: string } | null = null;
		const onKeyDown = (e: KeyboardEvent) => {
			const pending = undo;
			if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return;
			undo = null;
			if (!instance || !pending || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.code !== 'KeyZ') return;
			e.preventDefault();
			const index = instance.blocks.getBlockIndex(pending.id);
			if (index < 0) return;
			const restored = instance.blocks.insert('paragraph', { text: pending.text }, undefined, index, true, true);
			instance.caret.setToBlock(restored.id, 'end');
		};
		const onBeforeInput = (e: InputEvent) => {
			if (!instance || e.inputType !== 'insertText' || e.data !== ' ') return;
			const paragraph = (e.target as HTMLElement).closest?.('.ce-paragraph');
			const text = paragraph?.textContent ?? '';
			const shortcut = parseShortcut(text + ' ');
			// Каретка должна стоять после сокращения: пробел, набранный перед ним, не повод преобразовывать
			if (!shortcut || getSelection()?.anchorOffset !== text.length) return;
			e.preventDefault();
			const block = instance.blocks.getBlockByIndex(instance.blocks.getCurrentBlockIndex());
			paragraph!.textContent = '';
			instance.blocks.convert(block.id, shortcut.tool, shortcut.data).then((converted: any) => {
				instance.caret.setToBlock(converted.id, 'end');
				undo = { id: converted.id, text: text + '&nbsp;' };
			});
		};
		editorElement.addEventListener('beforeinput', onBeforeInput);
		editorElement.addEventListener('keydown', onKeyDown, true);

		// Файл, брошенный мимо редактора (на поля, заголовок), браузер открыл бы вместо страницы: уход с экрана терял бы правки.
		// Window слушает после редактора, так что его собственный drop отрабатывает раньше
		const holdFiles = (e: DragEvent) => {
			if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
		};
		window.addEventListener('dragover', holdFiles);
		window.addEventListener('drop', holdFiles);

		return () => {
			window.removeEventListener('dragover', holdFiles);
			window.removeEventListener('drop', holdFiles);
			editorElement.removeEventListener('beforeinput', onBeforeInput);
			editorElement.removeEventListener('keydown', onKeyDown, true);
			isDestroyed = true;
			if (instance && typeof instance.destroy === 'function') {
				try {
					instance.destroy();
				} catch (e) {
					// Catch potential errors if editor is still initializing when destroyed
					console.error("Error destroying EditorJS instance", e);
				}
			}
		};
	});
</script>

<div bind:this={editorElement} class="editor-container" {@attach smartTypography}></div>

<style>
	.editor-container {
		min-height: 300px;
		background: var(--bg-card, #fff);
		border-radius: 8px;
		padding: 20px 40px;
		color: var(--text-primary, #1a1a1a);
		font-family: inherit;
	}
	
</style>
