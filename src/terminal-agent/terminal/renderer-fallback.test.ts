import assert from 'node:assert/strict';
import test from 'node:test';

import { terminalRendererNotice } from './renderer-fallback.ts';

test('webgl2 failure is not written into the terminal', () => {
	assert.equal(terminalRendererNotice(new Error('WebGL2 not supported')), null);
});

test('a translated renderer load failure is not written into the terminal', () => {
	assert.equal(terminalRendererNotice(new Error('加载渲染器插件失败')), null);
	assert.equal(terminalRendererNotice(new Error('Failed to load renderer addon')), null);
});

test('an unexpected renderer error can still be written', () => {
	const line = terminalRendererNotice(new Error('disk full'));
	assert.equal(typeof line, 'string');
	assert.equal(line?.includes('disk full'), true);
});
