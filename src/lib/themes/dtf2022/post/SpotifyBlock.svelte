<script lang="ts">
	import { spotifyHeight } from './spotify';

	/* Блок spotify: плеер Spotify без рамки, у него свой фон и скругление; высота зависит от типа (трек — компактный) */
	let { src }: { src: string } = $props();
</script>

<iframe {src} title="Spotify" height={spotifyHeight(src)} loading="lazy" allow="encrypted-media" allowfullscreen></iframe>

<style>
	iframe {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 14px;
	}
</style>
