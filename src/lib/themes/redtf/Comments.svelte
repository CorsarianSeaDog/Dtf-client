<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { Comment, CommentUpdate, CommentMedia, CommentTreeItem } from '$lib/api/types';
	import { api } from '$lib/api/index.svelte';
	import { currentUser } from '$lib/api/currentUser.svelte';
	import { CommentsLogic } from '$lib/components/Comments/commentsLogic.svelte';
	import { settings } from '$lib/storage/settings.svelte';
	import { ensureLogin } from '../dtf2022/actions.svelte';
	import { formatNumber, plural } from '../dtf2022/format';
	import { notify } from '../dtf2022/ui/notify.svelte';
	import Popover from '../dtf2022/ui/Popover.svelte';
	import Preloader from '../dtf2022/ui/Preloader.svelte';
	import CommentEditor from '../dtf2022/comments/CommentEditor.svelte';
	import CommentFocusBanner from '../dtf2022/comments/CommentFocusBanner.svelte';
	import CommentItem from '../dtf2022/comments/CommentItem.svelte';
	import CommentRestriction from '../dtf2022/comments/CommentRestriction.svelte';
	import { commentKey, flattenComments, patchCommentRow } from '../dtf2022/comments/flatten';
	import { collectThreadMentionAuthors } from '../dtf2022/comments/mentions';
	import { bindCommentsView } from '../dtf2022/comments/commentsView.svelte';
	import { VirtualRows } from '../dtf2022/comments/virtualRows.svelte';
	import { toggleCommentReaction, voteComment } from '../dtf2022/comments/votes.svelte';
	import { REACTIONS } from '$lib/config/reactions';
	import { quickReactions, reactionSettings } from '$lib/storage/reactions.svelte';
	import { activeTheme } from '$lib/themes/index.svelte';
	import { themeSettings } from './themeSettings.svelte';
	import { commentSwipe, type SwipeView } from './comments/commentSwipe';
	import { reflow } from './comments/branchMotion';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { reducedMotion } from '$lib/motion';
	import type { ThemeComponents } from '../contract';

	let {
		postId,
		sourceId = 'dtf',
		commentsCount = 0,
		subscribed = false,
		postAuthorId,
		commentEditor,
		focusCommentId,
		focusNonce,
		active = true,
		onfocused,
		onCountChange,
		onReconnect,
		onRefreshReady
	}: ThemeComponents['Comments'] = $props();

	/** Писать нельзя: ни нового комментария, ни ответа (правка своего остаётся на усмотрение сервера) */
	let blocked = $derived(commentEditor?.enabled === false);

	let sortings = $derived([
		{ value: 'hotness', label: 'Лучшие' },
		{ value: 'date', label: 'Последние' },
		{ value: 'dateAsc', label: 'Первые' },
		...(reactionSettings.value.rank ? [{ value: 'worst', label: 'Худшие' }] : [])
	]);

	const logic = new CommentsLogic(() => postId, () => sourceId);

	$effect(() => {
		if (!reactionSettings.value.rank && logic.sorting === 'worst') {
			setSorting('hotness');
		}
	});

	let isAutopan = $derived(settings.value.commentNesting === 'autopan');

	/** Свёрнутые ветки: ключи комментариев, чьи ответы скрыты */
	const collapsed = new SvelteSet<string>();
	/** При автопанорамировании ветки не упираются в искусственный лимит глубины */
	let maxDepth = $derived(isAutopan ? 50 : logic.maxVisualDepth);
	const buildRows = () => flattenComments(logic.comments, maxDepth);
	let rows = $derived(buildRows());

	function updateRow(key: string, next: CommentTreeItem) {
		rows = patchCommentRow(rows, key, next, buildRows);
	}

	/** Оценка или закладка: меняем узел и только его строку, а не пересобираем весь список */
	function patchRow(key: string, update: CommentUpdate) {
		const next = logic.patchComment(key, update);
		if (next) updateRow(key, next);
	}

	/** Строки без свёрнутых веток: строка скрыта, если свёрнут кто-то из её предков */
	let shown = $derived(collapsed.size ? rows.filter((row) => !row.owners.some((o) => collapsed.has(o))) : rows);
	/** В DOM только строки около экрана (решение 0015); строка с открытым редактором остаётся */
	const virtual = new VirtualRows(() => shown, () => replyTo);

	const focus = bindCommentsView({
		logic,
		virtual,
		collapsed,
		getPost: () => ({ postId, sourceId }),
		getFocus: () => ({ commentId: focusCommentId, nonce: focusNonce, active }),
		hasRow: (key) => rows.some((row) => row.key === key),
		onPatchRow: updateRow,
		onFocused: () => onfocused?.(),
		onCountChange: (delta) => onCountChange?.(delta),
		onReconnect: () => onReconnect?.(),
		onRefreshReady: (fn) => onRefreshReady?.(fn)
	});

	let replyTo = $state<string | null>(null);
	/** Редактор под комментарием правит его, а не отвечает */
	let editMode = $state(false);
	let draft = $state('');
	let media = $state<CommentMedia[]>([]);
	let donation = $state(0);
	let paymentLink = $state('');
	/** Автор целевого комментария принимает донаты */
	let canDonate = $derived(!editMode && !!replyTo && !!(logic.allCommentsMap.get(replyTo)?.author.isDonationsEnabled));
	let mentionCandidates = $derived(replyTo ? collectThreadMentionAuthors(logic.pathTo(replyTo), currentUser.value?.id) : []);
	/** Подписка на новые комментарии поста (колокольчик): начальное состояние берём из поста */
	// svelte-ignore state_referenced_locally
	let subscribedToComments = $state(subscribed);
	let subscriptionPending = false;
	let sending = $state(false);
	let sendError = $state('');
	let sortingOpen = $state(false);
	/** Подсветка ветки: линия line у подряд идущих комментариев from..to */
	let highlight = $state<{ line: number; from: number; to: number } | null>(null);

	let title = $derived(
		commentsCount > 0 ? `${formatNumber(commentsCount)} ${plural(commentsCount, ['комментарий', 'комментария', 'комментариев'])}` : 'Комментарии'
	);

	function setSorting(value: string) {
		if (value === logic.sorting) return;
		logic.sorting = value;
		collapsed.clear();
		logic.loadComments(true);
	}

	function reply(key: string) {
		if (blocked) return;
		if (editMode) clearDraft();
		replyTo = key;
		editMode = false;
		donation = 0;
		sendError = '';
	}

	function clearDraft() {
		draft = '';
		media = [];
		donation = 0;
	}

	function edit(key: string, content: string, attached: CommentMedia[] = []) {
		replyTo = key;
		editMode = true;
		draft = content;
		media = [...attached];
		sendError = '';
	}

	function cancel() {
		if (editMode) clearDraft();
		replyTo = null;
		editMode = false;
		sendError = '';
	}

	/** Новый комментарий, ответ или правка; после отправки показываем результат */
	async function submit() {
		const text = draft.trim();
		if ((!text && media.length === 0) || sending || sourceId !== 'dtf' || (blocked && !editMode) || !ensureLogin()) return;

		sending = true;
		sendError = '';
		paymentLink = '';
		try {
			const target = replyTo ? logic.allCommentsMap.get(replyTo) : undefined;
			let key = replyTo ?? '';
			if (editMode) {
				// Правка без найденного комментария не должна превращаться в новый корневой
				if (!target) throw new Error('Не удалось найти комментарий для правки');
				logic.updateComment(await api.editComment(target.id, postId, text, media));
			} else if (donation > 0) {
				// С донатом комментарий появится после оплаты, поэтому в список его не вставляем
				paymentLink = await api.createDonation(postId, text, target?.id, media, donation);
				clearDraft();
				replyTo = null;
				return;
			} else {
				const created = await api.addComment(postId, text, target?.id, media);
				logic.addComment(created);
				key = commentKey(created);
			}
			clearDraft();
			replyTo = null;
			editMode = false;
			virtual.focus(key, { block: 'nearest', highlight: false });
		} catch (e) {
			sendError = (e as Error).message;
		} finally {
			sending = false;
		}
	}

	async function toggleCommentsSubscription() {
		if (subscriptionPending || sourceId !== 'dtf' || !ensureLogin()) return;
		subscriptionPending = true;

		const was = subscribedToComments;
		subscribedToComments = !was;
		try {
			await api.setCommentsSubscription(postId, !was);
		} catch (e) {
			subscribedToComments = was;
			notify.error((e as Error).message);
		} finally {
			subscriptionPending = false;
		}
	}

	function highlightBranch(index: number, line: number | null) {
		if (line === null) {
			highlight = null;
			return;
		}
		// Ветка тянется вверх и вниз, пока у соседних комментариев есть линия с тем же номером
		let from = index;
		let to = index;
		while (from > 0 && shown[from - 1].lines.length > line) from--;
		while (to < shown.length - 1 && shown[to + 1].lines.length > line) to++;
		highlight = { line, from, to };
	}

	let listEl = $state<HTMLElement>();

	function collapseBranch(owner: string) {
		highlight = null;
		// Родитель ветки целиком выше экрана или уже вне окна строк: сразу к нему, анимировать там нечего
		const node = listEl?.children.namedItem(`comment-${owner}`) as HTMLElement | null;
		if (!node || node.getBoundingClientRect().bottom <= 0) {
			collapsed.add(owner);
			virtual.focus(owner, { highlight: false, behavior: 'instant' });
			return;
		}
		const hidden = new Set(virtual.items.filter((row) => row.owners.includes(owner)).map((row) => `comment-${row.key}`));
		reflow(listEl, () => {
			collapsed.add(owner);
		}, (row) => hidden.has(row.id));
	}

	/* Свайп влево по комментарию: ответ, а под ним по порядку — оценка или любимые реакции */
	type SwipeAction = { label: string; icon?: string; image?: string; run: (key: string) => void };
	// Комментарий из реактивного дерева, как у строки списка: в карте лежат копии, правка по ним не видна
	const withComment = (key: string, act: (comment: Comment, onpatch: (update: CommentUpdate) => void) => void) => {
		const comment = rows.find((row) => row.key === key)?.comment;
		if (comment) act(comment, (update) => patchRow(key, update));
	};
	let swipeActions = $derived.by((): SwipeAction[] => {
		const extra: SwipeAction[] =
			themeSettings.votes === 'reactions'
				? quickReactions().map((id) => ({ label: REACTIONS[id]?.name ?? '', image: REACTIONS[id]?.url, run: (key) => withComment(key, (c, p) => toggleCommentReaction(c, id, p)) }))
				: ([1, -1] as const).map((sign) => ({
						label: sign > 0 ? 'Плюс' : 'Минус',
						icon: themeSettings.votes === 'likes' ? (sign > 0 ? 'v_like' : 'v_dislike') : sign > 0 ? 'v_arrow_up' : 'v_arrow_down',
						run: (key) => withComment(key, (c, p) => voteComment(c, sign, p))
					}));
		return [{ label: 'Ответить', icon: 'v_reply', run: reply }, ...extra];
	});
	let swipeView = $state<SwipeView | null>(null);
	let swipeLayer = $state<HTMLElement>();
	const swipeComment = commentSwipe({
		// Свайп открывает ответ, а при запрете писать он не нужен
		enabled: () => !blocked,
		// Кнопка «Ответить» есть только у обычного комментария: у удалённого и скрытого фильтром свайпа нет
		keyOf: (item) => (item.querySelector(':scope > .comment-item__content > .comment-item__action') ? item.id.replace('comment-', '') : undefined),
		count: () => swipeActions.length,
		column: () => swipeLayer,
		show: (view) => (swipeView = view),
		run: (key, slot) => swipeActions[slot]?.run(key)
	});

	// Сброс горизонтального смещения и ширины при переключении режима
	$effect(() => {
		if (!isAutopan && logic.viewportElement) {
			const listEl = logic.viewportElement.querySelector('.comments-list') as HTMLElement | null;
			if (listEl) listEl.style.transform = '';
			logic.viewportElement.style.removeProperty('--comment-main-width');
		}
	});
</script>

{#snippet editor(continueBranch = false)}
	<div class="comment-reply" transition:slide={{ duration: reducedMotion() ? 0 : 260, easing: cubicOut }}>
		<CommentEditor bind:text={draft} bind:media bind:donation {paymentLink} {canDonate} replying editing={editMode} {sending} error={sendError} {continueBranch} {sourceId} {mentionCandidates} oncancel={cancel} onsubmit={submit} />
	</div>
{/snippet}

<section class={['comments-section', { autopan: isAutopan }]} id="comments" aria-label="Комментарии">
	<div class="comments-wrapper">
		<div class="comments-header">
			<h2 class="comments-header__title">{title}</h2>

			<div class="comments-header__actions">
				<Popover bind:open={sortingOpen} items={sortings} selected={logic.sorting} onselect={setSorting} label="Сортировка комментариев">
					<button
						type="button"
						class="comments-header__action"
						aria-label="Сортировка"
						aria-expanded={sortingOpen}
						onclick={() => (sortingOpen = !sortingOpen)}
					>
						<svg class="icon" width="20" height="20" aria-hidden="true">
							<use href="#v_block_set"></use>
						</svg>
					</button>
				</Popover>
				<button
					type="button"
					class={['comments-header__action comments-header__action--bell', { 'comments-header__action--active': subscribedToComments }]}
					title={subscribedToComments ? 'Отписаться от комментариев' : 'Подписаться на комментарии'}
					aria-pressed={subscribedToComments}
					onclick={toggleCommentsSubscription}
				>
					<svg class="icon" width="20" height="20" aria-hidden="true">
						<use href="#{subscribedToComments ? 'bell_solid' : 'v_bell'}"></use>
					</svg>
				</button>
			</div>
		</div>

		<div class="comments-reply-area">
			{#if blocked && !editMode}
				<CommentRestriction text={commentEditor?.text} />
			{:else if replyTo}
				<button type="button" class="comment-fake-form" onclick={cancel}>
					<span class="comment-fake-form__text">Написать комментарий...</span>
					<span class="comment-fake-form__buttons" aria-hidden="true">
						<span class="comment-fake-form__button">
							<svg class="icon" width="20" height="20"><use href="#v_image"></use></svg>
						</span>
						<span class="comment-fake-form__button comment-fake-form__button--gif">
							<svg class="icon" width="20" height="20"><use href="#v_gif"></use></svg>
						</span>
						<span class="comment-fake-form__button">
							<svg class="icon" width="20" height="20"><use href="#v_rouble"></use></svg>
						</span>
					</span>
				</button>
			{:else}
				<CommentEditor bind:text={draft} bind:media bind:donation {paymentLink} {canDonate} {sending} error={sendError} {sourceId} onsubmit={submit} />
			{/if}
		</div>

		<CommentFocusBanner {focus} />

		{#if logic.comments.length === 0 && logic.loading}
			<div class="comments-status"><Preloader /></div>
		{:else if logic.comments.length === 0 && !logic.error && focus.status !== 'waiting'}
			<p class="comments-status">Комментариев пока нет</p>
		{/if}

		<div class="comments-viewport" bind:this={logic.viewportElement}>
			<div
				class={['comments-list', { 'comments-list--swipe': activeTheme.gestures }]}
				style:--rows-above="{virtual.padTop}px"
				style:--rows-below="{virtual.padBottom}px"
				bind:this={listEl}
				{@attach virtual.attach}
				{@attach swipeComment}
			>
				{#each virtual.items as row, i (row.key)}
					{@const index = virtual.start + i}
					<CommentItem
						{row}
						{postAuthorId}
						highlightedLine={highlight && index >= highlight.from && index <= highlight.to ? highlight.line : -1}
						replying={replyTo === row.key}
						canReply={!blocked}
						hiddenReplies={collapsed.has(row.key) && row.comment.children.length > 0 ? (row.comment._totalReplies ?? row.comment.children.length) : 0}
						panObserver={isAutopan ? logic.engine.panObserver : undefined}
						onreply={() => reply(row.key)}
						onedit={() => edit(row.key, row.comment.content, row.comment.media)}
						onlinehover={(line) => highlightBranch(index, line)}
						onlineclick={collapseBranch}
						onexpand={() =>
							reflow(listEl, () => {
								collapsed.delete(row.key);
							})}
						onparent={(key) => virtual.focus(key)}
						measure={virtual.measure}
						onpatch={(update) => patchRow(row.key, update)}
						{editor}
					/>
				{/each}
			</div>
			{#if activeTheme.gestures}
				<div class="comment-swipe" bind:this={swipeLayer} aria-hidden="true">
					{#if swipeView}
						{@const view = swipeView}
						{@const drum = themeSettings.swipeColumn === 'drum'}
						{#snippet layer(icons: boolean)}
							{#each swipeActions as action, slot}
								{@const d = slot - view.slot}
								<span
									class={[
										'comment-swipe__action',
										icons ? 'comment-swipe__action--icon' : 'comment-swipe__action--bg',
										{
											'comment-swipe__action--extra': slot > 0,
											'comment-swipe__action--current': drum && d === 0,
											'comment-swipe__action--far': Math.abs(d) > 1,
											'comment-swipe__action--selected': view.armed && d === 0
										}
									]}
									style:--slot={slot}
									style:--d={d}
									title={icons ? action.label : undefined}
								>
									{#if icons && action.image}
										<img src={action.image} width="24" height="24" alt="" />
									{:else if icons}
										<svg class="icon" width="20" height="20"><use href="#{action.icon}"></use></svg>
									{/if}
								</span>
							{/each}
						{/snippet}
						<div
							class={['comment-swipe__column', drum ? 'comment-swipe__column--drum' : 'comment-swipe__column--list', { 'comment-swipe__column--armed': view.armed }]}
							style:--sel={view.slot}
						>
							{@render layer(false)}
							<span class="comment-swipe__selection"></span>
							{@render layer(true)}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if logic.error}
			<p class="comments-status comments-status--error">{logic.error}</p>
		{/if}

		<div class="comments-more" bind:this={logic.observerElement}>
			{#if logic.loading && logic.comments.length > 0}
				<Preloader />
			{/if}
		</div>
	</div>
</section>

<style>
	.comments-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		max-width: 1020px;
		margin: 28px auto 0;
		padding: 32px 0;
		background-color: var(--bg-card);
		scroll-margin-top: calc(var(--header-height, 60px) + 8px);
	}

	.comments-wrapper {
		width: 100%;
		margin-left: auto;
		margin-right: auto;
	}

	.comments-viewport {
		position: relative;
		width: 100%;
	}

	.comments-list::before,
	.comments-list::after {
		content: '';
		display: block;
		overflow-anchor: none;
	}

	.comments-list::before {
		height: var(--rows-above);
	}

	.comments-list::after {
		height: var(--rows-below);
	}

	/* Горизонтальный жест по комментарию — свайп ответа (влево) или «назад» (вправо), вертикальный остаётся прокрутке */
	.comments-list--swipe {
		touch-action: pan-y pinch-zoom;
	}

	/* Колонка действий свайпа: выезжает справа вслед за пальцем (--swipe от 0 до 1), ответ — на высоте пальца, остальные под ним */
	.comment-swipe {
		position: absolute;
		inset: 0;
		z-index: 21;
		pointer-events: none;
	}

	.comment-swipe__column {
		/* Кривая Material 3 (emphasized decelerate): резкий старт, короткая посадка — перескок жёсткий, без «плавания» */
		--emphasized: cubic-bezier(0.05, 0.7, 0.1, 1);
		position: absolute;
		top: var(--swipe-y, 0);
		right: 8px;
		width: 36px;
		opacity: var(--swipe, 0);
		transform: translateX(calc((1 - var(--swipe, 0)) * 24px)) scale(calc(0.6 + 0.4 * var(--swipe, 0)));
	}

	/*
	 * Кнопка из двух слоёв: под выделением — круг, над ним — значок. Выделение — отдельный круг между слоями:
	 * оно чуть тянется за пальцем (`--nudge`), а на соседнее действие перескакивает с кривой Material
	 */
	.comment-swipe__action {
		position: absolute;
		top: calc(var(--slot) * 44px - 18px);
		left: 0;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		color: var(--text-secondary);
		transition:
			opacity 0.18s,
			transform 0.22s var(--emphasized),
			color 0.2s;
	}

	.comment-swipe__action--bg {
		background: var(--bg-secondary);
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.12);
	}

	.comment-swipe__action--icon.comment-swipe__action--selected {
		color: var(--text-on-accent, #fff);
	}

	.comment-swipe__selection {
		position: absolute;
		top: -18px;
		left: 0;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--color-blue);
		opacity: 0;
		transform: translateY(calc(var(--sel) * 44px)) scale(0.6);
		translate: 0 var(--nudge, 0px);
		transition:
			opacity 0.15s,
			transform 0.22s var(--emphasized);
	}

	/* Подтяжка идёт за пальцем без задержки, а когда палец перешёл на другое действие, снимается той же кривой, что и перескок */
	.comment-swipe:global([data-snap]) :is(.comment-swipe__selection, .comment-swipe__action) {
		transition-property: opacity, transform, translate, color;
		transition-duration: 0.15s, 0.22s, 0.22s, 0.2s;
		transition-timing-function: ease, var(--emphasized), var(--emphasized), ease;
	}

	.comment-swipe__column--armed .comment-swipe__selection {
		opacity: 1;
		transform: translateY(calc(var(--sel) * 44px)) scale(1.15);
	}

	/* Остальные действия показываются, когда ответ готов: палец может уйти к ним вниз */
	.comment-swipe__column--list:not(.comment-swipe__column--armed) .comment-swipe__action--extra {
		opacity: 0;
		transform: scale(0.6);
	}

	/* Барабан, как в Telegram X: выбранное действие крупно на высоте порога, соседи уменьшены сверху и снизу.
	   Выделение стоит в центре, а за пальцем чуть тянется сам барабан */
	.comment-swipe__column--drum .comment-swipe__action {
		top: -18px;
		transform: translateY(calc(var(--d) * 42px)) scale(0.8);
		translate: 0 calc(-1 * var(--nudge, 0px));
	}

	.comment-swipe__column--drum .comment-swipe__action--current {
		transform: scale(1.3);
	}

	.comment-swipe__column--drum .comment-swipe__selection,
	.comment-swipe__column--drum.comment-swipe__column--armed .comment-swipe__selection {
		translate: none;
		transform: scale(1.3);
	}

	.comment-swipe__column--drum .comment-swipe__action--far,
	.comment-swipe__column--drum:not(.comment-swipe__column--armed) .comment-swipe__action:not(.comment-swipe__action--current) {
		opacity: 0;
		transform: translateY(calc(var(--d) * 32px)) scale(0.5);
	}

	.comment-swipe__column--drum:not(.comment-swipe__column--armed) .comment-swipe__selection {
		transform: scale(0.8);
	}

	/* Обёртка ответа под комментарием: строка целиком, растёт по высоте при открытии */
	.comment-reply {
		flex: 1 0 100%;
		min-width: 0;
	}

	.comment-swipe__action img {
		object-fit: contain;
	}

	.comments-section.autopan .comments-viewport {
		overflow: hidden;
		mask-image: linear-gradient(to right, black calc(100% - 32px), transparent 100%);
	}

	.comments-section.autopan .comments-list {
		width: max-content;
		min-width: 100%;
		padding-right: 32px;
		will-change: transform;
	}

	/* Шапка */
	.comments-header {
		display: flex;
		align-items: center;
		margin-top: 2px;
		margin-bottom: 14px;
	}

	.comments-header__title {
		margin-right: auto;
		font-size: 20px;
		line-height: 1.4em;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.comments-header__actions {
		display: grid;
		grid-auto-flow: column;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
		margin-right: 18px;
	}

	.comments-header__action {
		color: inherit;
		cursor: pointer;
		user-select: none;
	}

	.comments-header__action .icon {
		display: block;
	}

	.comments-header__action--active {
		color: var(--color-blue);
	}

	.comments-header__action--bell .icon {
		transform-origin: 50% 0;
		transition: transform 0.26s cubic-bezier(0.175, 0.885, 0.32, 1.5);
	}

	/* Форма комментария */
	.comments-reply-area {
		margin-top: 28px;
		margin-bottom: 10px;
	}

	.comment-fake-form {
		position: relative;
		z-index: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		height: 48px;
		padding: 0 17px 0 15px;
		border: 1px solid var(--border-input);
		border-radius: 10px;
		background-color: var(--bg-tertiary);
		color: inherit;
		font: inherit;
		text-align: inherit;
		cursor: pointer;
	}

	.comment-fake-form__text {
		color: var(--text-subtle);
		line-height: 1.5em;
	}

	.comment-fake-form__buttons {
		display: flex;
		align-items: center;
	}

	.comment-fake-form__button:not(:last-child) {
		margin-right: 14px;
	}

	.comment-fake-form__button .icon {
		display: block;
	}

	/* Статусы */
	.comments-status {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 35vh;
		padding: 24px 0;
		color: var(--text-muted);
	}

	.comments-status--error {
		color: var(--color-negative);
	}

	.comments-more {
		display: flex;
		justify-content: center;
		min-height: 24px;
		padding-top: 16px;
	}

	@media (min-width: 640px) {
		.comments-section {
			border-radius: 8px;
		}

		.comments-wrapper {
			max-width: min(var(--inner-content-width), calc(100% - 2 * var(--text-gap, 0px)));
		}
	}

	@media (min-width: 720px) {
		.comment-fake-form__button--gif {
			display: none;
		}
	}

	@media (max-width: 859px) {
		.comments-section {
			margin-top: 20px;
			padding: 20px 0;
		}

		.comments-header {
			margin-top: 0;
			margin-bottom: 2px;
		}

		.comments-header__actions {
			margin-right: 0;
		}

		.comments-reply-area {
			margin-top: 20px;
			margin-bottom: 6px;
		}
	}

	@media (max-width: 639px) {
		.comments-wrapper {
			padding-left: 16px;
			padding-right: 16px;
		}
	}
</style>
