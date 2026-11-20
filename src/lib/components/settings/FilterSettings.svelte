<script lang="ts">
	import FilterChips from './FilterChips.svelte';
	import SettingsButton from './SettingsButton.svelte';
	import SettingsGroup from './SettingsGroup.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import SettingsSegmented from './SettingsSegmented.svelte';
	import SettingsSwitch from './SettingsSwitch.svelte';
	import {
		addIgnoredKeyword,
		addIgnoredKeywords,
		addIgnoredTag,
		filterSettings,
		isKeywordPresetActive,
		KEYWORD_PRESETS,
		removeIgnoredKeyword,
		removeIgnoredKeywords,
		removeIgnoredTag,
		type FilterMode,
		type RatingMinVotes
	} from '$lib/storage/filter.svelte';

	/*
	 * Страница «Фильтрация»:
	 * локальные фильтры по тегам и ключевым словам (включая пресеты), режим скрытия, области и фильтр по рейтингу.
	 */
	const MODE_OPTIONS: { value: FilterMode; title: string }[] = [
		{ value: 'soft', title: 'Мягкий' },
		{ value: 'hard', title: 'Жёсткий' }
	];

	const MIN_VOTES_OPTIONS: { value: RatingMinVotes; title: string }[] = [
		{ value: 5, title: '5' },
		{ value: 15, title: '15' },
		{ value: 50, title: '50' }
	];

	const modeSubtitle = (mode: FilterMode = 'soft') =>
		mode === 'soft'
			? 'Мягкий: скрывает под плашку с кнопкой «Показать»'
			: 'Жёсткий: полностью вырезает элементы из ленты';

	let tagInput = $state('');
	let keywordInput = $state('');

	function handleAddTag() {
		const raw = tagInput.trim();
		if (!raw) return;
		// Поддерживаем как один тег, так и несколько через запятую, пробел или новую строку
		for (const part of raw.split(/[\s,]+/)) {
			if (part) addIgnoredTag(part);
		}
		tagInput = '';
	}

	function handleTagKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleAddTag();
		}
	}

	function handleAddKeyword() {
		const raw = keywordInput.trim();
		if (!raw) return;
		// Поддерживаем ключевые слова через запятую или с новой строки
		for (const part of raw.split(/[\n,]+/)) {
			const clean = part.trim();
			if (clean) addIgnoredKeyword(clean);
		}
		keywordInput = '';
	}

	function handleKeywordKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleAddKeyword();
		}
	}
</script>

<SettingsGroup title="Локальные фильтры" description="Скрытие контента в ленте и комментариях по тегам и фразам без авторизации на DTF.">
	<div class="filter-card">
		<label class="filter-label" for="ignored-tags-input">Скрытые теги (через пробел, запятую или Enter)</label>
		<div class="input-container">
			<textarea
				id="ignored-tags-input"
				class="filter-textarea"
				rows="2"
				placeholder="Например: #аниме, #политика, спойлеры…"
				bind:value={tagInput}
				onkeydown={handleTagKeyDown}
			></textarea>
			<div class="input-actions">
				<SettingsButton disabled={!tagInput.trim()} onclick={handleAddTag}>Добавить</SettingsButton>
			</div>
		</div>

		<FilterChips
			items={filterSettings.value.tags.map((tag) => ({
				key: tag,
				label: `#${tag}`,
				removeLabel: `Удалить тег #${tag}`
			}))}
			label="Скрытые теги"
			emptyHint="Нет скрытых тегов"
			onremove={removeIgnoredTag}
		/>
	</div>

	<div class="filter-card filter-card--top-border">
		<label class="filter-label" for="ignored-keywords-input">Скрытые ключевые слова и фразы</label>
		<div class="input-container">
			<textarea
				id="ignored-keywords-input"
				class="filter-textarea"
				rows="2"
				placeholder="Например: спойлер к финалу, слив сюжета…"
				bind:value={keywordInput}
				onkeydown={handleKeywordKeyDown}
			></textarea>
			<div class="input-actions">
				<SettingsButton disabled={!keywordInput.trim()} onclick={handleAddKeyword}>Добавить</SettingsButton>
			</div>
		</div>

		<FilterChips
			items={filterSettings.value.keywords.map((kw) => ({
				key: kw,
				label: kw,
				removeLabel: `Удалить ключевое слово ${kw}`
			}))}
			label="Скрытые ключевые слова"
			emptyHint="Нет скрытых ключевых слов"
			onremove={removeIgnoredKeyword}
		/>
	</div>

	<div class="filter-card filter-card--top-border">
		<span class="filter-label">Пресеты ключевых слов</span>
		<div class="presets-list">
			{#each KEYWORD_PRESETS as preset (preset.id)}
				{@const active = isKeywordPresetActive(preset, filterSettings.value.keywords)}
				<div class="preset-row">
					<div class="preset-row__info">
						<span class="preset-row__title">{preset.title}</span>
						<span class="preset-row__words">{preset.keywords.join(', ')}</span>
					</div>
					<button
						class="preset-btn"
						class:preset-btn--active={active}
						type="button"
						title={active ? `Убрать пресет ${preset.title}` : `Добавить пресет ${preset.title}`}
						aria-label={active ? `Убрать пресет ${preset.title} из фильтров` : `Добавить пресет ${preset.title} в фильтры`}
						onclick={() => {
							if (active) {
								removeIgnoredKeywords(preset.keywords);
							} else {
								addIgnoredKeywords(preset.keywords);
							}
						}}
					>
						{#if active}
							<svg class="preset-btn__icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<polyline points="3 8 7 12 13 4" />
							</svg>
							<span class="preset-btn__text">Добавлено</span>
						{:else}
							<svg class="preset-btn__icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
								<line x1="8" y1="3" x2="8" y2="13" />
								<line x1="3" y1="8" x2="13" y2="8" />
							</svg>
							<span class="preset-btn__text">Добавить</span>
						{/if}
					</button>
				</div>
			{/each}
		</div>
	</div>
</SettingsGroup>

<SettingsGroup title="Параметры фильтрации">
	<SettingsRow
		title="Режим скрытия"
		subtitle={modeSubtitle(filterSettings.value.mode)}
	>
		<SettingsSegmented
			options={MODE_OPTIONS}
			value={filterSettings.value.mode}
			label="Режим скрытия"
			onchange={(mode) => filterSettings.patch({ mode })}
		/>
	</SettingsRow>
	<SettingsRow
		title="Фильтровать посты"
		subtitle="Скрывать посты в ленте по тегам и фразам"
		tag="label"
	>
		<SettingsSwitch
			checked={filterSettings.value.filterPosts}
			label="Фильтровать посты"
			onchange={(filterPosts) => filterSettings.patch({ filterPosts })}
		/>
	</SettingsRow>
	<SettingsRow
		title="Фильтровать новости"
		subtitle="Скрывать редакторские новости в ленте по тегам и фразам"
		tag="label"
	>
		<SettingsSwitch
			checked={filterSettings.value.filterNews}
			label="Фильтровать новости"
			onchange={(filterNews) => filterSettings.patch({ filterNews })}
		/>
	</SettingsRow>
	<SettingsRow
		title="Фильтровать комментарии"
		subtitle="Скрывать комментарии под постами по тегам и фразам"
		tag="label"
	>
		<SettingsSwitch
			checked={filterSettings.value.filterComments}
			label="Фильтровать комментарии"
			onchange={(filterComments) => filterSettings.patch({ filterComments })}
		/>
	</SettingsRow>
</SettingsGroup>

{#snippet ratingSubgroup(
	title: string,
	switchTitle: string,
	enabled: boolean,
	minVotes: RatingMinVotes,
	mode: FilterMode,
	onEnabled: (value: boolean) => void,
	onMinVotes: (value: RatingMinVotes) => void,
	onMode: (value: FilterMode) => void
)}
	<SettingsGroup layout="subgroup" {title}>
		<SettingsRow title={switchTitle} tag="label">
			<SettingsSwitch checked={enabled} label={switchTitle} onchange={onEnabled} />
		</SettingsRow>
		<SettingsRow
			title="Минимальное количество голосов"
			subtitle="Положительных и отрицательных, без нейтральных"
		>
			<SettingsSegmented
				options={MIN_VOTES_OPTIONS}
				value={minVotes}
				label="Минимальное количество голосов ({title})"
				onchange={onMinVotes}
			/>
		</SettingsRow>
		<SettingsRow title="Режим скрытия" subtitle={modeSubtitle(mode)}>
			<SettingsSegmented
				options={MODE_OPTIONS}
				value={mode}
				label="Режим скрытия ({title})"
				onchange={onMode}
			/>
		</SettingsRow>
	</SettingsGroup>
{/snippet}

<SettingsGroup
	layout="subgroups"
	title="Фильтрация по рейтингу"
	description="Скрытие постов и комментариев с отрицательным рейтингом при достижении минимального числа общих голосов."
>
	{@render ratingSubgroup(
		'Посты',
		'Скрывать посты с негативным рейтингом',
		!!filterSettings.value.filterPostRating,
		filterSettings.value.postRatingMinVotes ?? 5,
		filterSettings.value.postRatingMode ?? 'soft',
		(filterPostRating) => filterSettings.patch({ filterPostRating }),
		(postRatingMinVotes) => filterSettings.patch({ postRatingMinVotes }),
		(postRatingMode) => filterSettings.patch({ postRatingMode })
	)}
	{@render ratingSubgroup(
		'Комментарии',
		'Скрывать комментарии с негативным рейтингом',
		!!filterSettings.value.filterCommentRating,
		filterSettings.value.commentRatingMinVotes ?? 5,
		filterSettings.value.commentRatingMode ?? 'soft',
		(filterCommentRating) => filterSettings.patch({ filterCommentRating }),
		(commentRatingMinVotes) => filterSettings.patch({ commentRatingMinVotes }),
		(commentRatingMode) => filterSettings.patch({ commentRatingMode })
	)}
</SettingsGroup>

<style>
	.filter-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px 20px;
	}

	.filter-card--top-border {
		border-top: 1px solid var(--st-separator);
	}

	.filter-label {
		color: var(--st-muted);
		font-size: 13px;
	}

	.input-container {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	/* Поле ввода как в описании профиля (био) с вертикальным ресайзом */
	.filter-textarea {
		width: 100%;
		min-width: 0;
		min-height: 48px;
		padding: 10px 14px;
		border: 1px solid transparent;
		border-radius: 14px;
		background: var(--st-field);
		color: inherit;
		font-family: inherit;
		font-size: 14px;
		line-height: 20px;
		outline: none;
		resize: vertical;
		transition: border-color var(--duration-base), background-color var(--duration-base);
	}

	.filter-textarea:focus {
		border-color: var(--st-accent);
		background: var(--st-card);
	}

	.filter-textarea::placeholder {
		color: var(--st-muted);
	}

	.input-actions {
		display: flex;
		justify-content: flex-end;
	}

	.presets-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.preset-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--st-field) 50%, transparent);
		border: 1px solid var(--st-separator);
	}

	.preset-row__info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.preset-row__title {
		font-size: 14px;
		font-weight: 500;
		line-height: 18px;
	}

	.preset-row__words {
		color: var(--st-muted);
		font-size: 12px;
		line-height: 16px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preset-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		flex: none;
		height: 32px;
		padding: 0 14px;
		border-radius: 16px;
		background: var(--st-button);
		color: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--duration-base), color var(--duration-base);
	}

	.preset-btn:hover {
		background: var(--st-button-hover);
	}

	.preset-btn--active {
		background: color-mix(in srgb, var(--st-accent) 15%, transparent);
		color: var(--st-accent);
	}

	.preset-btn--active:hover {
		background: color-mix(in srgb, var(--st-danger) 15%, transparent);
		color: var(--st-danger);
	}

	@container (max-width: 719px) {
		.filter-card {
			padding: 14px 16px;
		}

		.preset-row {
			padding: 10px 12px;
		}
	}

	@container (max-width: 480px) {
		.preset-btn {
			width: 34px;
			height: 34px;
			padding: 0;
			border-radius: 50%;
		}

		.preset-btn__text {
			display: none;
		}
	}
</style>
