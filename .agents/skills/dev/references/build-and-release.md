# Build, test, and release

The commands to run before finishing an edit are in SKILL.md. This file is what those scripts do, which test to pick, and how a version becomes a GitHub release.

## Scripts

| Script | What it does |
|---|---|
| `dev` | esbuild watch, inline sourcemap, no minify |
| `build` | `tsc -noEmit -skipLibCheck`, then esbuild production. Writes the repo-root `main.js` |
| `lint` | `eslint .` |

`main.js` is committed. A source change that is not rebuilt ships the old bundle to anyone who installs from the repo. Commit the rebuilt file with the source.

The package manager is pnpm. `package.json` pins `packageManager`. The lockfile is `pnpm-lock.yaml`. CI runs `pnpm install --frozen-lockfile`.

`pnpm.peerDependencyRules.allowedVersions` allows two mismatches that an older npm install ignored. Leave them unless the task is the dependency bump:

- `eslint-plugin-obsidianmd` peers an older `obsidian` than this repo's type package (`obsidian` 1.13.1). The manifest `minAppVersion` stays the identity-table value.
- `@xterm/addon-canvas` peers `@xterm/xterm` 5. This repo depends on `@xterm/xterm` 6.

`pnpm run format` rewrites every file under `src/` and `scripts/` and is not part of CI. Run it only when the task is a format change.

## Esbuild

`esbuild.config.mjs`:

- One entry, the path in the SKILL identity table. Format `cjs`, target `es2021`. Production minifies and drops the sourcemap.
- Externals: `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`, Node builtins.
- `ws` resolves to `node_modules/ws/wrapper.mjs`.
- `.md` and `.svg` load as text.

Do not add a second entry. Do not bundle CodeMirror.

## Tests

There is no aggregate test script. CI (`.github/workflows/lint.yml`) runs `build` and `lint` on Node 22 and 24 for every branch push. pnpm 11 needs Node 22.13 or newer, so the release workflow uses Node 22 as well. It does not run `test:*`. There is no Obsidian runtime in CI. Name the script you ran; a passing `build` does not verify UI.

A `*.test.ts` file runs only when a `package.json` script names it. `scripts/verify-*.ts` files are wired as `test:<name>`:

```sh
esbuild scripts/verify-foo.ts --bundle --platform=node --format=cjs \
  --outfile=node_modules/.tmp/verify-foo.cjs \
  --alias:obsidian=./scripts/obsidian-stub.ts \
  && node node_modules/.tmp/verify-foo.cjs
```

Copy the nearest script, including extra aliases such as the music stubs. Do not add a Jest runner.

| When you change… | Run |
|---|---|
| Comment anchors, the comment store, or the editor/dashboard import boundary | `pnpm run test:editor-comments` |
| Terminal agent behavior covered by its `*.test.ts` files | `pnpm run test:terminal-agent` |
| `src/plugin/settings/nav.ts` or the settings side-nav CSS | `pnpm run test:settings-nav` |
| A dashboard behavior that already has a verify script | the matching `test:*` in `package.json` |

`test:terminal-agent` and `test:settings-nav` use:

```sh
node --experimental-strip-types --import ./scripts/register-ts-hooks.mjs --test <paths>
```

New Node tests use that same runner. Verify scripts are excluded from eslint. `tsconfig.json` includes `scripts/**/*.ts`, excludes `**/*.test.ts`, and targets ES6, so a verify script cannot use top-level await. Wrap the body in `async function main()`.

`test:editor-comments` bundles against `scripts/obsidian-stub.ts`. The bundle's `__dirname` is `node_modules/.tmp`; resolve the repo with `process.cwd()`. What the script asserts is in `references/editor-comments.md`.

## Lint

`eslint.config.mts` spreads `obsidianmd.configs.recommended` and type-aware TypeScript eslint. Ignored: `node_modules`, `dist`, the esbuild and eslint configs, `version-bump.mjs`, `versions.json`, `main.js`, `scripts/**`, `**/*.test.ts`. Rule severity for production `src/**/*.ts` is in `references/obsidian-api.md`. Warnings do not fail CI. Do not add new warnings.

## Version bump

Do not run `pnpm run version`. That script calls `version-bump.mjs`, which is not in the repo.

Bump these together, or do not release:

| File | What |
|---|---|
| `manifest.json` `version` | the tag, with no `v` prefix |
| `package.json` `version` | the same string |
| `versions.json` | `"<version>": "<minAppVersion>"` using the identity-table `minAppVersion`, unless that value actually changes |
| `CHANGELOG.md` | newest section on top |
| `README.md` | only when user-facing behavior changed |

Raising `minAppVersion` drops users. Keep the settings fallback described in `references/obsidian-api.md` if you ever do. The tag must point at the commit whose `manifest.json` version equals the tag. Do not let a version tool create the tag before `main.js` and the changelog are in that commit.

## Release

`.github/workflows/release.yml` runs on any tag push:

1. `pnpm install --frozen-lockfile`
2. `pnpm run build`
3. Zip `dist/<id>/{main.js,manifest.json,styles.css}` as `<id>-<version>.zip`
4. Attest the zip
5. `softprops/action-gh-release` with generated notes, attaching the zip and `processes/rust-terminal-servers/binaries/*`

Push `main`, then push the tag. That workflow is the only release creator. Leave the attestation step and the terminal-binary upload in place.

`lint.yml` annotates warnings. It does not fail on them.

After a release, do not amend or force-push that commit.

## Commit shape

Match the log: one short imperative sentence, then a blank line and a short body when the reason is not obvious.

- Structure-only moves stay in their own commit.
- A feature commit may include the version bump when the task is to ship it.
- Do not commit `node_modules/.tmp` or local editor files.

## Pre-release checklist

- [ ] `manifest.json`, `package.json`, and `versions.json` agree
- [ ] `CHANGELOG.md` describes the user-visible change
- [ ] `pnpm run build` and `pnpm run lint` succeed
- [ ] The verify script for the area you touched succeeds
- [ ] `main.js` is in the commit
- [ ] The tag equals `manifest.version`
- [ ] `release.yml` is left to create the GitHub release
- [ ] The terminal binary upload step is still in the workflow if you edited it
