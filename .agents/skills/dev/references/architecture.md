# Architecture

Read this before moving files, adding a product, adding a command, adding UI copy, naming a new file, or changing settings pages. Frozen strings live in the SKILL.md identity table. Import prohibitions live in SKILL rules 2 and 3.

## Products

One plugin process, several products. The shell at the entry in the SKILL identity table registers views and long-lived services. It does not own domain logic.

| Product | Root | What the shell imports |
|---|---|---|
| Dashboard | `src/dashboard-view` | Barrel exports `DashboardView`, `DASHBOARD_VIEW_TYPE`, `showModuleDisabled`. The shell also deep-imports services, the workspace registry, and settings modals |
| Editor | `src/editor-view` | Barrel exports `EditorView`, `EDITOR_VIEW_TYPE`, `createEditorHost`, `EditorHost`, `collectReferences` |
| Terminal | `src/terminal-agent` | Barrel exports `TerminalAgentController`, `TerminalView`, `TERMINAL_VIEW_TYPE`, `renderTerminalAgentSettings`, `readLegacyTerminalSettings` |
| Sync | `src/sync` | `export {}` plus `README.md`. No view type yet |

`src/dashboard-view/persist` writes the dashboard markdown. Leave the directory name `sync` free.

## Who may import whom

```
plugin shell and plugin/settings ──▶ product barrel or a deep path
product ──import type──▶ plugin/main.ts
product ──▶ shared
shared  ──▶ neither product nor plugin
product ──✕──▶ other product, including that product's barrel
```

The one existing break in the shared row is the file named in SKILL rule 2. Do not add a second one, and do not "fix" it by letting `editor-view` import `dashboard-view`.

`shared` may contain DTOs that more than one side must serialize (`EditorWorkbenchSettings`, `APEX_EVENTS`, `APEX_COMMANDS`). It must not contain comment threads, dashboard cards, or terminal sessions.

The plugin shell may pass a narrow callback into a product. The terminal host receives `readAbsoluteReference: () => collectReferences(app, 'absolute')` from `main.ts`. That callback is the boundary.

## Lifecycle on the plugin

Construct these in `onload` and tear them down in `onunload`. Do not hang them off `ItemView`.

| Object | When it exists |
|---|---|
| `editorHost` | While the editor module is on. Highlights and the reading post-processor survive closing the side panel |
| `musicService` | While the dashboard module is on, and never when `Platform.isPhone` |
| `habitService`, `expenseService`, `mediaTagService` | While the dashboard module is on. Loaded once for that stretch |
| `terminalHost` | While the terminal module is on and `Platform.isDesktopApp` |

`onunload` calls `terminalHost.onunload()`, then `editorHost.onunload()` (comment flush, then dispose), then `teardownBasenameIndex`. If dashboard services were started, it then flushes and destroys media tags and destroys habit, expense, and music. Leaf teardown follows `references/obsidian-api.md`.

All three view types are registered on every platform. The terminal factory uses `terminalHost.createLeafView` when that host is active, and `InactiveTerminalView` otherwise. `applyModuleFlags` runs after registration. A missing `settings.modules` key stays on.

`EditorView.onClose` only runs `detachPanel`. `createEditorHost` registers extensions on the first `onload` (`booted`). A later module restart calls `onload` again on the same host and does not register them a second time.

## Dashboard folders

Add a feature to the folder that already owns that widget. `dataview/` renders query results for the in-repo language in `dql/`. Do not add the Dataview community plugin. Workspace paths are normalized by `src/dashboard-view/workspace/workspace-registry.ts`: no leading slash, no `.md` suffix.

| Folder | Owns |
|---|---|
| `appearance` | Theme studio and modal theme |
| `assets` | Bundled images and the gallery placeholder |
| `banner` | Banner and banner stats |
| `calendar` | Calendar widget, grid, daily notes, holidays |
| `data` | Fortune copy tables |
| `dataview` | Query result UI (tables, heatmaps) |
| `dql` | The in-repo query language |
| `expense` | Expense ledger |
| `habit` | Habit check-in |
| `library` | Library cards, folder config, new notes |
| `media` | Gallery, tags, lightbox |
| `music` | NetEase player |
| `notes` | Memos, quick notes, quick actions |
| `parser` | Board markdown parse and the default document |
| `persist` | Markdown write-back |
| `pomodoro` | Pomodoro timer |
| `reading` | Reading timer and books |
| `renderer` | Dashboard DOM render and refresh |
| `types` | `DashboardSettings` and the board model |
| `ui` | Shared modals, drag-and-drop, dialogs |
| `view` | The `DashboardView` leaf |
| `web` | Web section |
| `weread` | WeRead shelf |
| `widgets` | Album, anniversary, countdown, fortune, lunar, tracker, weather, year progress |
| `workspace` | Multi-file dashboard registry |

Editor folders: `comments`, `copy`, `host`, `view`. `writing-stats` and `focus` are the placeholders named in SKILL rule 12. A new domain implements `EditorDomain` from `src/editor-view/host/registry.ts`, adds an i18n title, and is placed in the `domains` array inside `createEditorHost`. Add a settings option only when the task asks for a user-facing toggle.

## Commands

| Kind | Home |
|---|---|
| Ids another product must spell | `APEX_COMMANDS` in `src/shared/commands.ts`. Today: `open-dashboard`, `open-editor-view`, `add-comment-to-selection` |
| Shell commands | `src/plugin/commands.ts`. Commands already passed to `addCommand` inside `main.ts` stay there |
| Editor commands | The owning domain under `src/editor-view` |
| Terminal commands | Inside `src/terminal-agent` |

Registration details that apply to every command are SKILL rule 9.

## Settings

`DashboardSettingTab` is the only settings tab. Page ids come from `src/plugin/settings/nav.ts`:

| Product | Side pages | Default |
|---|---|---|
| `home` | none. Toggles dashboard, editor, and terminal. Sync is a label here, not a toggle | `home` |
| `dashboard` | `general`, `widgets`, `coffee` | `general` |
| `editor` | `comments`, `copy` | `comments` |
| `terminal` | `shell`, `instance`, `workflows`, `appearance`, `behavior`, `connection`, `visibility`, `agents` | `shell` |
| `sync` | none. One placeholder row from `renderSyncSettings` | `sync` |

The side list is vertical. `coffee` is the about screen; the page id stays `coffee`. How a row is rendered in both the declarative list and the fallback is `references/obsidian-api.md`. Editor highlight and popover toggles call `editorHost.notifySettingsChanged()`. The default domain dropdown calls `notifyLayoutChanged()`.

## i18n

SKILL rule 8 is where strings live. To add a key:

1. Extend the module under `src/shared/i18n/` that already owns that feature. The object is `{ en: {...}, zh: {...} }`. `section-37.ts`, `section-38.ts`, `section-41.ts`, and `section-42.ts` in that directory are legacy buckets: add a key there only when the surrounding keys already live in that file.
2. If the module is new, import it in `src/shared/i18n/runtime.ts` and pass both `.en` and `.zh` to `mergeDicts`.
3. Terminal UI calls `t` from `src/terminal-agent/i18n.ts` with the key minus the prefix in SKILL rule 8. The wrapper adds the prefix. Do not store a string table in that wrapper.

`setLanguage` follows `settings.language`. Do not read Obsidian's locale. English casing is the UI text rule in `references/obsidian-api.md`.

## Names

New directories and source files use kebab-case (`library-new-note.ts`, `terminal-agent/`). A class is PascalCase. A module-level constant that other files import as a view type or command list is `SCREAMING_SNAKE`. Functions and locals are camelCase.

| Kind | Shape | Leave alone |
|---|---|---|
| Product root | `dashboard-view`, `editor-view`, `terminal-agent`, `plugin`, `shared`, `sync` | Do not fold these into one tree |
| New dashboard CSS | `dashboard-…` | `apex-dashboard-*` and `apex-dashboard.*` already shipped |
| Editor CSS | `apex-editor-…` | The frozen view type string |
| New terminal CSS | `terminal-…` | Existing `termy-…` classes |
| i18n file | kebab-case, one feature per module under `src/shared/i18n/` | Legacy `section-NN.ts` buckets |
| i18n key | dotted, both languages in that module | A key another product already stores |
| Command id | SKILL rule 9 | Ids already registered |

A rename that touches the next table, a view type, or a CSS class a theme already uses is a data migration, not a cleanup.

## Data that must not be casually renamed

| Data | Location | Rule |
|---|---|---|
| Plugin settings | `data.json` via `loadData` / `saveData` | Includes `editorWorkbench`. Normalization order is SKILL rule 10. Never store comment text here |
| Comment threads | vault `.apex-editor/comments/` | `references/editor-comments.md` |
| Weread progress | `.obsidian/plugins/<manifest.id>/weread-progress.json` | `manifestId()` reads `plugins.nand.manifest.id` and otherwise uses the plugin id |
| Habits, expense, pomodoro, reading | `habits.json`, `expense.json`, `pomodoro.json`, `reading.json` under `plugins/<manifest.id>/` | Header comments in the habit and expense services still say `plugins/apex-dashboard`. The path expression uses `manifest.id`. Do not aim new files at `apex-dashboard` |
| CSS classes, localStorage keys | `apex-dashboard-*`, `apex-dashboard.*` | Users and themes already depend on these names |
| Dashboard markdown | the user's dashboard note | Written only by `dashboard-view/persist` |
| Workspace paths | settings, via `workspace-registry` | No leading `/`, no `.md` suffix |

## TypeScript

`strictNullChecks`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `useUnknownInCatchVariables`. Index access can be `undefined`. `no-floating-promises` and `no-unnecessary-type-assertion` are errors; prefix a deliberate fire-and-forget with `void`. Prefer `import type` for the plugin class from a product. `@codemirror/state` and `@codemirror/view` are direct dependencies; bundling them is covered in `references/build-and-release.md`.

## What not to do

- Do not merge products back into one `src/<domain>` tree.
- Do not register a view under a new type to "version" it.
- Do not start the terminal, or import `electron`, on the phone path.
- Do not put product domain logic in `src/plugin` beyond shell, commands, and settings composition.
