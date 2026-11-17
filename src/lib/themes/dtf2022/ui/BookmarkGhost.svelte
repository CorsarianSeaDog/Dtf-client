<script lang="ts">
	/*
	 * «Призрак» иконки закладки, как .bookmark__ghost у DTF (chunk.bookmark.vue): при добавлении в закладки поверх иконки
	 * вспыхивает её копия, вырастает в 2,5 раза и тает за 700 мс. Кладётся рядом с иконкой в контейнер, который центрирует её флексом.
	 */
	let { size, onend }: { size: number; onend: () => void } = $props();
</script>

<svg class="icon bookmark-ghost" width={size} height={size} aria-hidden="true" onanimationend={onend}>
	<use href="#v_bookmark_solid"></use>
</svg>

<style>
	.bookmark-ghost {
		position: absolute;
		z-index: 2;
		opacity: 0;
		pointer-events: none;
		animation: bookmark-ghost 700ms cubic-bezier(0.19, 1, 0.22, 1) forwards;
	}

	@keyframes bookmark-ghost {
		from {
			transform: scale(1);
			opacity: 1;
		}

		to {
			transform: scale(2.5);
			opacity: 0;
		}
	}
</style>
