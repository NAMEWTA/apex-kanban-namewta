import { Notice, Setting, type App } from 'obsidian';
import { t } from '../../shared/i18n';
import type { TerminalSettings } from '../settings/model';
import { normalizeAgentSettings } from './defaults';
import { AGENT_CATALOG } from './catalog';
import { launchAgent, launchShell, resumeAgent, type LaunchHost } from './launcher';
import { nextUsageDelayMs } from '../terminal/path-reference';
import { readUsageSnapshots, formatUsageChip } from './usage';
import type { VaultSession } from '../sessions/types';
import { UsageModal } from './usage-modal';
import type { AgentId, AgentSettings, UsageSnapshot } from './types';
import type { TerminalService } from '../terminal/terminal-service';

export interface OrcaPluginHost {
  app: App;
  settings: TerminalSettings;
  manifest: { dir?: string };
  saveSettings: () => Promise<void>;
  addCommand: (command: { id: string; name: string; callback: () => void }) => void;
  addStatusBarItem: () => HTMLElement;
  registerInterval: (id: number) => number;
  getTerminalService: () => Promise<TerminalService>;
  openFreshTerminal: () => Promise<void>;
  insertIntoActiveTerminal: (text: string) => Promise<boolean>;
  openSettings: () => void;
  readAbsoluteReference: () => string | null;
  noteLocalVersion?: (agentId: AgentId, version: string | null) => void;
  isActive?: () => boolean;
}

let refreshUsageStatus: (() => void) | null = null;
let launchBound: ((agentId: AgentId) => Promise<void>) | null = null;
let resumeBound: ((session: VaultSession) => Promise<void>) | null = null;

export function launchRegisteredAgent(agentId: AgentId): Promise<void> {
  if (!launchBound) {
    return Promise.reject(new Error('agent launcher is not ready'));
  }
  return launchBound(agentId);
}

export function resumeRegisteredSession(session: VaultSession): Promise<void> {
  if (!resumeBound) {
    return Promise.reject(new Error('agent launcher is not ready'));
  }
  return resumeBound(session);
}

async function openUsage(plugin: OrcaPluginHost): Promise<void> {
  const snapshots = await readUsageSnapshots(enabledUsageAgents(plugin));
  new UsageModal(plugin.app, snapshots).open();
}

function enabledUsageAgents(plugin: OrcaPluginHost): AgentId[] {
  const { agents } = plugin.settings.agentSettings;
  return AGENT_CATALOG
    .filter((agent) => agent.usage !== 'none' && agents[agent.id]?.showUsage !== false)
    .map((agent) => agent.id);
}

function usageBarVisible(plugin: OrcaPluginHost): boolean {
  if (plugin.isActive && !plugin.isActive()) return false;
  if (!plugin.settings.agentSettings.showUsageInStatusBar) return false;
  return enabledUsageAgents(plugin).length > 0;
}

export function registerOrca(plugin: OrcaPluginHost): void {
  launchBound = (agentId) => launchAgent(host(plugin), agentId);
  resumeBound = (session) => resumeAgent(host(plugin), session);
  plugin.addCommand({
    id: 'new-terminal-powershell',
    name: t('terminalAgent.commands.shellPowerShell'),
    callback: () => {
      void launchShell(host(plugin), 'pwsh', 'PowerShell');
    },
  });
  plugin.addCommand({
    id: 'new-terminal-cmd',
    name: t('terminalAgent.commands.shellCmd'),
    callback: () => {
      void launchShell(host(plugin), 'cmd', 'Command Prompt');
    },
  });
  plugin.addCommand({
    id: 'new-terminal-gitbash',
    name: t('terminalAgent.commands.shellGitBash'),
    callback: () => {
      void launchShell(host(plugin), 'gitbash', 'Git Bash');
    },
  });

  plugin.addCommand({
    id: 'insert-absolute-reference',
    name: '把绝对引用插入当前终端',
    callback: () => {
      const text = plugin.readAbsoluteReference();
      if (!text) {
        new Notice(t('editor.copy.missing'));
        return;
      }
      const inline = text.split('\n').filter((line) => line.length > 0).join(' ');
      void plugin.insertIntoActiveTerminal(`${inline} `);
    },
  });

  plugin.addCommand({
    id: 'show-usage',
    name: t('terminalAgent.commands.showUsage'),
    callback: () => {
      void openUsage(plugin);
    },
  });

  plugin.addCommand({
    id: 'open-agent-settings',
    name: t('terminalAgent.commands.agentSettings'),
    callback: () => plugin.openSettings(),
  });

  const status = plugin.addStatusBarItem();
  status.addClass('terminal-usage');
  status.addClass('is-clickable');
  let latest: UsageSnapshot[] = [];
  let inflight = false;
  let consecutiveFailures = 0;
  let nextAt = 0;
  const render = async () => {
    if (inflight) return;
    inflight = true;
    try {
      const show = usageBarVisible(plugin);
      status.toggleClass('is-hidden', !show);
      status.replaceChildren();
      if (!show) return;
      latest = await readUsageSnapshots(enabledUsageAgents(plugin));
      consecutiveFailures = latest.some((snapshot) => snapshot.failed) ? consecutiveFailures + 1 : 0;
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
    } finally {
      inflight = false;
      nextAt = Date.now() + nextUsageDelayMs(plugin.settings.agentSettings.usageRefreshSec, consecutiveFailures);
    }
  };
  refreshUsageStatus = () => {
    void render();
  };
  status.addEventListener('click', () => {
    new UsageModal(plugin.app, latest).open();
    void render();
  });
  void render();
  plugin.registerInterval(window.setInterval(() => {
    if (Date.now() < nextAt) return;
    void render();
  }, 15_000));
}

function host(plugin: OrcaPluginHost): LaunchHost {
  return {
    app: plugin.app,
    getVaultPath: () => {
      const adapter = plugin.app.vault.adapter as { getBasePath?: () => string };
      return typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : undefined;
    },
    getPluginDataDir: () => plugin.manifest.dir ?? '',
    getAgentSettings: () => plugin.settings.agentSettings,
    saveAgentSettings: async (settings: AgentSettings) => {
      plugin.settings.agentSettings = normalizeAgentSettings(settings);
      await plugin.saveSettings();
    },
    queueSession: async (session) => {
      const service = await plugin.getTerminalService();
      service.queueSession(session);
    },
    openFreshTerminal: () => plugin.openFreshTerminal(),
    noteLocalVersion: plugin.noteLocalVersion,
  };
}

export function renderAgentSettings(containerEl: HTMLElement, plugin: OrcaPluginHost): void {
  containerEl.createEl('h3', { text: t('terminalAgent.agents.heading') });
  containerEl.createEl('p', { text: t('terminalAgent.agents.intro') });

  new Setting(containerEl)
    .setName(t('terminalAgent.agents.permission'))
    .setDesc(t('terminalAgent.agents.permissionDesc'))
    .addDropdown((dropdown) => {
      dropdown
        .addOption('yolo', 'YOLO')
        .addOption('manual', 'Manual')
        .setValue(plugin.settings.agentSettings.globalPermissionMode)
        .onChange(async (value) => {
          plugin.settings.agentSettings.globalPermissionMode = value === 'manual' ? 'manual' : 'yolo';
          await plugin.saveSettings();
        });
    });

  for (const agent of AGENT_CATALOG) {
    const entry = plugin.settings.agentSettings.agents[agent.id];
    new Setting(containerEl)
      .setName(agent.title)
      .setDesc(agent.installDocsUrl)
      .addText((text) => {
        text
          .setPlaceholder(t('terminalAgent.agents.cliPlaceholder'))
          .setValue(entry.cliPath)
          .onChange(async (value) => {
            plugin.settings.agentSettings.agents[agent.id].cliPath = value.trim();
            await plugin.saveSettings();
          });
      })
      .addDropdown((dropdown) => {
        dropdown
          .addOption('inherit', t('terminalAgent.agents.followGlobal'))
          .addOption('yolo', 'YOLO')
          .addOption('manual', 'Manual')
          .setValue(entry.permissionMode)
          .onChange(async (value) => {
            const mode = value === 'yolo' || value === 'manual' ? value : 'inherit';
            plugin.settings.agentSettings.agents[agent.id].permissionMode = mode;
            await plugin.saveSettings();
          });
      })
      .addText((text) => {
        text
          .setPlaceholder(t('terminalAgent.agents.extraPlaceholder'))
          .setValue(entry.extraArgs)
          .onChange(async (value) => {
            plugin.settings.agentSettings.agents[agent.id].extraArgs = value;
            await plugin.saveSettings();
          });
      });

    if (agent.accountKind !== 'none') {
      new Setting(containerEl)
        .setName(t('terminalAgent.agents.account', { title: agent.title }))
        .setDesc(t('terminalAgent.agents.accountDesc'))
        .addText((text) => {
          text
            .setPlaceholder(t('terminalAgent.agents.accountPlaceholder'))
            .setValue(entry.accountId)
            .onChange(async (value) => {
              plugin.settings.agentSettings.agents[agent.id].accountId = value.trim();
              await plugin.saveSettings();
            });
        });
    }

    if (agent.usage !== 'none') {
      new Setting(containerEl)
        .setName(t('terminalAgent.agents.usage', { title: agent.title }))
        .setDesc(t('terminalAgent.agents.usageDesc'))
        .addToggle((toggle) => {
          toggle
            .setValue(entry.showUsage)
            .onChange(async (value) => {
              plugin.settings.agentSettings.agents[agent.id].showUsage = value;
              await plugin.saveSettings();
              refreshUsageStatus?.();
            });
        });
    }
  }

  new Setting(containerEl)
    .setName(t('terminalAgent.agents.status'))
    .setDesc(t('terminalAgent.agents.statusDesc'))
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.agentSettings.showUsageInStatusBar)
        .onChange(async (value) => {
          plugin.settings.agentSettings.showUsageInStatusBar = value;
          await plugin.saveSettings();
          refreshUsageStatus?.();
        });
    });

  new Setting(containerEl)
    .setName(t('terminalAgent.agents.check'))
    .setDesc(t('terminalAgent.agents.checkDesc'))
    .addButton((button) => {
      button.setButtonText(t('terminalAgent.agents.checkButton')).onClick(() => {
        void openUsage(plugin);
      });
    });
}

export function isAgentId(value: string): value is AgentId {
  return AGENT_CATALOG.some((agent) => agent.id === value);
}
