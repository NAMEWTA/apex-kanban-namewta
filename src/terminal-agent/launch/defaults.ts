import { AGENT_CATALOG } from './catalog';
import type { AgentEntrySettings, AgentId, AgentSettings } from './types';

function entry(): AgentEntrySettings {
  return {
    enabled: true,
    cliPath: '',
    permissionMode: 'inherit',
    extraArgs: '',
    accountId: '',
    showUsage: true,
  };
}

export const AGENT_IDS: readonly AgentId[] = AGENT_CATALOG.map((agent) => agent.id);

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  globalPermissionMode: 'yolo',
  yoloAcknowledged: false,
  usageRefreshSec: 45,
  showUsageInStatusBar: true,
  agents: Object.fromEntries(AGENT_IDS.map((id) => [id, entry()])) as Record<AgentId, AgentEntrySettings>,
};

export function normalizeAgentSettings(value: Partial<AgentSettings> | null | undefined): AgentSettings {
  const agents = { ...DEFAULT_AGENT_SETTINGS.agents };
  for (const id of AGENT_IDS) {
    const incoming = value?.agents?.[id];
    agents[id] = {
      ...entry(),
      ...incoming,
      permissionMode: incoming?.permissionMode === 'yolo' || incoming?.permissionMode === 'manual'
        ? incoming.permissionMode
        : 'inherit',
      showUsage: incoming?.showUsage !== false,
    };
  }

  const mode = value?.globalPermissionMode === 'manual' ? 'manual' : 'yolo';
  const refresh = Number(value?.usageRefreshSec);
  return {
    globalPermissionMode: mode,
    yoloAcknowledged: Boolean(value?.yoloAcknowledged),
    usageRefreshSec: Number.isFinite(refresh) && refresh >= 15 ? refresh : 45,
    showUsageInStatusBar: value?.showUsageInStatusBar !== false,
    agents,
  };
}
