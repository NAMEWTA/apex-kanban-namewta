import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { defaultPage, productOrder, sidePages, visibleProducts } from './nav.ts';

const ALL_ON = { dashboard: true, editor: true, terminal: true };

test('home is the first primary settings product', () => {
	assert.equal(productOrder()[0], 'home');
	assert.deepEqual(productOrder(), ['home', 'dashboard', 'editor', 'terminal', 'sync']);
});

test('top tabs keep home and sync and hide closed domains', () => {
	assert.deepEqual(visibleProducts(ALL_ON), ['home', 'dashboard', 'editor', 'terminal', 'sync']);
	assert.deepEqual(visibleProducts({ dashboard: false, editor: true, terminal: true }), ['home', 'editor', 'terminal', 'sync']);
	assert.deepEqual(visibleProducts({ dashboard: true, editor: false, terminal: true }), ['home', 'dashboard', 'terminal', 'sync']);
	assert.deepEqual(visibleProducts({ dashboard: true, editor: true, terminal: false }), ['home', 'dashboard', 'editor', 'sync']);
	assert.deepEqual(visibleProducts({ dashboard: false, editor: false, terminal: false }), ['home', 'sync']);
	assert.equal(visibleProducts({ dashboard: false, editor: true, terminal: false }).includes('home'), true);
	assert.equal(visibleProducts({ dashboard: false, editor: true, terminal: false }).includes('sync'), true);
});

test('domain sections stay in their previous order for stacking on one tab', () => {
	assert.equal(sidePages('home').length, 0);
	assert.equal(sidePages('sync').length, 0);
	assert.deepEqual(sidePages('dashboard'), ['general', 'widgets', 'coffee']);
	assert.deepEqual(sidePages('editor'), ['comments', 'copy']);
	assert.deepEqual(sidePages('terminal'), ['shell', 'instance', 'workflows', 'appearance', 'behavior', 'connection', 'visibility', 'agents']);
	assert.equal(defaultPage('terminal'), 'shell');
	assert.equal(defaultPage('home'), 'home');
});

test('settings stylesheet does not keep a left-hand settings column', () => {
	const css = fs.readFileSync(path.join(process.cwd(), 'styles.css'), 'utf8');
	const block = css.slice(css.indexOf('.nand-settings {'), css.indexOf('.nand-settings {') + 180);
	assert.equal(block.includes('display: block'), true);
	assert.equal(block.includes('180px'), false);
	assert.equal(css.includes('nand-settings-split'), false);
	assert.equal(css.includes('dashboard-settings-sidenav'), false);
	const source = fs.readFileSync(path.join(process.cwd(), 'src/plugin/settings/settings-tab.ts'), 'utf8');
	assert.equal(source.includes('dashboard-settings-sidenav'), false);
	assert.equal(source.includes('nand-settings-split'), false);
});
