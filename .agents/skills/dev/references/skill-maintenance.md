# Keeping this skill true

Open this file only when you changed an invariant, or when you are editing the skill itself. Code, `package.json`, and `.github/workflows` win. Then update the one file below that owns the fact, in the same change.

## One fact, one file

| Fact | Owner |
|---|---|
| Display name, plugin id, view types, `minAppVersion`, `isDesktopOnly`, entry, stylesheet | `SKILL.md` identity table |
| Rules that apply to every edit, and the `pnpm run build` / `pnpm run lint` gate | `SKILL.md` |
| Import matrix, lifecycle, folder map, command homes, settings pages, i18n edit steps, persisted names | `references/architecture.md` |
| Obsidian API, eslint severity, DOM, CSS | `references/obsidian-api.md` |
| Comment sidecars, anchors, comment tests | `references/editor-comments.md` |
| What the scripts do, which `test:*` to run, CI, version bump, release workflow | `references/build-and-release.md` |
| This map, and how to revise the skill | this file |

Point at the owner. Do not copy the value into a second file. `SKILL.md` links directly to every reference. A sibling may name another reference that `SKILL.md` already links; do not add a file that is only reachable through that hop.

## How to revise it

1. Read the host's skill rules and the open Agent Skills practices before inventing a new layout. Description triggers the skill. The body is the every-run procedure. Long material waits in `references/` until a step names it.
2. List the claims you are about to write: paths, command ids, page ids, scripts, gates.
3. Check each claim against the current source. A file comment that disagrees with the imports is not the source of truth.
4. Sort the result. Wrong claims get replaced. Over-specific claims get loosened to the real boundary. Duplicated claims lose the extra copy. Generic advice the agent already follows gets cut. A mistake the agent will make without being told stays as one sentence in `SKILL.md`, with the procedure in the owner file.
5. Keep `SKILL.md` under 500 lines. Link one level deep.
6. Keep the description specific, third person, under 1024 characters, and include the words a user actually types: NAND, nand, 看板, 仪表盘, 评论, 终端, 设置, 发版, Obsidian 插件, plus the English area names.
7. Re-read the diff against this table. A new version number, directory, or command line belongs in the owner only.
8. Check the skill by opening every path it names and matching every script it names to `package.json`. Do not add a separate skill linter.

Do not add `README.md`, `CHANGELOG.md`, or another numbered catch-all file inside this skill. Do not copy `skill-design-principles` into this file; follow them while editing.
