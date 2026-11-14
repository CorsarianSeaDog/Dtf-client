<script lang="ts">
	let {
		value = $bindable(''),
		label,
		oninput,
		onsubmit,
		onclose
	}: {
		value: string;
		label: string;
		oninput: () => void;
		onsubmit: () => void;
		onclose: () => void;
	} = $props();

	/* Поле поиска в профиле: открывается лупой в строке сортировки, Esc и ✕ закрывают */
</script>

<form
	class="profile-search"
	role="search"
	onsubmit={(e) => {
		e.preventDefault();
		onsubmit();
	}}
>
	<svg class="icon profile-search__icon" width="20" height="20" aria-hidden="true"><use href="#v_search"></use></svg>
	<input
		class="profile-search__input"
		type="text"
		bind:value
		placeholder={label}
		aria-label={label}
		autocomplete="off"
		enterkeyhint="search"
		{oninput}
		onkeydown={(e) => e.key === 'Escape' && onclose()}
		{@attach (input) => input.focus()}
	/>
	<button type="button" class="profile-search__close" aria-label="Закрыть поиск" onclick={onclose}>
		<svg class="icon" width="20" height="20" aria-hidden="true"><use href="#v_close"></use></svg>
	</button>
</form>

<style>
	.profile-search {
		box-sizing: border-box;
		display: flex;
		flex: 1 1 220px;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 8px 0 12px;
		border: 1px solid transparent;
		border-radius: 20px;
		background-color: var(--bg-search-field);
		transition: background-color 0.1s linear, border-color 0.1s linear, box-shadow 0.1s linear;
	}

	.profile-search:focus-within {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 3px var(--shadow-search-ring);
		background-color: var(--bg-search-field-focus);
	}

	.profile-search__icon {
		flex: none;
		opacity: 0.6;
	}

	.profile-search__input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: 0;
		outline: 0;
		background: none;
		color: var(--text-primary);
		font: inherit;
		font-size: 16px;
	}

	.profile-search__input::placeholder {
		color: var(--text-search-placeholder);
		opacity: 1;
	}

	.profile-search__close {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border-radius: 50%;
		color: inherit;
		opacity: 0.6;
		cursor: pointer;
	}

	@media (hover: hover) {
		.profile-search__close:hover {
			opacity: 1;
		}
	}
</style>
