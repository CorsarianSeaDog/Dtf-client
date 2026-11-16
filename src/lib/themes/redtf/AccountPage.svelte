<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { currentUser } from '$lib/api/currentUser.svelte';
	import { donationAccount, loadAccount } from '$lib/api/donationAccount.svelte';
	import { authStorage } from '$lib/storage/auth.svelte';
	import { getProfilePath, isNewTabClick, openDrafts, openOverlay, openProfile, openSettings } from '$lib/navigation';
	import { haptics } from '$lib/haptics';
	import Dialog from '$lib/components/Dialog.svelte';
	import { startWriting } from '../dtf2022/actions.svelte';
	import { donationsNote, formatNumber, plural } from '../dtf2022/format';
	import { fromAction } from 'svelte/attachments';
	import { lazyVideo } from '$lib/actions/lazyVideo';
	import { animatedAvatar } from '$lib/actions/animatedAvatar.svelte';
	import { getAnimatedVideoUrl } from '$lib/api/utils';

	/*
	 * Страница аккаунта для нижней панели смартфона: карточка с профилем, черновики, донаты и выход.
	 * Настройки — отдельное окно: карандаш на обложке открывает в нём один раздел профиля, кнопка под списком — всё окно.
	 * Гостю вместо карточки предлагается войти. Профиль — из `currentUser` (кэш и /subsite/me), баланс — из `donationAccount`;
	 * обновляются повторным нажатием на профиль в нижней панели или жестом сверху вниз.
	 */

	let user = $derived(authStorage.isAuthenticated ? currentUser.value : null);
	let confirmLogout = $state(false);

	onMount(() => {
		if (authStorage.isAuthenticated) loadAccount();
	});

	let donationsSub = $derived(donationsNote(donationAccount.value));

	// Колонки стоят сразу. В кэше прошлых версий счётчиков нет: до ответа в колонках заглушки, карточка не перестраивается
	const stat = (key: string, n: number | undefined, forms: [string, string, string]) =>
		n === undefined ? { key } : { key, value: formatNumber(n), label: plural(n, forms) };

	let stats = $derived<{ key: string; value?: string; label?: string }[]>([
		stat('rating', user?.rating, ['рейтинг', 'рейтинг', 'рейтинг']),
		stat('subscribers', user?.subscribersCount, ['подписчик', 'подписчика', 'подписчиков']),
		stat('subscriptions', user?.subscriptionsCount, ['подписка', 'подписки', 'подписок'])
	]);

	let avatarUrl = $derived(user?.avatarLargeUrl ?? user?.avatarUrl);

	function openMe(e: MouseEvent) {
		haptics.tick();
		if (user) openProfile(e, user.id);
	}

	function editProfile(e: MouseEvent) {
		if (isNewTabClick(e)) return;
		e.preventDefault();
		haptics.tick();
		openOverlay({ type: 'settings', data: { page: 'account', solo: true } });
	}

	function tap(action: () => void) {
		haptics.tick();
		action();
	}

	function logout() {
		confirmLogout = false;
		haptics.tick();
		// Данные пользователя чистит шапка, когда сессия пропадает
		authStorage.logout();
	}
</script>

{#snippet settingsRow()}
	<a class="list row" href={resolve('/settings')} onclick={(e) => tap(() => openSettings(e))}>
		<span class="row__icon"><svg class="icon" width="20" height="20" aria-hidden="true"><use href="#v_gear"></use></svg></span>
		<span class="row__label">Настройки</span>
		<svg class="icon row__end" width="16" height="16" aria-hidden="true"><use href="#v_chevron_right"></use></svg>
	</a>
{/snippet}

<div class="account">
	{#if user}
		<section class="hero">
			<div class="hero__cover">
				{#if user.coverUrl}
					{#if getAnimatedVideoUrl(user.coverUrl)}
						<video
							class="hero__cover-image"
							src={getAnimatedVideoUrl(user.coverUrl)}
							poster={user.coverUrl}
							style:object-position="50% {user.coverY ?? 50}%"
							muted
							loop
							playsinline
							{@attach fromAction(lazyVideo)}
						></video>
					{:else}
						<img class="hero__cover-image" src={user.coverUrl} alt="" style:object-position="50% {user.coverY ?? 50}%" />
					{/if}
				{:else if user.avatarUrl}
					<!-- Без обложки фон — размытая аватарка: у каждого своя, но в цветах профиля -->
					<div class="hero__cover-blur" style:background-image="url('{user.avatarUrl}')"></div>
				{/if}
				<!-- Только раздел профиля, без бокового меню настроек -->
				<a class="edit-button" href="{resolve('/settings')}?page=account" onclick={editProfile} aria-label="Редактировать профиль">
					<svg class="icon" width="20" height="20" aria-hidden="true"><use href="#v_pencil"></use></svg>
				</a>
			</div>

			<div class="hero__body">
				<a class="hero__avatar" href={resolve(getProfilePath(user.id) as any)} onclick={openMe} aria-label="Мой профиль" {@attach animatedAvatar(avatarUrl, true)}>
					{#if avatarUrl}
						<img src={avatarUrl} alt="" />
					{/if}
				</a>

				<h1 class="hero__name">{user.name}</h1>

				<div class="hero__stats">
					{#each stats as stat (stat.key)}
						<div class="stat">
							{#if stat.value}
								<span class="stat__value stat__appear">{stat.value}</span>
								<span class="stat__label stat__appear">{stat.label}</span>
							{:else}
								<span class="stat__value"><span class="stat__ghost stat__ghost--value"></span></span>
								<span class="stat__label"><span class="stat__ghost stat__ghost--label"></span></span>
							{/if}
						</div>
					{/each}
				</div>

				<div class="hero__actions">
					<a class="action action--primary" href={resolve(getProfilePath(user.id) as any)} onclick={openMe}>
						Мой профиль
					</a>
					<button type="button" class="action" onclick={() => tap(startWriting)}>
						<svg class="icon" width="20" height="20" aria-hidden="true"><use href="#v_pencil"></use></svg>
						Написать
					</button>
				</div>
			</div>
		</section>

		<nav class="list" aria-label="Мои материалы">
			<a class="row" href={resolve('/drafts')} onclick={(e) => tap(() => openDrafts(e))}>
				<span class="row__icon"><svg class="icon" width="20" height="20" aria-hidden="true"><use href="#v_pen"></use></svg></span>
				<span class="row__label">Черновики</span>
				<svg class="icon row__end" width="16" height="16" aria-hidden="true"><use href="#v_chevron_right"></use></svg>
			</a>
			<a class="row" href={donationAccount.href} target="_blank" rel="noopener noreferrer" onclick={() => haptics.tick()}>
				<span class="row__icon"><svg class="icon" width="20" height="20" aria-hidden="true"><use href="#v_rouble"></use></svg></span>
				<span class="row__label">Донаты</span>
				{#if donationsSub}
					<span class="row__value">{donationsSub}</span>
				{/if}
				<svg class="icon row__end" width="16" height="16" aria-hidden="true"><use href="#v_external"></use></svg>
			</a>
		</nav>

		{@render settingsRow()}

		<button type="button" class="logout" onclick={() => tap(() => (confirmLogout = true))}>
			<svg class="icon" width="20" height="20" aria-hidden="true"><use href="#v_logout"></use></svg>
			Выйти из аккаунта
		</button>
	{:else}
		<section class="hero hero--guest">
			<div class="guest__icon"><svg class="icon" width="32" height="32" aria-hidden="true"><use href="#v_login"></use></svg></div>
			<h1 class="guest__title">Войдите в аккаунт DTF</h1>
			<p class="guest__text">Чтобы оценивать посты, писать комментарии и собирать свою ленту подписок.</p>
			<button type="button" class="action action--primary action--wide" onclick={() => tap(() => openOverlay({ type: 'login' }))}>Войти</button>
		</section>

		{@render settingsRow()}
	{/if}
</div>

{#if confirmLogout}
	<Dialog label="Выход из аккаунта" width="360px" onClose={() => (confirmLogout = false)}>
		<div class="confirm">
			<p class="confirm__title">Выйти из аккаунта?</p>
			<p class="confirm__text">Настройки клиента останутся на этом устройстве, войти снова можно в любой момент.</p>
			<div class="confirm__actions">
				<button type="button" class="action" onclick={() => (confirmLogout = false)}>Отмена</button>
				<button type="button" class="action action--danger" onclick={logout}>Выйти</button>
			</div>
		</div>
	</Dialog>
{/if}

<style>
	.account {
		--radius: 16px;
		--row-height: 52px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
		max-width: var(--content-width);
		padding: 12px 12px 24px;
		color: var(--text-primary);
	}

	@media (min-width: 720px) {
		.account {
			padding-top: 20px;
		}
	}

	/* --- Карточка профиля --- */
	.hero {
		position: relative;
		overflow: hidden;
		border-radius: var(--radius);
		background: var(--bg-card);
		box-shadow: var(--shadow-card);
	}

	.hero__cover {
		position: relative;
		height: 112px;
		overflow: hidden;
		background: linear-gradient(135deg, var(--color-blue-tint), var(--bg-header));
	}

	.hero__cover-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		animation: fade-in 0.5s ease backwards;
	}

	.hero__cover-blur {
		position: absolute;
		inset: -40px;
		background: center / cover no-repeat;
		filter: blur(28px) saturate(1.4);
		opacity: 0.75;
	}

	/* Низ обложки растворяется в карточке */
	.hero__cover::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 48px;
		background: linear-gradient(transparent, color-mix(in srgb, var(--bg-card) 35%, transparent));
	}

	.hero__body {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0 16px 16px;
		text-align: center;
	}

	.hero__avatar {
		position: relative;
		width: 88px;
		height: 88px;
		margin-top: -44px;
		border-radius: 50%;
		overflow: hidden;
		background: var(--bg-secondary);
		box-shadow:
			0 0 0 4px var(--bg-card),
			0 6px 18px rgba(0, 0, 0, 0.18);
		transition: scale 0.15s cubic-bezier(0.165, 0.84, 0.44, 1);
	}

	.hero__avatar:active {
		scale: 0.95;
	}

	.hero__avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.hero__name {
		margin-top: 12px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 22px;
		line-height: 28px;
		font-weight: 600;
	}

	.hero__stats {
		display: flex;
		justify-content: center;
		gap: 4px;
		width: 100%;
		min-height: 44px;
		margin-top: 12px;
	}

	.stat {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		min-width: 0;
		padding: 2px 4px;
	}

	.stat + .stat {
		border-left: 1px solid var(--border-subtle);
	}

	/* Заглушки по форме числа и подписи, на тех же строках, что и они: смена на числа ничего не сдвигает */
	.stat__ghost {
		display: inline-block;
		vertical-align: middle;
		border-radius: 6px;
		background: var(--bg-secondary);
		animation: ghost 1s ease-in-out infinite alternate;
	}

	.stat__ghost--value {
		width: 52px;
		height: 14px;
	}

	.stat__ghost--label {
		width: 64px;
		height: 10px;
	}

	.stat:nth-child(2) .stat__ghost {
		animation-delay: 0.15s;
	}

	.stat:nth-child(3) .stat__ghost {
		animation-delay: 0.3s;
	}

	.stat__appear {
		animation: fade-in 0.35s ease backwards;
	}

	.stat__value {
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.stat__label {
		color: var(--text-caption);
		font-size: 13px;
		line-height: 18px;
	}

	.hero__actions {
		display: flex;
		gap: 8px;
		width: 100%;
		margin-top: 16px;
	}

	/* --- Кнопки --- */
	.action {
		display: inline-flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 44px;
		padding: 0 12px;
		border-radius: 12px;
		white-space: nowrap;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font: inherit;
		font-size: 15px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color 0.2s ease,
			scale 0.15s cubic-bezier(0.165, 0.84, 0.44, 1);
	}

	.action:hover {
		background: var(--bg-card-hover-2);
	}

	.action:active {
		scale: 0.97;
	}

	.action--primary {
		background: var(--bg-submit-button);
		color: var(--text-submit-button);
	}

	.action--primary:hover {
		background: var(--bg-submit-button--hover);
	}

	.action--danger {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
	}

	.action--danger:hover {
		background: var(--color-danger-subtle);
	}

	.action--wide {
		flex: none;
		width: 100%;
		margin-top: 16px;
	}

	/* --- Гость --- */
	.hero--guest {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 28px 20px 20px;
		text-align: center;
		background:
			radial-gradient(120% 80% at 50% 0%, var(--color-blue-tint), transparent 70%),
			var(--bg-card);
	}

	.guest__icon {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: var(--bg-card);
		color: var(--color-blue);
		box-shadow: 0 4px 14px rgba(70, 131, 217, 0.25);
	}

	.guest__title {
		margin-top: 16px;
		font-size: 20px;
		line-height: 26px;
		font-weight: 600;
	}

	.guest__text {
		max-width: 320px;
		margin-top: 6px;
		color: var(--text-caption);
		font-size: 15px;
		line-height: 21px;
	}

	/* --- Карандаш в углу карточки: стекло поверх обложки --- */
	.edit-button {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--bg-card) 55%, transparent);
		backdrop-filter: blur(12px) saturate(160%);
		color: var(--text-primary);
		transition: scale 0.15s cubic-bezier(0.165, 0.84, 0.44, 1);
	}

	.edit-button:active {
		scale: 0.92;
	}

	/* --- Список --- */
	.list {
		overflow: hidden;
		border-radius: var(--radius);
		background: var(--bg-card);
		box-shadow: var(--shadow-card);
	}

	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: var(--row-height);
		padding: 0 14px;
		color: var(--text-primary);
		font-size: 16px;
		line-height: 22px;
		transition: background-color 0.15s ease;
	}

	/* Разделитель от текста, а не от края, как в системных списках */
	.row + .row::before {
		content: '';
		position: absolute;
		top: 0;
		left: 60px;
		right: 0;
		border-top: 1px solid var(--border-subtle);
	}

	.row:hover {
		background: var(--bg-card-hover);
	}

	.row:active {
		background: var(--bg-card-active);
	}

	.row__icon {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: var(--color-blue-tint);
		color: var(--color-blue);
	}

	.row__label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row__end {
		flex-shrink: 0;
		color: var(--text-placeholder);
	}

	.row__value {
		flex-shrink: 0;
		color: var(--text-caption);
		font-variant-numeric: tabular-nums;
		animation: fade-in 0.35s ease backwards;
	}

	/* --- Выход --- */
	.logout {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: var(--row-height);
		border-radius: var(--radius);
		background: var(--bg-card);
		box-shadow: var(--shadow-card);
		color: var(--color-danger-text);
		font: inherit;
		font-size: 16px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			scale 0.15s cubic-bezier(0.165, 0.84, 0.44, 1);
	}

	.logout:hover {
		background: var(--color-danger-bg);
	}

	.logout:active {
		scale: 0.98;
	}

	/* --- Подтверждение выхода --- */
	.confirm {
		text-align: center;
	}

	.confirm__title {
		font-size: 18px;
		line-height: 24px;
		font-weight: 600;
	}

	.confirm__text {
		margin-top: 8px;
		color: var(--text-caption);
		font-size: 15px;
		line-height: 21px;
	}

	.confirm__actions {
		display: flex;
		gap: 8px;
		margin-top: 20px;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes ghost {
		to {
			opacity: 0.4;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero__cover-image,
		.stat__appear,
		.stat__ghost,
		.row__value {
			animation: none;
		}
	}
</style>
