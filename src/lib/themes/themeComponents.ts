import type { Component } from 'svelte';

// Вынесено в отдельный динамический модуль, чтобы SvelteKit не добавлял CSS
// всех ~40 компонентов обеих тем в <head> каждой страницы (dynamic_import_depth = 2)
export const themeComponentModules = import.meta.glob<{ default: Component<any> }>('./*/*.svelte');
