import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { defaultPage, productOrder, secondaryAxis, sidePages } from './nav.ts';

test('home is the first primary settings product', () => {
	assert.equal(productOrder()[0], 'home');
	assert.deepEqual(productOrder(), ['home', 'dashboard', 'editor', 'terminal', 'sync']);
});

test('secondary pages are a vertical list and terminal has eight of them', () => {
	assert.equal(secondaryAxis, 'vertical');
	assert.equal(sidePages('home').length, 0);
	assert.equal(sidePages('sync').length, 0);
	assert.deepEqual(sidePages('dashboard'), ['general', 'widgets', 'coffee']);
	assert.equal(sidePages('terminal').length, 8);
	assert.equal(defaultPage('terminal'), 'shell');
	assert.equal(defaultPage('home'), 'home');
});

test('settings stylesheet keeps the secondary menu vertical', () => {
	const css = fs.readFileSync(path.join(process.cwd(), 'styles.css'), 'utf8');
	const side = css.slice(css.indexOf('.dashboard-settings-sidenav {'));
	assert.match(side, /flex-direction:\s*column/);
	assert.match(css, /\.dashboard-settings-products\s*\{[^}]*flex-wrap:\s*wrap/s);
	assert.equal(css.includes('dashboard-settings-tabs-secondary'), false);
});
