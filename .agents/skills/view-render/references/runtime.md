# Render runtime

One Preact root per browser `Window`. The root portals each leaf into that leaf's `contentEl`. Popout windows do not share the main window's document.

This is the shape for a surface drawn inside a leaf, narrowed to the public API in `obsidian.d.ts`. It is not a copy of another plugin. NAND does not embed a separately evaluated canvas library, so it does not keep a per-window package lease or a second React 19 runtime. File paths are the directory tree in `../SKILL.md`. Do not invent a second one.

## What mounts where

| Piece | Where it lives |
|---|---|
| The surface's data | The state object the product already owns |
| Which leaves are open in a window | A `Map<Window, WindowHost>` on the plugin |
| The component tree | One host node created with `win.document.body.createDiv()` |
| The visible surface | `createPortal` into `view.contentEl` |
| Drag preview | The window host, not the main window |
| Settings | `Setting` inside the settings tab, or inside a `Modal` |

`Element` in this repo's Obsidian types has `win: Window` and `doc: Document`. Use those. `Workspace` emits `window-open` and `window-close` as `(workspaceWindow, window: Window) => any`. The DOM window is the second argument. `HTMLElement.onWindowMigrated` fires with the destination `Window` and returns an unsubscriber.

## Host

```ts
type WindowHost = {
  rootEl: HTMLElement;
  views: Map<string, RenderedLeaf>;
};

// On the plugin:
windowHosts: Map<Window, WindowHost>
```

`mount(win)` returns immediately when `win` is already in the map. Otherwise it creates the host node on `win.document.body`, renders the window component into it, and stores the host.

`unmount(win)` calls `unmountComponentAtNode` from `preact/compat`, removes `rootEl`, and deletes the map entry.

Register both workspace events with `this.registerEvent`. In `onload`, mount `window`, then mount `containerEl.win` for any leaf of this view that is already open in another window. In `onunload`, unmount every key in the map, including `window`.

The window component reads the host's view list and portals each one:

```tsx
createPortal(view.renderSurface(), view.contentEl)
```

Give each portal a key that stays stable when the file is renamed (`leaf` id plus path, updated on rename).

## Leaf

On load, register the leaf on `containerEl.win`. Subscribe with `containerEl.onWindowMigrated`: remove the leaf from every host that has it, then add it to the destination window's host, calling `mount` first if that window has no host. Unsubscribe in `onunload`. Dropping the leaf also removes it from its host so the portal disappears before Obsidian detaches the DOM.

A leaf that only draws inside its own pane renders into `contentEl` and does not register anywhere else. A surface whose drag preview must leave the pane uses the window host above. That host is the one list of open rendered leaves, and `onunload` clears it. The lifecycle table in `../dev/references/obsidian-api.md` names this exception. Do not keep a second list.

## Components

Function components and hooks. Import them from `preact/compat` (or `preact/hooks` for hook-only modules). The controller remains the source of truth. A component does not write `plugin.settings` or the note by itself; it calls the action the view passed in.

A rename box or an open menu may use component state. Anything that must survive a popout move lives on the controller or on the view object, because the portal is created again on the new window.

## Markdown and icons

Render note text with `MarkdownRenderer`, and pass the view as the component so embeds unload with the leaf. Do not add a markdown-to-React library. Icons go through `setIcon`.

## Timers and listeners

Schedule on the view's `win` (`win.setTimeout`, `win.requestAnimationFrame`). A module-level `window` is the main window and will miss a popout. A listener attached to `doc` or `win` is removed on the same objects. The `dev` skill's rule for `registerDomEvent` still applies to plugin-owned listeners.

## esbuild and TypeScript

Add this only in the change that introduces the first rendered view. Dependencies: `preact`. Do not add the `react` or `react-dom` packages.

In `esbuild.config.mjs`:

```js
alias: {
  react: 'preact/compat',
  'react-dom/client': 'preact/compat',
  'react-dom': 'preact/compat',
},
jsx: 'automatic',
jsxImportSource: 'preact',
```

In `tsconfig.json` set `jsx` to `react-jsx` and `jsxImportSource` to `preact` when the first `.tsx` file appears. Keep `obsidian` external. Do not switch the build to Rollup.

If a dependency calls the bare `setTimeout` / `requestAnimationFrame` globals and breaks in a popout, rewrite those calls inside that dependency to `activeWindow` at build time. Do not do that to plugin source; plugin source already has the view's `win`.

## Why there is no package manager

A plugin that evals a canvas bundle must hand that bundle the same React object the UI uses, and a popout must not look up a different copy. NAND bundles its UI into `main.js`, so one Preact copy serves every window. The remaining bug is using the wrong `document`. The per-window host above is the fix. Do not add React 19, a private `eval` of a UI library, or `window.React`.
