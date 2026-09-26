import { t } from '../../shared/i18n';
import { AGENT_CATALOG } from './catalog';
import type { AgentId, AgentSettings, UsageSnapshot } from './types';
import { formatUsageChip } from './usage';

export interface UsageBarHost {
	isActive?: () => boolean;
	settings: { agentSettings: AgentSettings };
}

export interface UsageBarElement {
	toggleClass(name: string, on: boolean): void;
	replaceChildren(): void;
	createSpan(spec: { cls?: string; text?: string }): UsageBarElement;
}

export function enabledUsageAgents(plugin: UsageBarHost): AgentId[] {
	const { agents } = plugin.settings.agentSettings;
	return AGENT_CATALOG
		.filter((agent) => agent.usage !== 'none' && agents[agent.id]?.showUsage !== false)
		.map((agent) => agent.id);
}

export function usageBarVisible(plugin: UsageBarHost): boolean {
	if (plugin.isActive && !plugin.isActive()) return false;
	if (!plugin.settings.agentSettings.showUsageInStatusBar) return false;
	return enabledUsageAgents(plugin).length > 0;
}

/**
 * Paint the usage status item. Returns the snapshots that should be kept,
 * or null when the bar is hidden or a result arrived after the host went inactive.
 * The "用量" label is written before the network read.
 */
export async function paintUsageBar(
	status: UsageBarElement,
	plugin: UsageBarHost,
	readSnapshots: (ids: readonly AgentId[]) => Promise<UsageSnapshot[]>,
): Promise<UsageSnapshot[] | null> {
	const show = usageBarVisible(plugin);
	status.toggleClass('is-hidden', !show);
	status.replaceChildren();
	if (!show) return null;
	status.createSpan({ cls: 'terminal-usage-rest', text: t('terminalAgent.agents.usageChip') });
	const latest = await readSnapshots(enabledUsageAgents(plugin));
	if (plugin.isActive && !plugin.isActive()) {
		status.toggleClass('is-hidden', true);
		status.replaceChildren();
		return null;
	}
	status.replaceChildren();
	const chips = latest.flatMap((snapshot) => {
		const rest = formatUsageChip(snapshot);
		return rest ? [{ provider: snapshot.provider, rest }] : [];
	});
	if (chips.length === 0) {
		status.createSpan({ cls: 'terminal-usage-rest', text: t('terminalAgent.agents.usageChip') });
	} else {
		for (const chip of chips) {
			const item = status.createSpan({ cls: 'terminal-usage-item' });
			item.createSpan({ cls: 'terminal-usage-agent', text: chip.provider });
			item.createSpan({ cls: 'terminal-usage-rest', text: chip.rest });
		}
	}
	return latest;
}
