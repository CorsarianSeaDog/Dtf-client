const SPOTIFY = /^https:\/\/open\.spotify\.com\/(?:embed\/)?(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/;

/** Высота плеера по типу, как в коде вставки Spotify: трек и эпизод — компактный, остальное — с обложкой и списком */
export function spotifyHeight(src: string): number {
	return /\/embed\/(track|episode)\//.test(src) ? 152 : 352;
}

/** Адрес плеера из `box_data` блока: берём `src`, при его отсутствии `url`. Чужие хосты и мусор — null, чтобы в iframe не попал произвольный адрес */
export function spotifyEmbedSrc(box?: { src?: string; url?: string }): string | null {
	const m = SPOTIFY.exec(box?.src ?? box?.url ?? '');
	return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
}
