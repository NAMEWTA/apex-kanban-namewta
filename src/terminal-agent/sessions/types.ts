export type VaultSessionAgent = 'claude-code' | 'codex' | 'gemini';

export interface VaultSession {
  agentId: VaultSessionAgent;
  title: string;
  cwd: string;
  sessionId: string;
  modifiedAtMs: number;
  env: Record<string, string>;
}

export interface SessionIo {
  platform: NodeJS.Platform;
  homedir(): string;
  env(name: string): string | undefined;
  readDir(dir: string): Promise<string[]>;
  stat(file: string): Promise<{ isDirectory: boolean; isFile: boolean; mtimeMs: number; size: number } | null>;
  readFile(file: string, maxBytes: number): Promise<string | null>;
}

export interface VaultScanRequest {
  key: string;
  vaultPath: string;
  io: SessionIo;
  claudeConfigDirs: readonly string[];
  codexHomes: readonly string[];
}
