<script lang="ts">
	import { Popover } from '../dtf2022/ui';
	import type { EditorBarActions } from '../dtf2022/EditorScreen.svelte';

	/*
	 * Меню «⋯» в шапке редактора на телефоне: «История версий» и «Удалить запись» вместо двух кнопок.
	 * Это два вложенных Popover под одной кнопкой: «История версий» закрывает меню и открывает список версий.
	 */
	let { actions }: { actions: EditorBarActions } = $props();

	let menuOpen = $state(false);
	let versionsOpen = $state(false);

	const items = [
		{ value: 'history', label: 'История версий', icon: 'v_history' },
		{ value: 'delete', label: 'Удалить запись', icon: 'v_delete' }
	];

	function select(value: string) {
		if (value === 'delete') return actions.requestDelete();
		actions.toggleHistory();
		// Список открываем после текущего клика: его слушатель «клик снаружи» иначе сразу закрыл бы только что открытый список
		setTimeout(() => (versionsOpen = true));
	}

	// Закрыли список версий любым способом — сессии нужно знать, что история больше не открыта
	function setVersionsOpen(open: boolean) {
		versionsOpen = open;
		if (!open && actions.historyOpen) actions.toggleHistory();
	}

	function toggle() {
		if (versionsOpen) setVersionsOpen(false);
		else menuOpen = !menuOpen;
	}
</script>

<Popover bind:open={menuOpen} {items} onselect={select} width={220} label="Действия с записью">
	<Popover
		bind:open={() => versionsOpen, setVersionsOpen}
		items={actions.historyItems}
		onselect={(id) => id && actions.restoreVersion(id)}
		width={220}
		label="История версий"
	>
		<button
			type="button"
			class="editor-menu"
			aria-label="Ещё"
			aria-haspopup="listbox"
			aria-expanded={menuOpen || versionsOpen}
			onclick={toggle}
		>
			<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<circle cx="5" cy="12" r="2" />
				<circle cx="12" cy="12" r="2" />
				<circle cx="19" cy="12" r="2" />
			</svg>
		</button>
	</Popover>
</Popover>

<style>
	.editor-menu {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 8px;
		color: var(--text-primary);
		opacity: 0.5;
		cursor: pointer;
	}

	.editor-menu:hover,
	.editor-menu[aria-expanded='true'] {
		opacity: 1;
	}
</style>
