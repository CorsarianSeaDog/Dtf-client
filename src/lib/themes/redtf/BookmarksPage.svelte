<script lang="ts">
	import type { ThemeComponents } from '../contract';
	import BaseBookmarksPage from '../dtf2022/BookmarksPage.svelte';
	import CommentCard from '../dtf2022/comments/CommentCard.svelte';

	let props: ThemeComponents['BookmarksPage'] = $props();
</script>

<BaseBookmarksPage {...props} commentCard={CommentCard} />
