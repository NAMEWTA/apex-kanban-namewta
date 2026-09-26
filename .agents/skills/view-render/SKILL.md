---
name: view-render
description: >-
  How to render any NAND product surface inside an Obsidian leaf with Preact,
  and where those files go. Use when adding or changing a rendered leaf, or
  when the user mentions 前端渲染, 视图渲染, React, Preact, 画布, 叶子,
  弹出窗口, or createRoot. Also /view-render. Settings, menus, notices, and
  the status bar stay on the dev skill. This skill is for this repository only.
when-to-use: >-
  A product draws its own interface inside a leaf. Also /view-render.
  Not for settings rows or native Obsidian chrome.
license: GPL-3.0-only
metadata:
  version: "1.1.0"
  short-description: Leaf rendering with Preact
---

# Leaf rendering

Use this skill when a product surface is drawn inside a leaf. The current products are not the scope of this skill. Any later product follows the same directories.

Settings rows, menus, notices, and the status bar stay on the `dev` skill and use `Setting` or `createEl`. Do not turn an existing DOM view into Preact unless the task asks for a rendered surface.

The `dev` skill still owns view-type strings, import boundaries, i18n, the build gate, and the list of products that exist today. This skill owns the render runtime, the leaf's visual scale, and the directories below.

## Where the files go

A rendered surface belongs to one product. The product root is `src/<product>/`, and `<product>` is kebab-case. Do not add `src/components` or `src/views`. Do not put a `.tsx` file in `src/plugin` or `src/shared`.

```
src/<product>/view/            leaf class: the ItemView. Open, close, window move
src/<product>/<paint>/         render components, when the leaf already imports a folder that paints it
src/<product>/<feature>/       a component that belongs to one feature of that product
src/<product>/view/*.tsx       render components when the product has no paint folder yet
src/plugin/main.ts             calls the product's mount and unmount only
src/plugin/settings/           Setting rows. Not next to the leaf components
styles.css                     the one file at the repo root
```

`<paint>` is the directory the leaf file already imports to draw itself. New components follow that import. If the leaf does not import a paint directory, the components go in `view/` beside the leaf class. A component that only one feature uses goes in that feature directory, not in `<paint>/`.

File names follow the naming table in the `dev` architecture reference. The class prefix is the one that product already uses; that reference owns the prefix list. Styles go in the root `styles.css`.

Products still do not import each other. That rule stays in `dev`. When a window host must live on the shell, `src/plugin/main.ts` calls a function the product exports. The components stay inside the product.

## Read before editing

| Before you… | Open |
|---|---|
| Mount, move, or unmount a rendered view | [references/runtime.md](references/runtime.md) |
| Pick a color, spacing, radius, or UI library | [references/aesthetic.md](references/aesthetic.md) |
| Touch DOM helpers, touch targets, or CSS bans | [../dev/references/obsidian-api.md](../dev/references/obsidian-api.md) |

## Procedure

1. Confirm the work is a leaf surface. A settings page, modal form, menu, notice, or status-bar item uses `Setting` and the `dev` skill.
2. Put each new file on the tree above before writing it.
3. Keep the source of truth in the product's existing state. A component reads that state and emits actions. Ephemeral UI, such as which row is being renamed, may live in component state.
4. Follow `references/runtime.md`. A surface that stays inside its pane renders into `contentEl`. A surface whose drag preview leaves the pane uses one Preact root per `Window` and portals into `contentEl`. Take the DOM window from the element (`win` / `doc`) or from the second argument of `window-open` / `window-close`. Do not capture `window` or `document` at module scope, and do not call `createRoot` from a component.
5. Keep a drag layer on that same window's root, not on the main window.
6. When the leaf moves, `onWindowMigrated` renders it again on the destination window. A window host unregisters the leaf from the old window first.
7. On plugin unload, unmount every root and remove a window host's node.
8. Render note markdown with Obsidian's markdown renderer, as a child of the view. Icons use `setIcon`.
9. Style only with the tokens in `references/aesthetic.md`.
10. Add `preact` in the same change that first renders a view, with the esbuild alias in `references/runtime.md`. Do not add a library that file refuses.

## Checklist

- [ ] New files sit on the directory tree in this file
- [ ] Settings and chrome still use `Setting` or `createEl`
- [ ] The root's document is the leaf's window, not a `window` captured at load
- [ ] Unload unmounts every root
- [ ] No hardcoded colors, and no library outside `references/aesthetic.md`
- [ ] `pnpm run build` and `pnpm run lint` still pass if source changed
