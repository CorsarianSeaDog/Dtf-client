/** Экран настроек грузится отдельным куском: при первом запуске он не нужен, поэтому его подтягивают заранее, пока приложение простаивает */
let loading: Promise<typeof import('../SettingsOverlay.svelte')> | undefined;

export const loadSettingsOverlay = () => (loading ??= import('../SettingsOverlay.svelte'));
