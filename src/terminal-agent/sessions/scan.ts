import { createHash } from 'node:crypto';
import path from 'node:path';
import { debugLog } from '../logger';
import { parseClaudeTranscript, parseCodexTranscript, parseGeminiTranscript } from './parse';
import { claudeProjectDirInVaultScope, isCwdInsideVault } from './scope';
import type { SessionIo, VaultScanRequest, VaultSession, VaultSessionAgent } from './types';

const CACHE_MS = 20_000;
const SESSION_LIMIT = 40;
const READ_BYTES = 128 * 1024;
const CODEX_FILE_CAP = 200;
const CLAUDE_FILES_PER_DIR = 15;
const GEMINI_FILES_PER_DIR = 15;

let cache: { key: string; at: number; sessions: VaultSession[] } | null = null;

export function cachedVaultSessions(key: string, now = Date.now()): VaultSession[] | null {
  if (!cache || cache.key !== key || now - cache.at > CACHE_MS) return null;
  return cache.sessions;
}

export function resetVaultSessionCache(): void {
  cache = null;
}

export function createNodeSessionIo(): SessionIo {
  const requireNode = window.require;
  const fs = requireNode('fs') as typeof import('fs');
  const os = requireNode('os') as typeof import('os');
  return {
    platform: process.platform,
    homedir: () => os.homedir(),
    env: (name) => process.env[name],
    async readDir(dir) {
      try {
        return await fs.promises.readdir(dir);
      } catch {
        return [];
      }
    },
    async stat(file) {
      try {
        const info = await fs.promises.stat(file);
        return {
          isDirectory: info.isDirectory(),
          isFile: info.isFile(),
          mtimeMs: info.mtimeMs,
          size: info.size,
        };
      } catch {
        return null;
      }
    },
    async readFile(file, maxBytes) {
      let handle: import('fs').promises.FileHandle | null = null;
      try {
        handle = await fs.promises.open(file, 'r');
        const buffer = Buffer.alloc(maxBytes);
        const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
        return buffer.subarray(0, bytesRead).toString('utf8');
      } catch {
        return null;
      } finally {
        await handle?.close();
      }
    },
  };
}

export async function scanVaultSessions(request: VaultScanRequest, now = Date.now()): Promise<VaultSession[]> {
  const sessions = (await Promise.all([
    collectSafely('claude', () => scanClaude(request)),
    collectSafely('codex', () => scanCodex(request)),
    collectSafely('gemini', () => scanGemini(request)),
  ])).flat();
  const unique = dedupeSessions(sessions);
  unique.sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
  const limited = unique.slice(0, SESSION_LIMIT);
  cache = { key: request.key, at: now, sessions: limited };
  return limited;
}

async function collectSafely(agent: string, read: () => Promise<VaultSession[]>): Promise<VaultSession[]> {
  try {
    return await read();
  } catch (error) {
    debugLog(`[vault-sessions] ${agent} scan failed`, error);
    return [];
  }
}

async function scanClaude(request: VaultScanRequest): Promise<VaultSession[]> {
  const pathApi = pathFor(request.io.platform);
  const roots = uniquePaths([
    pathApi.join(request.io.homedir(), '.claude'),
    ...request.claudeConfigDirs,
  ], request.io.platform);
  const found: VaultSession[] = [];
  for (const root of roots) {
    const projectRoot = pathApi.join(root, 'projects');
    const names = await request.io.readDir(projectRoot);
    for (const name of names) {
      if (!claudeProjectDirInVaultScope(name, request.vaultPath, request.io.platform)) continue;
      const dir = pathApi.join(projectRoot, name);
      const info = await request.io.stat(dir);
      if (!info?.isDirectory) continue;
      const files = await newestJsonl(request.io, dir, CLAUDE_FILES_PER_DIR);
      for (const file of files) {
        const session = await readTranscript(request, file, 'claude-code', root, 'CLAUDE_CONFIG_DIR');
        if (session) found.push(session);
      }
    }
  }
  return found;
}

async function scanCodex(request: VaultScanRequest): Promise<VaultSession[]> {
  const pathApi = pathFor(request.io.platform);
  const envHome = request.io.env('CODEX_HOME')?.trim();
  const roots = uniquePaths([
    envHome || pathApi.join(request.io.homedir(), '.codex'),
    ...request.codexHomes,
  ], request.io.platform);
  const found: VaultSession[] = [];
  for (const root of roots) {
    const files = await newestCodexFiles(request.io, pathApi.join(root, 'sessions'), CODEX_FILE_CAP);
    for (const file of files) {
      const session = await readTranscript(request, file, 'codex', root, 'CODEX_HOME');
      if (session) found.push(session);
    }
  }
  return found;
}

async function scanGemini(request: VaultScanRequest): Promise<VaultSession[]> {
  const pathApi = pathFor(request.io.platform);
  const root = pathApi.join(request.io.homedir(), '.gemini');
  const projects = await geminiProjects(request, root);
  const found: VaultSession[] = [];
  for (const project of projects) {
    const files = await newestChatFiles(request.io, pathApi.join(root, 'tmp', project.slug, 'chats'), GEMINI_FILES_PER_DIR);
    for (const file of files) {
      const loaded = await readCapped(request.io, file.path);
      if (!loaded) continue;
      const parsed = parseGeminiTranscript(loaded.text, loaded.truncated);
      if (parsed.messageCount <= 0) continue;
      const sessionId = parsed.sessionId || sessionIdFromFile(file.path, request.io.platform);
      if (!sessionId) continue;
      found.push({
        agentId: 'gemini',
        title: parsed.title || sessionId,
        cwd: project.cwd,
        sessionId,
        modifiedAtMs: loaded.mtimeMs,
        env: {},
      });
    }
  }
  return found;
}

async function geminiProjects(request: VaultScanRequest, root: string): Promise<Array<{ slug: string; cwd: string }>> {
  const pathApi = pathFor(request.io.platform);
  const projects = new Map<string, string>();
  const registryText = await request.io.readFile(pathApi.join(root, 'projects.json'), 1024 * 1024);
  if (registryText) {
    try {
      const parsed = JSON.parse(registryText) as { projects?: Record<string, unknown> };
      const entries = parsed.projects ?? {};
      for (const [projectPath, slug] of Object.entries(entries)) {
        if (typeof slug !== 'string' || !slug) continue;
        if (!isCwdInsideVault(request.vaultPath, projectPath, request.io.platform)) continue;
        projects.set(slug, projectPath);
      }
    } catch {
      debugLog('[vault-sessions] gemini projects.json was not readable');
    }
  }
  const legacy = createHash('sha256').update(request.vaultPath).digest('hex');
  if (!projects.has(legacy)) {
    const marker = await request.io.readFile(pathApi.join(root, 'tmp', legacy, '.project_root'), 4096);
    const cwd = marker?.trim() || request.vaultPath;
    if (isCwdInsideVault(request.vaultPath, cwd, request.io.platform)) {
      const dir = await request.io.stat(pathApi.join(root, 'tmp', legacy));
      if (dir?.isDirectory) projects.set(legacy, cwd);
    }
  }
  if (projects.size === 0) {
    const tmpNames = await request.io.readDir(pathApi.join(root, 'tmp'));
    for (const slug of tmpNames) {
      if (projects.size >= 32) break;
      const marker = await request.io.readFile(pathApi.join(root, 'tmp', slug, '.project_root'), 4096);
      const cwd = marker?.trim();
      if (!cwd || !isCwdInsideVault(request.vaultPath, cwd, request.io.platform)) continue;
      projects.set(slug, cwd);
    }
  }
  return [...projects.entries()].map(([slug, cwd]) => ({ slug, cwd }));
}

async function readTranscript(
  request: VaultScanRequest,
  file: { path: string; mtimeMs: number },
  agentId: VaultSessionAgent,
  home: string,
  envName: 'CLAUDE_CONFIG_DIR' | 'CODEX_HOME',
): Promise<VaultSession | null> {
  const loaded = await readCapped(request.io, file.path);
  if (!loaded) return null;
  const parsed = agentId === 'codex'
    ? parseCodexTranscript(loaded.text, loaded.truncated)
    : parseClaudeTranscript(loaded.text, loaded.truncated);
  if (parsed.messageCount <= 0 || !parsed.cwd) return null;
  if (!isCwdInsideVault(request.vaultPath, parsed.cwd, request.io.platform)) return null;
  const sessionId = parsed.sessionId || sessionIdFromFile(file.path, request.io.platform);
  if (!sessionId) return null;
  return {
    agentId,
    title: parsed.title || sessionId,
    cwd: parsed.cwd,
    sessionId,
    modifiedAtMs: file.mtimeMs || loaded.mtimeMs,
    env: { [envName]: home },
  };
}

async function readCapped(
  io: SessionIo,
  filePath: string,
): Promise<{ text: string; truncated: boolean; mtimeMs: number } | null> {
  const info = await io.stat(filePath);
  if (!info?.isFile) return null;
  const text = await io.readFile(filePath, READ_BYTES);
  if (text === null) return null;
  return { text, truncated: info.size > Buffer.byteLength(text), mtimeMs: info.mtimeMs };
}

async function newestJsonl(io: SessionIo, dir: string, limit: number): Promise<Array<{ path: string; mtimeMs: number }>> {
  const pathApi = pathFor(io.platform);
  const names = await io.readDir(dir);
  const files: Array<{ path: string; mtimeMs: number }> = [];
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const filePath = pathApi.join(dir, name);
    const info = await io.stat(filePath);
    if (!info?.isFile) continue;
    files.push({ path: filePath, mtimeMs: info.mtimeMs });
  }
  files.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return files.slice(0, limit);
}

async function newestChatFiles(io: SessionIo, dir: string, limit: number): Promise<Array<{ path: string; mtimeMs: number }>> {
  const pathApi = pathFor(io.platform);
  const names = await io.readDir(dir);
  const files: Array<{ path: string; mtimeMs: number }> = [];
  for (const name of names) {
    if (!name.endsWith('.json') && !name.endsWith('.jsonl')) continue;
    const filePath = pathApi.join(dir, name);
    const info = await io.stat(filePath);
    if (!info?.isFile) continue;
    files.push({ path: filePath, mtimeMs: info.mtimeMs });
  }
  files.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return files.slice(0, limit);
}

async function newestCodexFiles(
  io: SessionIo,
  sessionsRoot: string,
  limit: number,
): Promise<Array<{ path: string; mtimeMs: number }>> {
  const files: Array<{ path: string; mtimeMs: number }> = [];
  const years = (await directories(io, sessionsRoot)).sort(descendingName);
  for (const year of years) {
    const months = (await directories(io, year)).sort(descendingName);
    for (const month of months) {
      const days = (await directories(io, month)).sort(descendingName);
      for (const day of days) {
        files.push(...await newestJsonl(io, day, limit));
        if (files.length >= limit) {
          files.sort((left, right) => right.mtimeMs - left.mtimeMs);
          return files.slice(0, limit);
        }
      }
    }
    const loose = await newestJsonl(io, year, limit);
    if (loose.length > 0) files.push(...loose);
  }
  const rootFiles = await newestJsonl(io, sessionsRoot, limit);
  files.push(...rootFiles);
  files.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return files.slice(0, limit);
}

async function directories(io: SessionIo, dir: string): Promise<string[]> {
  const pathApi = pathFor(io.platform);
  const names = await io.readDir(dir);
  const found: string[] = [];
  for (const name of names) {
    const child = pathApi.join(dir, name);
    const info = await io.stat(child);
    if (info?.isDirectory) found.push(child);
  }
  return found;
}

function descendingName(left: string, right: string): number {
  return right.localeCompare(left);
}

function sessionIdFromFile(filePath: string, platform: NodeJS.Platform): string | null {
  const pathApi = pathFor(platform);
  const base = pathApi.basename(filePath).replace(/\.jsonl?$/i, '');
  return base || null;
}

function dedupeSessions(sessions: VaultSession[]): VaultSession[] {
  const seen = new Set<string>();
  const result: VaultSession[] = [];
  for (const session of sessions) {
    const key = `${session.agentId}:${session.sessionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(session);
  }
  return result;
}

function uniquePaths(values: readonly string[], platform: NodeJS.Platform): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = platform === 'win32' ? trimmed.toLowerCase() : trimmed;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function pathFor(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}
