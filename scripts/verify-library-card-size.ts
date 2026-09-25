/**
 * Verifies the card-size (S/M/L) toggle for the library and folder sections'
 * card views:
 *
 * 1. Parser round-trip — 'small'/'large' persist to the dashboard file,
 *    'medium' (default) writes nothing, garbage parses to undefined.
 * 2. renderLibrarySection toolbar — the size control is one dropdown whose
 *    collapsed button shows the current letter. The menu lists 小/中/大.
 *    It stays visible in grid/gallery and hides in list/table. Picking a size
 *    reports it through onConfigChange and re-renders the grid with the
 *    matching size class. 'medium' stays un-suffixed (legacy layout intact).
 *
 * Run: `pnpm run test:library-card-size`
 */
import { strict as assert } from 'node:assert';
import { Menu } from 'obsidian';
import { parse, serialize } from '../src/dashboard-view/parser';
import { renderLibrarySection } from '../src/dashboard-view/library';
import { El, findByClass } from './mini-dom';

type StubMenuItem = { title: string; click(): void };
type StubMenu = { items: StubMenuItem[] };

const openedMenu = (): StubMenu => {
	const menu = (Menu as unknown as { last: StubMenu | null }).last;
	assert.ok(menu, 'dropdown menu opened');
	return menu;
};

(globalThis as unknown as Record<string, unknown>).activeDocument = {
	querySelector: () => null,
	addEventListener: () => {},
	removeEventListener: () => {},
};

// ---------- 1. Parser round-trip ----------

const roundTrip = (size: string | undefined): string | undefined => {
	const dash = parse(
		[
			'---',
			'columns:',
			'  - name: C1',
			'    type: folder',
			'    library:',
			`      cardSize: ${size}`,
			'---',
			'',
			'## C1',
		].join('\n'),
	);
	const col = dash.columns[0];
	return serialize(dash).match(/cardSize: (\w+)/)?.[1] ?? undefined;
};

assert.equal(roundTrip('small'), 'small', 'small round-trips');
assert.equal(roundTrip('large'), 'large', 'large round-trips');
assert.equal(roundTrip('medium'), undefined, 'medium (default) writes nothing');
assert.equal(roundTrip('huge'), undefined, 'garbage value dropped');

console.log('cardSize parser round-trip: PASS');

// ---------- 2. Toolbar + rendering ----------

const makeApp = () => {
	const file = {
		path: 'notes/a.md',
		basename: 'a',
		extension: 'md',
		stat: { mtime: 1, ctime: 1 },
	};
	return {
		vault: {
			getMarkdownFiles: () => [file],
			cachedRead: async () => '---\ntitle: x\n---\n\nbody',
			adapter: {
				read: async () => {
					throw new Error('no adapter in stub');
				},
			},
		},
		metadataCache: {
			getFileCache: () => ({ frontmatter: { title: 'x' }, tags: [] }),
			fileToLinktext: (f: { path: string }) => f.path,
		},
		workspace: { on: () => {}, off: () => {} },
		fileManager: {},
		lastEvent: null,
	} as unknown as Parameters<typeof renderLibrarySection>[2];
};

const el = new El('div');
let saved: { cardSize?: string } | undefined;
// tsc sees HTMLElement (real typings); the bundled mini-DOM provides El.
renderLibrarySection(
	el as unknown as HTMLElement,
	{
		name: 'C1',
		color: '',
		sectionType: 'folder',
		libraryConfig: { filters: [], viewMode: 'grid', sortBy: 'modified', sortDesc: true, folders: ['notes'] },
	},
	makeApp(),
	(cfg) => {
		saved = { ...cfg } as { cardSize?: string };
	},
);

const sizeToggle = findByClass(el, 'dashboard-library-size-toggle')[0]!;
const sizeLetter = (): string | undefined =>
	findByClass(sizeToggle, 'dashboard-toolbar-dropdown-text')[0]?.textContent;
const gridHost = (): El =>
	findByClass(el, 'dashboard-library-grid')[0] ??
	findByClass(el, 'dashboard-library-gallery')[0] ??
	assert.fail('card grid rendered');

const pickDropdown = (host: El, index: number): void => {
	const button = findByClass(host, 'dashboard-toolbar-dropdown')[0];
	assert.ok(button, 'dropdown button');
	button.click();
	const menu = openedMenu();
	const item = menu.items[index];
	assert.ok(item, `menu item ${index}`);
	item.click();
};

// One collapsed letter, menu still offers S/M/L, medium by default.
assert.equal(sizeLetter(), 'M', 'medium letter by default');
assert.ok(!sizeToggle.hasClass('is-hidden'), 'visible in grid view');
findByClass(sizeToggle, 'dashboard-toolbar-dropdown')[0]!.click();
const sizeMenu = openedMenu();
assert.deepEqual(
	sizeMenu.items.map((item) => item.title),
	['小卡片', '中卡片', '大卡片'],
	'three size choices S/M/L',
);
assert.equal(
	findByClass(sizeToggle, 'dashboard-toolbar-dropdown')[0]?.getAttribute('aria-label'),
	'中卡片',
	'collapsed size label',
);

// Default grid carries no size class (legacy layout).
assert.ok(
	!gridHost().hasClass('dashboard-library-cards--small') && !gridHost().hasClass('dashboard-library-cards--large'),
	'medium stays un-suffixed',
);

// Pick S: config reported, grid re-rendered with the class.
pickDropdown(sizeToggle, 0);
assert.equal((saved as { cardSize?: string } | undefined)?.cardSize, 'small', 'onConfigChange carries cardSize');
assert.equal(sizeLetter(), 'S', 'S becomes the collapsed letter');
assert.ok(gridHost().hasClass('dashboard-library-cards--small'), 'grid re-rendered with small class');

// Pick L from the fresh menu.
pickDropdown(sizeToggle, 2);
assert.equal(sizeLetter(), 'L', 'L becomes the collapsed letter');
assert.ok(gridHost().hasClass('dashboard-library-cards--large'), 'grid re-rendered with large class');

// Switch to list: selector hides; back to gallery: visible and gallery-sized.
// View order in the menu: grid, gallery, list, table, kanban.
const viewToggle = findByClass(el, 'dashboard-library-view-toggle')[0]!;
pickDropdown(viewToggle, 2);
assert.ok(sizeToggle.hasClass('is-hidden'), 'hidden in list view');
pickDropdown(viewToggle, 3);
assert.ok(sizeToggle.hasClass('is-hidden'), 'hidden in table view');
pickDropdown(viewToggle, 1);
assert.ok(!sizeToggle.hasClass('is-hidden'), 'visible in gallery view');
assert.ok(gridHost().hasClass('dashboard-library-gallery'), 'gallery view renders gallery grid');
assert.ok(gridHost().hasClass('dashboard-library-cards--large'), 'card size carries over to gallery');

// A persisted small config renders small from the start (no toggle needed).
const el2 = new El('div');
renderLibrarySection(
	el2 as unknown as HTMLElement,
	{
		name: 'C2',
		color: '',
		sectionType: 'library',
		libraryConfig: { filters: [], viewMode: 'gallery', sortBy: 'modified', sortDesc: true, cardSize: 'small' },
	},
	makeApp(),
	() => {},
);
const gallery2 = findByClass(el2, 'dashboard-library-gallery')[0]!;
assert.ok(gallery2.hasClass('dashboard-library-cards--small'), 'persisted small applied on open');
assert.equal(
	findByClass(findByClass(el2, 'dashboard-library-size-toggle')[0]!, 'dashboard-toolbar-dropdown-text')[0]?.textContent,
	'S',
	'S shown on open',
);

console.log('card size toolbar + rendering: PASS');
console.log('library card size: ALL PASS');
