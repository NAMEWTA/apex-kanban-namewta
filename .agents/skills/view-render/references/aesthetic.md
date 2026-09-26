# Visual scale and libraries

A rendered leaf looks like the rest of Obsidian. It uses the app's CSS variables and the 4px sizes Obsidian already publishes. It does not bring a second design system.

Touch targets, focus rings, `!important`, and `:has` stay in `../dev/references/obsidian-api.md`. Class prefixes stay in that skill's architecture reference: use the prefix the product already has. This file owns the leaf scale and the library list. The directories for the files are the tree in `../SKILL.md`.

## Tokens

| Use | Value |
|---|---|
| Card or item background | `var(--background-primary)` |
| Column background | `var(--background-secondary)` |
| Border | `1px solid var(--background-modifier-border)` |
| Body / secondary / icon | `var(--text-normal)` / `var(--text-muted)` / `var(--text-faint)` |
| Selection, drop target, primary button | `var(--interactive-accent)` and `var(--text-on-accent)` |
| Spacing | `var(--size-4-1)` (4px), `var(--size-4-2)` (8px), `var(--size-4-4)` (16px) |
| Column width | `272px` |
| Card type size | `0.875rem` |
| Column radius | `6px` |
| Input radius | `var(--input-radius)` or `var(--radius-s)` |
| Lifted card | `var(--shadow-s)` plus a 2px `var(--interactive-accent)` outline |

Color transitions are about `100ms`. An empty column is a faint dashed border, `rgba(var(--text-muted-rgb), 0.1)`, not an illustration. A drop target tints the column with `hsla(var(--interactive-accent-hsl), 0.15)` and uses the accent as its border.

Do not write hex colors. A product's own theme tokens stay where `../dev/references/obsidian-api.md` puts them.

## Density

Columns scroll inside the leaf; the leaf's `.view-content` padding is zero when the surface manages its own inset. Header chrome is one row of icon buttons. On a phone, do not keep that row: put the actions on the pane menu, and pad the bottom by the mobile navbar height the view measures. Tags reuse Obsidian's tag variables (`--tag-background`, `--tag-color`) when those exist.

## Libraries

| Allowed | When |
|---|---|
| `preact`, `preact/compat` | The first rendered leaf, in that same change |
| `@tanstack/react-table` | A task that adds a real table view, and only if it runs on Preact |
| Pointer events on `view.contentEl.doc` | Dragging inside one window |

Refused, even if a tutorial suggests them: `react` 19, `react-dom` 19, MUI, Chakra, Ant Design, shadcn, Tailwind, Bootstrap, styled-components, Emotion, Excalidraw, roughjs, dnd-kit, react-beautiful-dnd, choices.js, flatpickr, react-colorful.

Color, date, and select controls in a form use Obsidian's `Setting`, suggesters, and `setIcon`. A drag interaction that pointer events cannot express is a reason to stop and say so, not a reason to add a drag library.

If a package renders on Preact and then breaks, leave the rest of the plugin on Preact. Replace that one package with DOM, or isolate it. Do not switch the plugin to React 19 to make one package happy.
