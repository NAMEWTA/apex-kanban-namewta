import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentCatalogEntry } from './catalog';

export function accountConfigDir(kind: 'claude' | 'codex', accountId: string, pluginDataDir: string): string | null {
  const id = accountId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id || !pluginDataDir) return null;
  return path.join(pluginDataDir, 'accounts', kind, id, 'home');
}

export function accountEnv(agent: AgentCatalogEntry, accountId: string, pluginDataDir: string): Record<string, string> {
  if (agent.accountKind === 'none') return {};
  const home = accountConfigDir(agent.accountKind, accountId, pluginDataDir);
  if (!home) return {};
  fs.mkdirSync(home, { recursive: true });
  if (agent.accountKind === 'codex') {
    return { CODEX_HOME: home };
  }
  return { CLAUDE_CONFIG_DIR: home };
}