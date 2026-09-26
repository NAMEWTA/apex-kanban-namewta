import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { setLanguage, t } from '../../shared/i18n/index.ts';
import { connectionMenuLabel, terminalMenuLabels } from './connection-menu.ts';

const SIBLING_KEYS = {
	shell: 'terminalAgent.settingsDetails.terminal.shellSettings',
	instance: 'terminalAgent.settingsDetails.terminal.instanceBehavior',
	workflows: 'terminalAgent.settingsDetails.terminal.presetScripts',
	appearance: 'terminalAgent.settingsDetails.terminal.displaySettings',
	behavior: 'terminalAgent.settingsDetails.terminal.behaviorSettings',
	visibility: 'terminalAgent.visibility.visibilitySettings',
	agents: 'settings.productTerminal',
} as const;

test('connection menu matches the server-connection title in both plugin languages', () => {
	setLanguage('zh');
	assert.equal(connectionMenuLabel(), '服务器连接');
	assert.equal(connectionMenuLabel(), t('terminalAgent.settingsDetails.advanced.serverConnection'));
	assert.notEqual(connectionMenuLabel(), 'terminalAgent.settingsDetails.terminal.serverConnection');

	setLanguage('en');
	assert.equal(connectionMenuLabel(), 'Server connection');
	assert.equal(connectionMenuLabel(), t('terminalAgent.settingsDetails.advanced.serverConnection'));
});

test('other terminal menu labels stay on their existing keys', () => {
	for (const language of ['zh', 'en'] as const) {
		setLanguage(language);
		const labels = terminalMenuLabels();
		assert.equal(labels.connection, connectionMenuLabel());
		for (const [id, key] of Object.entries(SIBLING_KEYS)) {
			assert.equal(labels[id as keyof typeof SIBLING_KEYS], t(key));
		}
	}
});

test('settings tab reads terminal menu labels from the shared helper', () => {
	const source = fs.readFileSync(path.join(process.cwd(), 'src/plugin/settings/settings-tab.ts'), 'utf8');
	assert.equal(source.includes('terminalMenuLabels()'), true);
	assert.equal(source.includes('terminalAgent.settingsDetails.terminal.serverConnection'), false);
});
