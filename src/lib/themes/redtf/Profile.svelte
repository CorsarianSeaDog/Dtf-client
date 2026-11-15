<script lang="ts">
	import type { ThemeComponents } from '../contract';
	import BaseProfile from '../dtf2022/Profile.svelte';
	import CommentCard from '../dtf2022/comments/CommentCard.svelte';

	let props: ThemeComponents['Profile'] = $props();
</script>

<BaseProfile {...props} commentCard={CommentCard} />
