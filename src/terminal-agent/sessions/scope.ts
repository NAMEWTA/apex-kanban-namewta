/**
 * Claude project-directory names follow the CLI's own encoding.
 * Adapted from Orca (MIT). Copyright (c) 2026 Lovecast Inc.
 */
import path from 'node:path';

export function encodeClaudeProjectPaths(pathValue: string): string[] {
  const raw = encodeClaudeProjectPath(pathValue);
  const composed = encodeClaudeProjectPath(pathValue.normalize('NFC'));
  return raw === composed ? [raw] : [raw, composed];
}

/** One dash per non-alphanumeric character. Runs are not collapsed. */
export function encodeClaudeProjectPath(pathValue: string): string {
  const trimmed = stripTrailingSeparators(pathValue);
  return trimmed.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * A bucket matches the vault encoding itself or a dash-delimited descendant.
 * `…/nand` must not claim `…/nand2`.
 */
export function claudeProjectDirInVaultScope(
  projectDirName: string,
  vaultPath: string,
  platform: NodeJS.Platform,
): boolean {
  const fold = (value: string) => platform === 'win32' ? value.toLowerCase() : value;
  const name = fold(projectDirName);
  return encodeClaudeProjectPaths(vaultPath).some((prefix) => {
    const folded = fold(prefix);
    return name === folded || name.startsWith(`${folded}-`);
  });
}

export function isCwdInsideVault(
  vaultPath: string,
  cwd: string,
  platform: NodeJS.Platform,
): boolean {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const root = foldPath(stripTrailingSep(pathApi.normalize(vaultPath), pathApi.sep), platform);
  const target = foldPath(stripTrailingSep(pathApi.normalize(cwd), pathApi.sep), platform);
  if (!root || !target) return false;
  if (target === root) return true;
  const withSep = root.endsWith(pathApi.sep) ? root : `${root}${pathApi.sep}`;
  return target.startsWith(withSep);
}

export function resumeArgs(agentId: 'claude-code' | 'codex' | 'gemini', sessionId: string, launch: readonly string[]): string[] {
  const flags: string[] = [];
  for (let index = 0; index < launch.length; index += 1) {
    const arg = launch[index] ?? '';
    if (arg === '--resume' || arg === '-r' || arg.startsWith('--resume=')) {
      const next = launch[index + 1];
      if ((arg === '--resume' || arg === '-r') && next && !next.startsWith('-')) index += 1;
      continue;
    }
    flags.push(arg);
  }
  if (agentId === 'codex') return [...flags, 'resume', sessionId];
  return [...flags, '--resume', sessionId];
}

export type SessionAge =
  | { kind: 'now' }
  | { kind: 'minutes'; count: number }
  | { kind: 'hours'; count: number }
  | { kind: 'days'; count: number };

export function sessionAge(modifiedAtMs: number, now: number): SessionAge {
  const elapsed = Math.max(0, now - modifiedAtMs);
  const minutes = Math.round(elapsed / 60_000);
  if (minutes < 1) return { kind: 'now' };
  if (minutes < 60) return { kind: 'minutes', count: minutes };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { kind: 'hours', count: hours };
  return { kind: 'days', count: Math.round(hours / 24) };
}

function stripTrailingSeparators(pathValue: string): string {
  if (pathValue === '/' || /^[A-Za-z]:[\\/]$/.test(pathValue)) return pathValue;
  return pathValue.replace(/[\\/]+$/, '');
}

function stripTrailingSep(value: string, sep: string): string {
  if (value === sep || /^[A-Za-z]:\\$/.test(value)) return value;
  const pattern = sep === '\\' ? /\\+$/ : /\/+$/;
  return value.replace(pattern, '');
}

function foldPath(value: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? value.toLowerCase() : value;
}
