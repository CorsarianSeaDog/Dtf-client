# Добавить настройку

Что куда: [architecture/settings.md](../architecture/settings.md).

## Настройка темы

Тема описывает поле в манифесте, остальное сделает экран настроек.

1. Откройте `src/lib/themes/<id>/theme.ts` и добавьте поле в `settings`:

   ```ts
   {
   	key: 'compactCards',          // ключ в сохранённых значениях
   	type: 'toggle',               // radio | select | toggle
   	title: 'Компактные карточки',
   	description: 'Меньше отступов в ленте',
   	default: false
   }
   ```

   Для `radio` и `select` добавьте `options: [{ value, title, description? }]`, а `default` должен быть одним из `value`.

   Для условного отображения поля можно указать `dependsOn: { key, value }` (зависимость от значения другой настройки), `device: 'mobile' | 'desktop'` (ограничение по раскладке экрана: смартфоны или десктопы) или `touch: true` (только устройства с сенсорным экраном, включая планшеты при десктопной ширине). Для настроек жестов выбирайте `touch: true`, а не `device: 'mobile'`.

   Пометку рядом с названием (жёлтый текст) ставит `note: EXPERIMENTAL` (константа из `themes/types.ts`). Она работает у любого поля и у отдельного варианта в `options`; снять её — удалить строку.

2. Читайте значение из кода темы через её модуль настроек. Если его ещё нет, создайте `themes/<id>/themeSettings.svelte.ts` по образцу `dtf2022`:

   ```ts
   import { activeThemeSettings } from '../settings.svelte';

   export const themeSettings = {
   	get compactCards(): boolean {
   		return activeThemeSettings().value.compactCards === true;
   	}
   };
   ```

3. В компоненте: `let compact = $derived(themeSettings.compactCards);`.

Всё. Значение появится на странице темы, сохранится в `redtf:theme:<id>` и будет у каждой темы своё. Новое поле не требует миграции: у тех, кто уже сохранял настройки, подставится значение по умолчанию.

Если вы меняете смысл существующего поля (были другие `value`), увеличьте `version` в `persistedState` в `themes/settings.svelte.ts` и при необходимости передайте функцию `migrate`, чтобы сохранить настройки пользователей.

## Общая настройка

1. Добавьте поле в `AppSettings` и значение по умолчанию в `storage/settings.svelte.ts`.
2. Для выбора из вариантов или переключателя опишите поле и добавьте его на нужную страницу в `components/settings/settingsConfig.ts` (и рендер через `FieldControl`, и поисковый индекс обновятся вместе). Если нужна нестандартная разметка (образец — `ProxySettings.svelte`) — добавьте новый пункт навигации в `settingsConfig.ts`, подключите компонент страницы в `components/settings/SettingsScreen.svelte` и используйте `SettingsGroup` с функциональной привязкой `input`:

   ```svelte
   <input type="checkbox" bind:checked={() => settings.value.collectStats, (v) => settings.patch({ collectStats: v })} />
   ```

3. Читайте через `settings.value.<поле>`.

Не пишите настройки в `$effect`: запись меняет состояние, от которого зависит рендер, и эффект может зациклиться. Пишите из обработчиков.

## Проверка

- Измените настройку, перезагрузите страницу: значение должно сохраниться.
- Переключите тему и вернитесь: значения не должны смешаться и потеряться.
- `npm test` и `npm run check`.
