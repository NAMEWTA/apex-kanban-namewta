import assert from 'node:assert/strict';
import test from 'node:test';

import { setLanguage } from '../../shared/i18n/runtime.ts';
import { DEFAULT_AGENT_SETTINGS } from './defaults.ts';
import { paintUsageBar, type UsageBarElement, type UsageBarHost } from './usage-bar.ts';
import type { UsageSnapshot } from './types.ts';

class Bar implements UsageBarElement {
	hidden = false;
	spans: Array<{ cls?: string; text?: string }> = [];

	toggleClass(name: string, on: boolean): void {
		if (name === 'is-hidden') this.hidden = on;
	}

	replaceChildren(): void {
		this.spans = [];
	}

	createSpan(spec: { cls?: string; text?: string }): UsageBarElement {
		this.spans.push(spec);
		return new Bar();
	}
}

function host(active: boolean): UsageBarHost {
	return {
		isActive: () => active,
		settings: { agentSettings: structuredClone(DEFAULT_AGENT_SETTINGS) },
	};
}

test('a closed host does not read usage', async () => {
	setLanguage('zh');
	let reads = 0;
	const bar = new Bar();
	const painted = await paintUsageBar(bar, host(false), async () => {
		reads += 1;
		return [];
	});
	assert.equal(reads, 0);
	assert.equal(painted, null);
	assert.equal(bar.hidden, true);
});

test('an open host shows the usage label before the read finishes', async () => {
	setLanguage('zh');
	const bar = new Bar();
	let labelBeforeRead = false;
	const painted = await paintUsageBar(bar, host(true), async () => {
		labelBeforeRead = bar.spans.some((span) => span.text === '用量');
		return [];
	});
	assert.equal(labelBeforeRead, true);
	assert.equal(painted?.length, 0);
	assert.equal(bar.hidden, false);
	assert.equal(bar.spans.some((span) => span.text === '用量'), true);
});

test('a usage result that arrives after the host closes is dropped', async () => {
	setLanguage('zh');
	let active = true;
	const plugin = host(true);
	plugin.isActive = () => active;
	const bar = new Bar();
	const painted = await paintUsageBar(bar, plugin, async () => {
		active = false;
		const snapshot: UsageSnapshot = {
			agentId: 'codex',
			provider: 'Codex',
			account: null,
			status: 'HTTP 401',
			failed: true,
			windows: [],
		};
		return [snapshot];
	});
	assert.equal(painted, null);
	assert.equal(bar.hidden, true);
	assert.equal(bar.spans.length, 0);
});
