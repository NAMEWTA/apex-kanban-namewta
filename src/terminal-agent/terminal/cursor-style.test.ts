import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function cssRule(css: string, selector: string): string {
	const at = css.indexOf(selector);
	assert.equal(at >= 0, true, selector);
	const close = css.indexOf('}', at);
	return css.slice(at, close);
}

test('the dom cursor is not absolutely positioned against the terminal', () => {
	const css = fs.readFileSync(path.join(process.cwd(), 'styles.css'), 'utf8');
	const bare = cssRule(css, '\n.xterm-cursor {');
	assert.equal(bare.includes('position: absolute'), false);
	const layer = cssRule(css, '.xterm-cursor-layer .xterm-cursor {');
	assert.equal(layer.includes('position: absolute'), true);
	const inline = cssRule(css, '.terminal-container .xterm-rows .xterm-cursor.xterm-cursor-block,');
	assert.equal(inline.includes('position: static'), true);
	assert.equal(inline.includes('height: 1.2em'), true);
	assert.equal(inline.includes('.xterm-cursor-outline'), true);
	assert.equal(inline.includes('.xterm-cursor-bar'), true);
	assert.equal(inline.includes('.xterm-cursor-underline'), true);
});
