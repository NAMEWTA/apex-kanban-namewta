import { Modal, Notice, type App } from 'obsidian';
import { t } from '../i18n';
import { resumeArgs } from '../sessions/scope';
import type { VaultSession } from '../sessions/types';
import { accountEnv } from './accounts';
import { getAgent } from './catalog';
import { launchArgs } from './flags';
import { resolveCli } from './resolver';
import { probeCommandVersion } from '../terminal/command-version-probe';
import type { AgentId, AgentSettings } from './types';
import type { PendingTerminalSession } from './types';

export interface LaunchHost {
  app: App;
  getVaultPath: () => string | undefined;
  getPluginDataDir: () => string;
  getAgentSettings: () => AgentSettings;
  saveAgentSettings: (settings: AgentSettings) => Promise<void>;
  queueSession: (session: PendingTerminalSession) => void | Promise<void>;
  openFreshTerminal: () => Promise<void>;
  noteLocalVersion?: (agentId: AgentId, version: string | null) => void;
}

export async function launchAgent(host: LaunchHost, agentId: AgentId): Promise<void> {
  const settings = host.getAgentSettings();
  const entry = settings.agents[agentId];
  if (!entry?.enabled) {
    new Notice(`${getAgent(agentId).title} 已在设置中关闭`);
    return;
  }

  if (needsYoloConfirm(settings, agentId)) {
    const accepted = await confirmYolo(host.app);
    if (!accepted) return;
    settings.yoloAcknowledged = true;
    await host.saveAgentSettings(settings);
  }

  const agent = getAgent(agentId);
  const command = resolveCli(agent.detectCommand, entry.cliPath, '');
  if (!command) {
    new Notice(`未找到 ${agent.title}。请先安装 CLI，或在智能体设置里填写绝对路径。${agent.installDocsUrl}`);
    return;
  }

  const cwd = host.getVaultPath();
  if (!cwd) {
    new Notice('无法取得当前库路径，已取消启动');
    return;
  }

  const probed = await probeCommandVersion(command).catch(() => null);
  host.noteLocalVersion?.(agentId, probed?.version ?? null);

  await host.queueSession({
    shellType: `custom:${command}`,
    shellArgs: launchArgs(settings, agentId),
    cwd,
    env: {
      ...accountEnv(agent, entry.accountId, host.getPluginDataDir()),
      TERM: 'xterm-256color',
    },
    title: agent.title,
  });
  await host.openFreshTerminal();
}

export async function resumeAgent(host: LaunchHost, session: VaultSession): Promise<void> {
  const settings = host.getAgentSettings();
  const entry = settings.agents[session.agentId];
  const agent = getAgent(session.agentId);
  if (!entry?.enabled) {
    new Notice(t('sessions.disabled', { title: agent.title }));
    return;
  }

  if (needsYoloConfirm(settings, session.agentId)) {
    const accepted = await confirmYolo(host.app);
    if (!accepted) return;
    settings.yoloAcknowledged = true;
    await host.saveAgentSettings(settings);
  }

  const command = resolveCli(agent.detectCommand, entry.cliPath, '');
  if (!command) {
    new Notice(t('sessions.missingCli', { title: agent.title }));
    return;
  }

  await host.queueSession({
    shellType: `custom:${command}`,
    shellArgs: resumeArgs(session.agentId, session.sessionId, launchArgs(settings, session.agentId)),
    cwd: session.cwd,
    env: {
      ...accountEnv(agent, entry.accountId, host.getPluginDataDir()),
      ...session.env,
      TERM: 'xterm-256color',
    },
    title: session.title || agent.title,
  });
  await host.openFreshTerminal();
}

export async function launchShell(host: LaunchHost, shellType: string, title: string): Promise<void> {
  const cwd = host.getVaultPath();
  await host.queueSession({
    shellType,
    cwd,
    title,
    env: { TERM: 'xterm-256color' },
  });
  await host.openFreshTerminal();
}

function needsYoloConfirm(settings: AgentSettings, agentId: AgentId): boolean {
  if (settings.yoloAcknowledged) return false;
  const mode = settings.agents[agentId]?.permissionMode ?? 'inherit';
  const effective = mode === 'inherit' ? settings.globalPermissionMode : mode;
  return effective === 'yolo' && launchArgs(settings, agentId).length > 0;
}

function confirmYolo(app: App): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new YoloConfirmModal(app, resolve);
    modal.open();
  });
}

class YoloConfirmModal extends Modal {
  private settled = false;

  constructor(app: App, private readonly choose: (accepted: boolean) => void) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'YOLO 会直接修改当前库' });
    contentEl.createEl('p', {
      text: '没有隔离 worktree。智能体以 YOLO 启动时会跳过确认，直接读写这个库。你可以随时在设置里改成 Manual。',
    });
    const row = contentEl.createDiv({ cls: 'modal-button-container' });
    const cancel = row.createEl('button', { text: '取消' });
    const ok = row.createEl('button', { text: '我知道，继续', cls: 'mod-warning' });
    cancel.addEventListener('click', () => this.finish(false));
    ok.addEventListener('click', () => this.finish(true));
  }

  onClose(): void {
    this.finish(false, true);
  }

  private finish(accepted: boolean, fromClose = false): void {
    if (this.settled) return;
    this.settled = true;
    this.choose(accepted);
    if (!fromClose) this.close();
  }
}
