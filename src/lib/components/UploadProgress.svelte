<script lang="ts">
	import { appear } from '$lib/themes/appear';

	let {
		progress = 0,
		processing = false,
		queued = false,
		size = 'md',
		oncancel
	}: {
		progress?: number;
		processing?: boolean;
		queued?: boolean;
		size?: 'sm' | 'md' | 'lg';
		oncancel?: () => void;
	} = $props();

	const RADIUS = 18;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	let clamped = $derived(Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)));
	let percent = $derived(processing ? 100 : queued ? 0 : Math.round(clamped * 100));
	// Во время серверной обработки держим незамкнутую дугу (~72%), чтобы вращение было заметно
	let dashOffset = $derived(
		processing
			? CIRCUMFERENCE * 0.28
			: queued
				? CIRCUMFERENCE
				: CIRCUMFERENCE * (1 - clamped)
	);

	let statusLabel = $derived(
		queued ? 'В очереди' : processing ? 'Обработка…' : size === 'lg' ? 'Загрузка…' : ''
	);
	let ariaLabel = $derived(
		queued ? 'В очереди на загрузку' : processing ? 'Обработка файла' : `Загрузка файла: ${percent}%`
	);
</script>

<div
	class={['upload-progress', `upload-progress--${size}`, { 'upload-progress--queued': queued, 'upload-progress--processing': processing }]}
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={percent}
	aria-label={ariaLabel}
>
	{#if oncancel}
		<button
			type="button"
			class="upload-progress__cancel"
			aria-label="Отменить загрузку"
			onclick={oncancel}
		>
			×
		</button>
	{/if}

	<div class="upload-progress__core" {@attach appear('uploadIn')}>
		<div class="upload-progress__ring-box">
			<svg class="upload-progress__svg" viewBox="0 0 44 44" aria-hidden="true">
				<circle
					class="upload-progress__track"
					cx="22"
					cy="22"
					r={RADIUS}
					fill="none"
				/>
				<circle
					class="upload-progress__arc"
					cx="22"
					cy="22"
					r={RADIUS}
					fill="none"
					stroke-dasharray={CIRCUMFERENCE}
					stroke-dashoffset={dashOffset}
				/>
			</svg>
			<span class="upload-progress__value">{percent}%</span>
		</div>

		{#if statusLabel && size !== 'sm'}
			<span class="upload-progress__label">{statusLabel}</span>
		{/if}
	</div>
</div>

<style>
	.upload-progress {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: auto;
		background: rgba(0, 0, 0, 0.36);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		transition: opacity var(--duration-base, 200ms) ease;
		user-select: none;
	}

	:global(:root[data-transparency="false"]) .upload-progress {
		background: rgba(0, 0, 0, 0.48);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	.upload-progress__cancel {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(18, 20, 24, 0.62);
		color: #fff;
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		transition:
			background-color var(--duration-base, 200ms) ease,
			transform var(--duration-base, 200ms) cubic-bezier(0.2, 0, 0, 1);
	}

	@media (hover: hover) {
		.upload-progress__cancel:hover {
			background: rgba(18, 20, 24, 0.85);
		}
	}

	.upload-progress__cancel:active {
		transform: scale(0.92);
	}

	.upload-progress__core {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px;
		border-radius: 16px;
		transition: opacity var(--duration-base, 200ms) ease;
	}

	.upload-progress--md .upload-progress__core,
	.upload-progress--lg .upload-progress__core {
		padding: 10px 14px;
		background: rgba(18, 20, 24, 0.54);
		backdrop-filter: blur(10px) saturate(140%);
		-webkit-backdrop-filter: blur(10px) saturate(140%);
		border: 1px solid rgba(255, 255, 255, 0.14);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
	}

	:global(:root[data-transparency="false"]) .upload-progress--md .upload-progress__core,
	:global(:root[data-transparency="false"]) .upload-progress--lg .upload-progress__core {
		background: rgba(18, 20, 24, 0.78);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	.upload-progress__ring-box {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 46px;
		height: 46px;
	}

	.upload-progress--sm .upload-progress__ring-box {
		width: 38px;
		height: 38px;
	}

	.upload-progress--lg .upload-progress__ring-box {
		width: 54px;
		height: 54px;
	}

	.upload-progress__svg {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.upload-progress__track {
		stroke: rgba(255, 255, 255, 0.24);
		stroke-width: 3;
	}

	.upload-progress__arc {
		stroke: #fff;
		stroke-width: 3;
		stroke-linecap: round;
		transition:
			stroke-dashoffset 220ms cubic-bezier(0.2, 0, 0, 1),
			opacity var(--duration-base, 200ms) ease;
	}

	.upload-progress--sm .upload-progress__track,
	.upload-progress--sm .upload-progress__arc {
		stroke-width: 3.4;
	}

	.upload-progress--queued .upload-progress__core {
		opacity: 0.78;
	}

	.upload-progress--processing .upload-progress__svg {
		animation: upload-progress-spin 0.9s linear infinite;
	}

	.upload-progress__value {
		position: absolute;
		color: #fff;
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
	}

	.upload-progress--sm .upload-progress__value {
		font-size: 10px;
	}

	.upload-progress--lg .upload-progress__value {
		font-size: 13px;
	}

	.upload-progress__label {
		color: rgba(255, 255, 255, 0.92);
		font-size: 12px;
		font-weight: 500;
		line-height: 1.2;
		white-space: nowrap;
	}

	@keyframes upload-progress-spin {
		to {
			transform: rotate(270deg);
		}
	}
</style>
