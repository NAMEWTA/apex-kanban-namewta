# Obsidian API rules, as applied here

Adapted from the skill named in SKILL.md `metadata.adapted-from` and from `eslint-plugin-obsidianmd` `recommended`, which this repo enables in `eslint.config.mts`.

Production `src/**/*.ts` is linted. The ignore list is in `references/build-and-release.md`. Errors fail CI. Warnings do not. Pre-existing unused imports are not a license to add more.

Generic guides that delete `display()` once `minAppVersion` is 1.13 or newer do not apply. This plugin's `minAppVersion` is the identity table in SKILL.md, which is older than 1.13, so the settings tab keeps both renderers described below.

## Memory and lifecycle

| Do | Don't |
|---|---|
| `this.registerEvent(app.vault.on / workspace.on / …)` | Subscribe and forget, or only `off()` in `onunload` if `registerEvent` can do it |
| `registerDomEvent` on the plugin or the owning `Component` | `addEventListener` now and `removeEventListener` later on `activeDocument` — focus may have moved, so you remove it from a different document |
| `registerInterval` for periodic work | A bare interval that survives plugin unload |
| Return views from the `registerView` factory | Store `ItemView` instances on the plugin. The window host in `view-render` is the exception, and unload clears it |
| Let Obsidian detach leaves | `detachLeavesOfType()` in `onunload` |

`activeDocument` and `activeWindow` follow focus. Capture the document in a local if setup and cleanup must hit the same one.

Long-lived services on the plugin are the lifecycle table in `references/architecture.md`. Views are not.

Popovers and modals that create DOM outside a component must remove that DOM in `destroy` / `onClose`. The comment popover is appended to `view.dom.ownerDocument.body` and removed in the CodeMirror plugin `destroy()`.

## Types

```ts
// Files and folders — instanceof, never a cast
const file = app.vault.getAbstractFileByPath(path);
if (file instanceof TFile) {
  // ...
}

// DOM nodes and UI events — instanceOf, because popouts have a different realm
if (node.instanceOf(Text)) {
  // ...
}
```

`instanceof HTMLElement` across windows is the bug `.instanceOf` exists to prevent. `TFile` / `TFolder` stay on `instanceof` (same realm as the app).

No `any`. No `var`. `unknown` plus a narrowing function is the pattern already used in the comment store (`asRecord`). Unpublished `app.commands` is typed in `src/shared/obsidian-internal.ts`. Use that interface.

## Files

| Situation | API |
|---|---|
| Edit the note the user is typing in | Editor API (`editor.replaceSelection`, CodeMirror). Not `Vault.modify` |
| Edit a note in the background | `Vault.process` |
| Delete | `FileManager.trashFile` |
| Look up a path | `Vault.getAbstractFileByPath` or `getFileByPath`. Not `getFiles().find` |
| User-supplied paths | `normalizePath` |
| Network | `requestUrl`. Not `fetch` |
| OS / form factor | `Platform.isPhone`, `Platform.isDesktopApp`, `Platform.isDesktop`. Not `navigator.userAgent` |
| Language | The plugin's own i18n. Do not read `localStorage.language` |

Plugin-folder paths use `manifest.id`. Persisted names that must stay are the data table in `references/architecture.md`.

Regex lookbehind is illegal here (iOS < 16.4). The plugin is not desktop-only. The identity table has `isDesktopOnly`.

## UI text, commands, settings

- Sentence case in English UI and in `t()` values. Proper nouns stay capitalized. Where the strings live is SKILL rule 8.
- Command id shape is SKILL rule 9. Register with `addCommand`.
- Settings headings use `Setting.setHeading()`, not a hand-built `<h2>`, and are not named "General", "Settings", or the display name.
- Keep every persisted field inside `plugin.settings`. `saveData` replaces the whole object.
- Implement a new setting in both `getSettingDefinitions()` and the fallback renderer. Tag the row with the product page so search and the pre-1.13 tab bar agree. Page ids are the settings table in `references/architecture.md`.
- Redraw with the tab's `refresh()` (`update()` when present, otherwise the fallback). Do not call `display()` to refresh declarative settings.
- From a settings callback, `activeDocument` is the settings window. To touch the main workspace, use `this.app.workspace.containerEl.ownerDocument`.

## DOM and CSS

- Build UI with `createEl` / `createDiv` / `createSpan` / `createSvg` on a parent `HTMLElement`. Do not `document.createElement`.
- Put styles in the one stylesheet named in the SKILL identity table. Do not inject `<style>` or `<link>`. Do not assign large style blobs from TypeScript when a class will do. Coordinates (comment popover `left` / `top`) are the exception.
- Use Obsidian variables (`var(--background-primary)`, `var(--text-normal)`, `var(--interactive-accent)`, `var(--size-4-2)`, …). Dashboard theme tokens (`--db-*`) are scoped to `.apex-dashboard-root[data-theme]`. Editor UI must not depend on those tokens; it must look right in the sidebar without the dashboard mounted.
- Scope selectors (`.apex-editor-view`, `.apex-comment-hl`, `.dashboard-…`). No bare `button { }` rules.
- Avoid `!important` and `:has`. Toggle a class from TypeScript instead.
- Icon-only buttons need an accessible name (`aria-label` or `setTooltip`). Interactive targets should be at least 44×44px on touch. Don't remove `:focus-visible` outlines.
- Keyboard: a control that clicks must also work with Enter / Space if it is not a native `button`.

## Timers and promises

`eslint-plugin-obsidianmd` wants `window.setTimeout` / `window.clearTimeout` (or `activeWindow`) rather than the bare Node timers.

In this repo the comment store types its handle as `number | null` because the DOM `window.setTimeout` signature returns `number`, while `ReturnType<typeof setTimeout>` is Node's `Timeout`. Keep that. The comment test polyfill is in `references/editor-comments.md`.

Every `Promise` is awaited, returned, or explicitly `void`ed. `workspace.revealLeaf` is a promise.

## Logging and platform modules

No `console.log` in `onload` / `onunload`. The terminal's `debugLog` / `errorLog` stay inside that product.

`electron` and other Node builtins are not imported from the dashboard or editor. The terminal already isolates them. A new Node import needs a `Platform.isDesktop` (or `isDesktopApp`) guard so the phone bundle does not crash.

## Manifest naming (already satisfied — don't regress)

Plugin id does not contain `obsidian` and does not end with `plugin`. Display name does not contain `Obsidian` or end with `Plugin`. Description does not say "This plugin" or "Obsidian", and it ends with punctuation.

`LICENSE` is GPL-3.0-only. Do not revert the copyright holder to Dynalist Inc.

## Accessibility bar

Match surrounding UI. New buttons and icon buttons are keyboard reachable, named, and visible on `:focus-visible`. Do not ship a click-only `div` when `button` works.

## Scanner / scorecard

This plugin is not submitted through a fresh sample-plugin checklist on every change. Still:

- Fix new eslint errors before pushing. CI runs the lint script in the SKILL.md finish gate.
- Warnings are public if the plugin is ever scored. Don't add `no-unused-vars` warnings.
- Releases already attest the zip (`actions/attest-build-provenance`). Leave that step in `release.yml`.
