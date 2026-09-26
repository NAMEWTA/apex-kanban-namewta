import assert from 'node:assert/strict';
import test from 'node:test';

import { terminalLeafKind } from './terminal-leaf-kind.ts';

test('an active host reopens a terminal leaf', () => {
	assert.equal(terminalLeafKind(true), 'active');
});

test('an inactive host reopens the placeholder leaf', () => {
	assert.equal(terminalLeafKind(false), 'inactive');
});
