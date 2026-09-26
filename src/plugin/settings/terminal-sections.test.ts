import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const nodeRequire = createRequire(path.join(process.cwd(), 'package.json'));
(globalThis as unknown as { window: { require: NodeRequire } }).window = { require: nodeRequire };
class SvgElement {}
const activeDocument = {
	createElementNS: () => {
		const svg = new El('svg');
		return Object.assign(svg, { instanceOf: (ctor: unknown) => ctor === SvgElement });
	},
	createElement: () => new El('div'),
	importNode: (node: El) => node,
};
(globalThis as unknown as { activeDocument: typeof activeDocument; DOMParser: typeof DOMParser; SVGSVGElement: typeof SvgElement }).activeDocument = activeDocument;
(globalThis as unknown as { DOMParser: new () => { parseFromString: () => { documentElement: El } } }).DOMParser = class {
	parseFromString() {
		const svg = new El('svg');
		return { documentElement: Object.assign(svg, { instanceOf: (ctor: unknown) => ctor === SvgElement }) };
	}
};
(globalThis as unknown as { SVGSVGElement: typeof SvgElement }).SVGSVGElement = SvgElement;

import { Setting } from '../../../scripts/obsidian-stub';
import { El } from '../../../scripts/mini-dom';
import { DashboardSettingTab } from './settings-tab';
import { DEFAULT_TERMINAL_SETTINGS } from '../../terminal-agent/settings/model';
import type { TerminalAgentController } from '../../terminal-agent/host/controller';
import type DashboardPlugin from '../main';

test('stacked terminal sections keep the appearance block, launcher subscription, and offline hint', async () => {
	Setting.created = [];
	const settings = structuredClone(DEFAULT_TERMINAL_SETTINGS);
	settings.useObsidianTheme = false;
	settings.preferredRenderer = 'canvas';
	settings.serverConnection.offlineMode = false;
	const listeners = new Set<(presetId: string, snapshot: unknown) => void>();
	const plugin = {
		app: { workspace: { getLeavesOfType: () => [] } },
		settings,
		saveSettings: async () => {},
		onAiLauncherSnapshotsChanged(listener: (presetId: string, snapshot: unknown) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getAiLauncherSnapshot: () => undefined,
		refreshAiLauncherSnapshot: () => undefined,
		refreshAiLauncherStatusFromSettings: async () => {},
		updateFeatureVisibility() {},
		getServerManager: async () => ({
			updateOfflineMode() {},
			updateBinaryDownloadConfig() {},
			ensureBinaryUpdated: async () => 'already-ready',
		}),
		manifest: { dir: '' },
		addCommand() {},
		addStatusBarItem: () => new El('div'),
		registerInterval: (id: number) => id,
		getTerminalService: async () => ({}),
		openFreshTerminal: async () => {},
		insertIntoActiveTerminal: async () => false,
		openSettings() {},
		readAbsoluteReference: () => null,
	};
	const host = new El('div');
	const tab = Object.create(DashboardSettingTab.prototype) as DashboardSettingTab;
	tab.plugin = { terminalHost: plugin } as unknown as DashboardPlugin;
	tab.renderTerminalProduct(host as unknown as HTMLElement);

	const appearance = host.querySelector('.conditional-section-custom-color-settings');
	assert.ok(appearance, 'appearance custom-color block must stay in the stacked container');
	assert.equal(appearance.parent === null, false);
	const displayTabs = host.querySelectorAll('.terminal-display-tab');
	assert.equal(displayTabs.length, 2);
	displayTabs[1].click();
	assert.equal(host.querySelector('.conditional-section-custom-color-settings'), appearance);

	const renderer = Setting.created
		.flatMap((setting) => setting.dropdowns)
		.find((dropdown) => dropdown.options.includes('canvas') && dropdown.options.includes('webgl'));
	assert.ok(renderer?.fire);
	renderer.fire('webgl');
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(settings.preferredRenderer, 'webgl');
	assert.ok(
		appearance.querySelector('.terminal-background-image-webgl-hint'),
		'renderer change must still find the custom-color block from the shared container',
	);
	assert.ok(listeners.size > 0, 'workflow launcher subscriptions must survive later sections');

	let offlineFired = false;
	for (const toggle of [...Setting.created].reverse().flatMap((setting) => setting.toggles)) {
		if (!toggle.fire) continue;
		try {
			toggle.fire(true);
		} catch {
			continue;
		}
		if (settings.serverConnection.offlineMode === true) {
			offlineFired = true;
			break;
		}
	}
	assert.equal(offlineFired, true);
	assert.equal(settings.serverConnection.offlineMode, true);
	const hint = host.querySelector('.ai-launcher-offline-hint');
	assert.ok(hint);
	assert.equal(hint.classList.contains('is-hidden'), false);
});
