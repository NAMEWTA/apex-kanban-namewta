import type { TerminalAgentController } from '../host/controller';
import { renderAgentSettings } from '../launch/register';
import { TerminalSettingsRenderer } from './renderer';
import type { RendererContext } from './types';

export type TerminalSettingsSection =
	| 'shell'
	| 'instance'
	| 'workflows'
	| 'appearance'
	| 'behavior'
	| 'connection'
	| 'visibility'
	| 'agents';

const renderers = new WeakMap<TerminalAgentController, TerminalSettingsRenderer>();
const expanded = new WeakMap<TerminalAgentController, Set<string>>();

/** All terminal sections share one renderer context so later sections do not drop earlier DOM or listeners. */
export function renderStackedTerminalAgentSettings(
	container: HTMLElement,
	plugin: TerminalAgentController,
): void {
	container.empty();
	let renderer = renderers.get(plugin);
	if (!renderer) {
		renderer = new TerminalSettingsRenderer();
		renderers.set(plugin, renderer);
	}
	let open = expanded.get(plugin);
	if (!open) {
		open = new Set<string>();
		expanded.set(plugin, open);
	}
	renderer.render({
		app: plugin.app,
		plugin,
		containerEl: container,
		expandedSections: open,
	});
	const agents = container.createDiv();
	renderAgentSettings(agents, plugin);
}

export function renderTerminalAgentSettings(
	container: HTMLElement,
	plugin: TerminalAgentController,
	section: TerminalSettingsSection,
): void {
	container.empty();
	if (section === 'agents') {
		renderAgentSettings(container, plugin);
		return;
	}
	let renderer = renderers.get(plugin);
	if (!renderer) {
		renderer = new TerminalSettingsRenderer();
		renderers.set(plugin, renderer);
	}
	let open = expanded.get(plugin);
	if (!open) {
		open = new Set<string>();
		expanded.set(plugin, open);
	}
	const context: RendererContext = {
		app: plugin.app,
		plugin,
		containerEl: container,
		expandedSections: open,
	};
	renderer.renderSection(context, section);
}
