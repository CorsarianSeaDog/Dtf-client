<script lang="ts">
	import { notify } from './ui/notify.svelte';
	import Select from './ui/Select.svelte';

	// Строка настроек записи: подсайт, права на комментарии, 18+. Её рисует базовый экран, а форки могут показать то же в шторке
	let { session }: { session: any } = $props();

	const commentOptions = [
		{ value: 'everyone', label: 'Комментарии: всем' },
		{ value: 'only_subscribers', label: 'Комментарии: подписчикам' },
		{ value: 'only_plus', label: 'Комментарии: с плюсом' },
		{ value: 'nobody', label: 'Комментарии: отключены' }
	];

	const subsiteOptions = $derived(session.subsites.map((s: any) => ({ value: s.value, label: s.label })));

	async function setCommentPermission(value: string) {
		try {
			// Сессия читает право из события выбора, поэтому значение отдаём в том же виде
			await session.updateCommentPermission({ target: { value } } as unknown as Event);
			notify.success('Права изменены');
		} catch (e: any) {
			notify.error(e.message);
		}
	}
</script>

<div class="writing__settings">
	{#if subsiteOptions.length > 0}
		<div class="writing__subsite">
			<Select bind:value={session.selectedSubsiteId} options={subsiteOptions} placeholder="Выберите подсайт" searchable />
		</div>
	{/if}

	<div class="writing__comments">
		<Select
			bind:value={() => session.commentPermission, setCommentPermission}
			options={commentOptions}
			placeholder="Кто может комментировать"
		/>
	</div>

	<label class="writing__adult">
		<input type="checkbox" bind:checked={session.isAdult} />
		<span class={['ui-checkbox', { 'ui-checkbox--checked': session.isAdult }]}></span>
		18+
	</label>
</div>

<style>
	.writing__settings {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px 20px;
		width: 100%;
		max-width: var(--content-width);
		margin: 0 auto;
		padding: 16px calc(16px + env(safe-area-inset-right, 0px)) 0 calc(16px + env(safe-area-inset-left, 0px));
		box-sizing: border-box;
	}

	:global(.writing--window) .writing__settings {
		padding: 16px 16px 0;
	}

	/* Два селектора и «18+» должны помещаться в колонку 608px (640 минус поля) в одну строку */
	.writing__subsite {
		flex: 0 1 220px;
		min-width: 160px;
	}

	.writing__comments {
		flex: 0 1 280px;
		min-width: 200px;
	}

	.writing__adult {
		position: relative;
		display: flex;
		align-items: center;
		font-size: 16px;
		cursor: pointer;
	}

	/* Настоящий input остаётся для клавиатуры и экранных читалок, рисуется .ui-checkbox */
	.writing__adult input {
		position: absolute;
		opacity: 0;
	}

	/* ui-checkbox из CSS DTF: 17px + рамка, галочка двумя границами */
	.ui-checkbox {
		position: relative;
		box-sizing: content-box;
		display: inline-block;
		width: 17px;
		height: 17px;
		margin-right: 0.4em;
		border: 1px solid var(--border-checkbox);
		border-top-color: var(--border-checkbox-top);
		border-radius: 4px;
		vertical-align: text-bottom;
	}

	.ui-checkbox:hover {
		border-color: var(--border-checkbox-hover);
	}

	.ui-checkbox--checked::before {
		content: '';
		position: absolute;
		top: 24%;
		left: 20%;
		width: 8px;
		height: 4px;
		border-bottom: 2px solid var(--text-primary);
		border-left: 2px solid var(--text-primary);
		transform: rotate(-45deg);
	}

	.writing__adult input:focus-visible + .ui-checkbox {
		outline: 2px solid var(--color-blue);
		outline-offset: 2px;
	}
</style>
