<script lang="ts">
	import { closeOverlay } from '$lib/navigation';

	type Method = {
		id: string;
		title: string;
		description: string;
		href: string;
		tint: string;
		mono?: boolean;
		path: string;
		viewBox?: string;
		filled?: boolean;
	};

	/*
	 * Окно «Поддержать reDTF»: три способа на выбор. Одно и то же окно открывают сайдбар,
	 * плашка в ленте и страница «Хочу помочь» в настройках.
	 */
	const METHODS: Method[] = [
		{
			id: 'cloudtips',
			title: 'CloudTips',
			description: 'СБП, карты «Мир», Tinkoff Pay',
			href: 'https://pay.cloudtips.ru/p/2fa64784',
			tint: '#6496dc',
			// Карта
			path: 'M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5zM3 10h18M7 15h3'
		},
		{
			id: 'dalink',
			title: 'DALink',
			description: 'Любая валюта и любой способ оплаты',
			href: 'https://dalink.to/donnertech',
			// Чёрно-белый, как у самого сервиса: цвет берётся из текста темы
			tint: 'var(--text-primary, #111)',
			mono: true,
			// Внутренняя часть логотипа DALink (цепочка)
			viewBox: '1.5 1.5 30 30',
			filled: true,
			path: 'M8.76953 15.6807C7.62838 16.8218 6.99913 18.3402 6.99902 19.9551C6.99902 21.5702 7.62828 23.0892 8.76953 24.2305C9.91074 25.3715 11.429 26 13.0439 26C14.6589 26 16.176 25.3716 17.3184 24.2305L19.9346 21.6143L18.2559 19.9346L15.6396 22.5488C14.2526 23.9347 11.8365 23.9359 10.4482 22.5488C9.75471 21.8565 9.37402 20.9348 9.37402 19.9551C9.37413 18.9744 9.75494 18.0538 10.4482 17.3604L13.0645 14.7441L11.3857 13.0645L8.76953 15.6807ZM12.0977 19.2227L13.7764 20.9014L20.9023 13.7764L19.2227 12.0977L12.0977 19.2227ZM19.9561 6.99902C18.341 6.99902 16.8231 7.62731 15.6807 8.76855L13.0645 11.3848L14.7441 13.0645L17.3604 10.4502C18.0539 9.75554 18.9752 9.37402 19.9561 9.37402C20.9356 9.37409 21.8573 9.75486 22.5508 10.4482C23.2443 11.1418 23.625 12.0642 23.625 13.0439C23.6249 14.0247 23.2442 14.9452 22.5508 15.6387L19.9346 18.2549L21.6143 19.9346L24.2305 17.3184C25.3716 16.1772 25.9999 14.6589 26 13.0439C26 11.4289 25.3717 9.9098 24.2305 8.76855C23.0893 7.62746 21.571 6.99909 19.9561 6.99902Z'
		},
		{
			id: 'boosty',
			title: 'Boosty',
			description: 'Регулярная поддержка, любые способы оплаты',
			href: 'https://boosty.to/donnertech',
			// Фирменный оранжевый Boosty, слегка приглушённый до пастельного
			tint: '#ee7f55',
			// Молния
			path: 'M13 3L5 13.5h6L10 21l8-10.5h-6z'
		}
	];
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && closeOverlay()} />

<div class="window" role="dialog" aria-modal="true" aria-labelledby="support-title">
	<button class="close" type="button" aria-label="Закрыть" onclick={closeOverlay}>
		<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
			<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
	</button>

	<header class="head">
		<span class="heart" aria-hidden="true">
			<svg viewBox="0 0 24 24" width="30" height="30">
				<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" />
			</svg>
		</span>
		<h2 id="support-title" class="title">Поддержите reDTF</h2>
		<p class="subtitle">Деньги идут на сервер, домен и труд разработки. Выберите удобный способ</p>
	</header>

	<ul class="methods">
		{#each METHODS as method (method.id)}
			<li>
				<a class={["method", { mono: method.mono }]} href={method.href} target="_blank" rel="noopener noreferrer" style:--tint={method.tint}>
					<span class="method__icon" aria-hidden="true">
						<svg viewBox={method.viewBox ?? '0 0 24 24'} width="24" height="24">
							<path
								d={method.path}
								fill={method.filled ? 'currentColor' : 'none'}
								stroke={method.filled ? 'none' : 'currentColor'}
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
					<span class="method__text">
						<span class="method__name">{method.title}</span>
						<span class="method__description">{method.description}</span>
					</span>
					<svg class="method__arrow" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
						<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</a>
			</li>
		{/each}
	</ul>

	<p class="thanks">Спасибо, что вы с нами!</p>
</div>

<style>
	.window {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 20px;
		width: 100%;
		max-width: 460px;
		max-height: 100%;
		padding: 32px 24px 24px;
		overflow-y: auto;
		box-sizing: border-box;
		border-radius: 20px;
		background:
			linear-gradient(180deg, color-mix(in srgb, #e5484d 14%, transparent), transparent 180px),
			var(--bg-modal, var(--bg-card, #fff));
		color: var(--text-primary, inherit);
		border: 1px solid var(--border-subtle, transparent);
		box-shadow: var(--shadow-popup, 0 8px 32px rgba(0, 0, 0, 0.2));
	}

	.close {
		position: absolute;
		top: 12px;
		right: 12px;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		color: var(--text-muted, currentColor);
		cursor: pointer;
		transition: background-color var(--duration-base, 0.15s), color var(--duration-base, 0.15s);
	}

	.close:hover {
		background: var(--bg-button-hover, rgba(128, 128, 128, 0.15));
		color: var(--text-primary, inherit);
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.heart {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: color-mix(in srgb, #e5484d 16%, transparent);
		color: #e5484d;
	}

	.title {
		margin: 16px 0 0;
		font-size: 22px;
		font-weight: 600;
		line-height: 28px;
	}

	.subtitle {
		margin: 6px 0 0;
		max-width: 340px;
		color: var(--text-secondary, inherit);
		font-size: 15px;
		line-height: 22px;
	}

	.methods {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.method {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--tint) 8%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tint) 22%, transparent);
		color: inherit;
		text-decoration: none;
		transition: background-color var(--duration-base, 0.15s), box-shadow var(--duration-base, 0.15s), transform var(--duration-base, 0.15s);
	}

	.method:hover {
		background: color-mix(in srgb, var(--tint) 14%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tint) 45%, transparent);
	}

	.method:active {
		transform: scale(0.985);
	}

	.method:focus-visible,
	.close:focus-visible {
		outline: 2px solid var(--tint, var(--color-blue, #3584e4));
		outline-offset: 2px;
	}

	/* Чёрно-белая плитка: инверсия цвета текста темы */
	.method.mono .method__icon {
		color: var(--bg-modal, #fff);
	}

	.method__icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 46px;
		height: 46px;
		border-radius: 14px;
		background: linear-gradient(145deg, color-mix(in srgb, var(--tint) 78%, #fff), var(--tint));
		box-shadow: 0 4px 10px color-mix(in srgb, var(--tint) 30%, transparent);
		color: #fff;
	}

	.method__text {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.method__name {
		font-size: 17px;
		font-weight: 600;
		line-height: 24px;
	}

	.method__description {
		color: var(--text-secondary, inherit);
		font-size: 14px;
		line-height: 20px;
	}

	.method__arrow {
		flex: none;
		color: var(--text-muted, currentColor);
	}

	.thanks {
		margin: 0;
		color: var(--text-muted, inherit);
		font-size: 14px;
		line-height: 20px;
		text-align: center;
	}

	@media (max-width: 479px) {
		.window {
			padding: 28px 16px 20px;
			border-radius: 16px;
		}
	}
</style>
