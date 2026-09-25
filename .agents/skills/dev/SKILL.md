---
name: dev
description: >-
  Development rules for the NAND Obsidian plugin in this repository
  (plugin id nand). Use when editing the plugin shell, dashboard, editor
  comments, terminal agent, sync placeholder, shared modules, manifest,
  styles.css, main.js, settings, i18n, esbuild, eslint, or a GitHub release.
  Use when the user mentions NAND, nand, 看板, 仪表盘, 评论, 终端, 设置, 发版,
  or Obsidian 插件. Project rules override generic Obsidian plugin advice.
when-to-use: >-
  Editing src/, styles.css, manifest.json, main.js, esbuild.config.mjs,
  eslint.config.mts, package.json scripts, or .github/workflows in this
  repository. Also /dev. This skill is for this repository only.
license: GPL-3.0-only
metadata:
  version: "2.0.0"
  short-description: Plugin development rules
  adapted-from: https://github.com/gapmiss/obsidian-plugin-skill (MIT, skill version 1.11.0, eslint-plugin-obsidianmd v0.4.x)
---

# Plugin development

This skill is for this repository only. It adapts the Obsidian plugin rules named in `metadata.adapted-from`. When those rules disagree with this file, follow this file. Do not scaffold a new plugin. Do not rename the plugin id. Do not turn this repo into a web app.

## Read before editing

| Before you… | Open |
|---|---|
| Move files, add a product, add a command, add UI copy, or change settings pages | [references/architecture.md](references/architecture.md) |
| Call the Obsidian API, or edit settings UI, CSS, or DOM | [references/obsidian-api.md](references/obsidian-api.md) |
| Touch comments, highlights, or `.apex-editor/` | [references/editor-comments.md](references/editor-comments.md) |
| Build, test, bump a version, or release | [references/build-and-release.md](references/build-and-release.md) |
| Change the identity table, an import boundary, a settings product, the i18n home, a test entry, or the release path | [references/skill-maintenance.md](references/skill-maintenance.md) |

## Identity

| | |
|---|---|
| Display name | `NAND` |
| Plugin id | `nand` |
| View types (frozen) | `apex-dashboard-view`, `apex-editor-view`, `terminal-view` |
| `minAppVersion` | `1.8.7` |
| `isDesktopOnly` | `false` |
| Entry | `src/plugin/main.ts` → committed `main.js` |
| Styles | one `styles.css` at the repo root |

Pinned leaves store the view type string. Renaming one orphans user workspaces. Legacy `apex-dashboard` CSS classes and localStorage keys stay; the data table in `references/architecture.md` lists the other persisted names.

## Hard rules

1. Keep the view type strings in the identity table. Register all three on phones and when a module is off. A terminal leaf whose module is off shows `InactiveTerminalView`.
2. `dashboard-view`, `editor-view`, `terminal-agent`, and `sync` do not import each other. `shared` holds no comment threads, dashboard cards, or terminal sessions. `src/shared/exclude-folders-editor.ts` is the only shared file that imports the dashboard. Do not add another.
3. `plugin/main.ts` and `plugin/settings/` are the composition root and may deep-import a product. Leave those imports there. A product imports the plugin class with `import type` only. The terminal reaches editor data through the callback the shell passes in.
4. `src/sync` stays `export {}`. Dashboard markdown write-back stays in `dashboard-view/persist`.
5. Comments never rewrite the note. Bodies live in `.apex-editor/comments/`, not in `data.json` and not in the plugin folder.
6. Construct `TerminalAgentController` only when `Platform.isDesktopApp` and the terminal module is on. Skip music on phones. Destroy music when the dashboard module turns off.
7. Source files use relative imports. `tsconfig` `baseUrl` is `src`; that does not allow `dashboard-view/...` specifiers.
8. User-facing copy goes through `src/shared/i18n/`, with `en` and `zh` in the same module, both merged in `runtime.ts`. Terminal strings are keys prefixed `terminalAgent.` in `src/shared/i18n/terminal-agent.ts`. `src/terminal-agent/i18n.ts` only adds that prefix. Do not add a new `section-NN.ts`. A missing key is echoed by `t()`. Default language is `zh`.
9. Put a command id in `APEX_COMMANDS` only when another product must spell it. Register new shell commands in `src/plugin/commands.ts`. Leave the commands already inline in `main.ts` where they are. Leave terminal commands inside `terminal-agent`. Ids omit the plugin id. Names omit the word "command". No default hotkeys.
10. One `DashboardSettingTab`. Products and side pages come from `src/plugin/settings/nav.ts`. Keep `display()` / `renderFallback()` because `minAppVersion` is below 1.13. Normalize `editorWorkbench` in `loadSettings` after the `{...raw}` spread.
11. Register CodeMirror extensions and the reading post-processor once, inside `createEditorHost`. Closing the editor side panel only detaches panel DOM. Turning the editor module off flushes and disposes the comment store and does not unregister those extensions.
12. A new editor domain implements `EditorDomain`. `writing-stats` and `focus` stay placeholders unless the task names them.
13. Do the task you were asked to do. A bug fix does not restyle a widget. A comment change does not retile the dashboard.
14. If you change the identity table, an import boundary, a settings product, the i18n home, a test entry, or the release path, update the one skill file that owns that fact in the same change. The map is in `references/skill-maintenance.md`.

## Where code goes

```
src/plugin/            shell: main.ts, ribbon, commands, the one settings tab
src/dashboard-view/    workbench. persist/ is the markdown write-back engine
src/editor-view/       editor panel, comments, copy
src/terminal-agent/    desktop terminal
src/shared/            i18n, cross-product ids and events, shared DTOs
src/sync/              reserved. index.ts is `export {}`
```

Folder map, command homes, and settings pages are in `references/architecture.md`.

## Before you finish

Run `pnpm run build`, then `pnpm run lint`. When behavior changed, run the matching `pnpm run test:*` named in `references/build-and-release.md`. CI does not run those tests.

Version bumps and releases follow that same file.

## Checklist

- [ ] View type strings unchanged
- [ ] No new cross-product import
- [ ] Notes are not rewritten by comments
- [ ] New strings exist in both languages, in the i18n home from rule 8
- [ ] `pnpm run build` and `pnpm run lint` report no new errors
- [ ] `main.js` is rebuilt when source changed
- [ ] The matching `test:*` script was run when behavior changed
