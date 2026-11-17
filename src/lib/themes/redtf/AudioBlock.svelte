<script lang="ts">
	import { getAudioUrl, getLeonardoUrl } from '$lib/api/utils';
	import { formatNumber, plural } from '../dtf2022/format';
	import { claimPlayback, formatDuration } from '../dtf2022/post/audio';

	/*
	 * Плеер блока audio для redtf. Строка как у плеера DTF 2023 (кнопки, название, время, под ней тонкая перемотка),
	 * а оформление как у экрана настроек (Adwaita): карточка с тонким кольцом, плоские кнопки, контурные значки, бегунок на дорожке.
	 * Основа (dtf2022) рисует плеер DTF 2023 года. Плавающего плеера, который играет вне поста, нет.
	 */
	let { data }: { data: any } = $props();

	const RATES = [1, 1.25, 1.5, 2];

	let file = $derived(data.audio?.data);
	let cover = $derived(data.image?.data);
	let title = $derived(data.title?.trim() || file?.filename?.replace(/\.[^.]+$/, '') || 'Аудио');
	let listens = $derived(file?.audio_info?.listens_count ?? 0);
	let src = $derived(file?.uuid ? getAudioUrl(file.uuid, file.filename) : '');

	let audio = $state<HTMLAudioElement>();
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);
	let waiting = $state(false);
	let volume = $state(1);
	let muted = $state(false);
	let playbackRate = $state(1);

	// До загрузки метаданных длительность берём из данных блока
	let length = $derived(duration || file?.audio_info?.duration || 0);
	let progress = $derived(length ? Math.min(100, (currentTime / length) * 100) : 0);

	function toggle() {
		if (!audio) return;
		if (audio.paused) audio.play().catch(() => {});
		else audio.pause();
	}

	function nextRate() {
		playbackRate = RATES[(RATES.indexOf(playbackRate) + 1) % RATES.length];
	}
</script>

<!-- Значки как в SettingsIcon: контур со скруглёнными концами, цвет текста -->
{#snippet icon(name: 'volume' | 'mute' | 'download')}
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if name === 'download'}
			<path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5M5 19h14" />
		{:else}
			<path d="M4 9.5h3l4.5-3.5v12L7 14.5H4z" />
			{#if name === 'mute'}
				<path d="M16 10l5 4M21 10l-5 4" />
			{:else}
				<path d="M15.5 9.5a3.5 3.5 0 010 5M18 7a7 7 0 010 10" />
			{/if}
		{/if}
	</svg>
{/snippet}

{#if file?.uuid}
	<div class="audio">
		<audio
			bind:this={audio}
			{src}
			preload="metadata"
			bind:currentTime
			bind:duration
			bind:paused
			bind:volume
			bind:muted
			bind:playbackRate
			onplay={() => audio && claimPlayback(audio)}
			onwaiting={() => (waiting = true)}
			onplaying={() => (waiting = false)}
		></audio>

		<div class="audio__row">
			<button class={['audio__play', paused && 'audio__play--paused', waiting && !paused && 'audio__play--loading']} aria-label={paused ? 'Играть' : 'Пауза'} onclick={toggle}>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
					{#if paused}
						<path d="M5.5 3.5v9l7.5-4.5z" />
					{:else}
						<path d="M4.75 3.75h2v8.5h-2zM9.25 3.75h2v8.5h-2z" />
					{/if}
				</svg>
			</button>

			{#if cover?.uuid}
				<img class="audio__cover" src={getLeonardoUrl(cover.uuid, { scale_crop: '96x96' })} alt="" loading="lazy" />
			{/if}

			<div class="audio__info">
				<span class="audio__title" {title}>{title}</span>
				<span class="audio__meta">
					{formatDuration(currentTime)} / {formatDuration(length)}{#if listens > 0}<span class="audio__listens"> · {formatNumber(listens)} {plural(listens, ['прослушивание', 'прослушивания', 'прослушиваний'])}</span>{/if}
				</span>
			</div>

			<div class="audio__tools">
				<button class="audio__rate" class:audio__rate--idle={playbackRate === 1} aria-label="Скорость" onclick={nextRate}>{playbackRate}×</button>

				<div class="audio__wide">
					<button class="audio__button" aria-label={muted ? 'Включить звук' : 'Выключить звук'} onclick={() => (muted = !muted)}>
						{@render icon(muted || volume === 0 ? 'mute' : 'volume')}
					</button>
					<input
						class="audio__slider audio__slider--volume"
						type="range"
						min="0"
						max="1"
						step="0.05"
						aria-label="Громкость"
						value={muted ? 0 : volume}
						style:--progress="{(muted ? 0 : volume) * 100}%"
						oninput={(e) => {
							volume = +e.currentTarget.value;
							muted = false;
						}}
					/>
					<a class="audio__button" href={src} download={file.filename} target="_blank" rel="noopener" aria-label="Скачать">{@render icon('download')}</a>
				</div>
			</div>
		</div>

		<input
			class="audio__slider audio__seek"
			type="range"
			min="0"
			max={length}
			step="0.1"
			aria-label="Перемотка"
			value={currentTime}
			style:--progress="{progress}%"
			oninput={(e) => (currentTime = +e.currentTarget.value)}
		/>
	</div>
{/if}

<style>
	/* Карточка как у постов ленты: тонкое кольцо и мягкая тень темы */
	.audio {
		padding: 10px 12px 4px;
		border-radius: 8px;
		background: var(--bg-card);
		box-shadow: 0 0 0 1px var(--border-subtle), var(--shadow-card);
		user-select: none;
	}

	.audio audio {
		display: none;
	}

	/* В ленте и во встроенном посте блоки идут от края карточки, а плеер — карточка с полями, как текст */
	:global(.post-blocks--card > .post-block--audio) .audio,
	:global(.post-blocks--embed > .post-block--audio) .audio {
		margin-inline: var(--island-offset-x, 16px);
	}

	.audio__row,
	.audio__tools,
	.audio__wide {
		display: flex;
		align-items: center;
	}

	.audio__row {
		gap: 10px;
	}

	.audio__tools {
		flex: none;
		gap: 2px;
	}

	.audio__play,
	.audio__button,
	.audio__rate {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		cursor: pointer;
	}

	/* «Suggested action»: единственное акцентное место плеера. Пока стоит — скруглённый квадрат, во время игры округляется */
	.audio__play {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--color-blue);
		color: var(--text-on-accent);
		transition: border-radius var(--duration-base);
	}

	.audio__play:not(.audio__play--paused) {
		border-radius: 50%;
	}

	.audio__play--loading {
		animation: audio-loading 1s ease-in-out infinite;
	}

	@keyframes audio-loading {
		50% {
			opacity: 0.55;
		}
	}

	/* Плоские кнопки: без заливки, пока на них не навели */
	.audio__button {
		width: 32px;
		height: 32px;
		color: var(--text-muted);
	}

	/* Скачивание — ссылка, а ссылки блоков поста синие и с подчёркиванием (PostBlocks): возвращаем ей вид кнопки */
	.audio a.audio__button {
		border: 0;
		color: var(--text-muted);
	}

	/* Скорость: плоская кнопка, как и остальные; акцентная, пока скорость не обычная */
	.audio__rate {
		min-width: 40px;
		height: 32px;
		padding: 0 6px;
		color: var(--color-blue);
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}

	.audio__rate--idle {
		color: var(--text-muted);
	}

	.audio__cover {
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: 6px;
		background: var(--bg-media-frame);
		object-fit: cover;
	}

	.audio__info {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}

	.audio__title,
	.audio__meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.audio__title {
		font-size: 15px;
		font-weight: 500;
		line-height: 20px;
	}

	.audio__meta {
		color: var(--text-muted);
		font-size: 13px;
		font-variant-numeric: tabular-nums;
		line-height: 18px;
	}

	.audio__play:focus-visible,
	.audio__button:focus-visible,
	.audio__rate:focus-visible,
	.audio__slider:focus-visible {
		outline: 2px solid var(--color-blue);
		outline-offset: 2px;
	}

	@media (hover: hover) {
		.audio__button:hover,
		.audio__rate:hover,
		.audio a.audio__button:hover {
			background: var(--bg-button-hover);
		}

		.audio__button:hover,
		.audio a.audio__button:hover,
		.audio__rate--idle:hover {
			color: var(--text-primary);
		}

		.audio__play:hover {
			filter: brightness(1.08);
		}
	}

	/* Полоса как у ползунка в настройках: дорожка 4px, до значения акцентная, белый бегунок с мягкой тенью */
	.audio__slider {
		appearance: none;
		height: 24px;
		margin: 0;
		background: transparent;
		cursor: pointer;
	}

	.audio__seek {
		display: block;
		width: 100%;
		margin-top: 2px;
	}

	.audio__slider::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(to right, var(--color-blue) var(--progress), var(--theme-st-track, #d6d6d6) var(--progress));
	}

	.audio__slider::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(to right, var(--color-blue) var(--progress), var(--theme-st-track, #d6d6d6) var(--progress));
	}

	.audio__slider::-webkit-slider-thumb {
		appearance: none;
		width: 16px;
		height: 16px;
		margin-top: -6px;
		border: 0;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
		transition: transform var(--duration-base);
	}

	.audio__slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border: 0;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
		transition: transform var(--duration-base);
	}

	.audio__slider:active::-webkit-slider-thumb {
		transform: scale(1.1);
	}

	.audio__slider:active::-moz-range-thumb {
		transform: scale(1.1);
	}

	.audio__slider--volume {
		width: 72px;
		margin: 0 4px;
	}

	/* Громкость и скачивание только на широком экране: на телефоне громкость на кнопках устройства */
	@media (max-width: 859px) {
		.audio__wide {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.audio__play--loading {
			animation: none;
		}
	}
</style>
