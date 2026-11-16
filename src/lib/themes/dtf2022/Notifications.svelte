<script lang="ts">
	import NotificationsPanel from './NotificationsPanel.svelte';

	let { active = true }: { active?: boolean } = $props();
</script>

<div class="notifications-page">
	<NotificationsPanel page {active} />
</div>

<style>
	/* Колонка растягивается на всю высоту контента между сайдбарами */
	.notifications-page {
		width: 100%;
		max-width: var(--content-width);
		flex-grow: 1;
		background: var(--bg-card);
		color: var(--text-primary);
	}
</style>
