import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { cachedVaultSessions, resetVaultSessionCache, scanVaultSessions } from './scan.ts';
import type { SessionIo } from './types.ts';

const pathApi = path.win32;

test('vault scan keeps claude, codex, and gemini sessions inside the vault', async () => {
  resetVaultSessionCache();
  const vault = 'D:\\vault';
  const files = new Map<string, { text: string; mtimeMs: number }>();
  const dirs = new Set<string>();

  const claudeRoot = 'C:\\Users\\ada\\.claude';
  const claudeProjects = pathApi.join(claudeRoot, 'projects');
  const vaultBucket = pathApi.join(claudeProjects, 'D--vault');
  const childBucket = pathApi.join(claudeProjects, 'D--vault-src');
  const otherBucket = pathApi.join(claudeProjects, 'D--other');
  dirs.add(claudeProjects);
  dirs.add(vaultBucket);
  dirs.add(childBucket);
  dirs.add(otherBucket);
  files.set(pathApi.join(vaultBucket, 'sess-vault.jsonl'), {
    mtimeMs: 30,
    text: `${JSON.stringify({ type: 'user', cwd: vault, sessionId: 'sess-vault', message: { content: 'in vault' } })}\n`,
  });
  files.set(pathApi.join(childBucket, 'sess-child.jsonl'), {
    mtimeMs: 20,
    text: `${JSON.stringify({ type: 'user', cwd: 'D:\\vault\\src', sessionId: 'sess-child', message: { content: 'child' } })}\n`,
  });
  files.set(pathApi.join(otherBucket, 'sess-other.jsonl'), {
    mtimeMs: 40,
    text: `${JSON.stringify({ type: 'user', cwd: 'D:\\other', sessionId: 'sess-other', message: { content: 'nope' } })}\n`,
  });

  const codexRoot = 'C:\\Users\\ada\\.codex';
  const day = pathApi.join(codexRoot, 'sessions', '2026', '09', '25');
  dirs.add(pathApi.join(codexRoot, 'sessions'));
  dirs.add(pathApi.join(codexRoot, 'sessions', '2026'));
  dirs.add(pathApi.join(codexRoot, 'sessions', '2026', '09'));
  dirs.add(day);
  files.set(pathApi.join(day, 'rollout.jsonl'), {
    mtimeMs: 50,
    text: [
      JSON.stringify({ type: 'session_meta', payload: { id: 'codex-vault', cwd: 'D:\\vault\\notes' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'codex note' } }),
    ].join('\n'),
  });
  files.set(pathApi.join(day, 'outside.jsonl'), {
    mtimeMs: 60,
    text: [
      JSON.stringify({ type: 'session_meta', payload: { id: 'codex-out', cwd: 'D:\\other' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'outside' } }),
    ].join('\n'),
  });

  const geminiRoot = 'C:\\Users\\ada\\.gemini';
  const chats = pathApi.join(geminiRoot, 'tmp', 'nand', 'chats');
  dirs.add(pathApi.join(geminiRoot, 'tmp'));
  dirs.add(pathApi.join(geminiRoot, 'tmp', 'nand'));
  dirs.add(chats);
  files.set(pathApi.join(geminiRoot, 'projects.json'), {
    mtimeMs: 1,
    text: JSON.stringify({ projects: { 'D:\\vault': 'nand', 'D:\\other': 'other' } }),
  });
  files.set(pathApi.join(chats, 'gem.json'), {
    mtimeMs: 10,
    text: JSON.stringify({
      sessionId: 'gem-1',
      messages: [{ type: 'user', content: 'gemini vault' }],
    }),
  });

  const io = fakeIo(files, dirs);
  const sessions = await scanVaultSessions({
    key: 'vault-test',
    vaultPath: vault,
    io,
    claudeConfigDirs: [],
    codexHomes: [],
  });
  const ids = sessions.map((session) => session.sessionId);
  assert.deepEqual(ids, ['codex-vault', 'sess-vault', 'sess-child', 'gem-1']);
  assert.equal(sessions[0]?.env.CODEX_HOME, codexRoot);
  assert.equal(sessions.find((session) => session.sessionId === 'sess-vault')?.env.CLAUDE_CONFIG_DIR, claudeRoot);
  assert.equal(sessions.find((session) => session.sessionId === 'gem-1')?.cwd, 'D:\\vault');

  assert.equal(cachedVaultSessions('vault-test')?.length, 4);
});

function fakeIo(files: Map<string, { text: string; mtimeMs: number }>, dirs: Set<string>): SessionIo {
  return {
    platform: 'win32',
    homedir: () => 'C:\\Users\\ada',
    env: () => undefined,
    async readDir(dir) {
      const prefix = dir.endsWith('\\') ? dir : `${dir}\\`;
      const names = new Set<string>();
      for (const filePath of files.keys()) {
        if (!filePath.startsWith(prefix)) continue;
        const rest = filePath.slice(prefix.length);
        const name = rest.split('\\')[0];
        if (name) names.add(name);
      }
      for (const dirPath of dirs) {
        if (!dirPath.startsWith(prefix)) continue;
        const rest = dirPath.slice(prefix.length);
        const name = rest.split('\\')[0];
        if (name) names.add(name);
      }
      return [...names];
    },
    async stat(file) {
      if (dirs.has(file)) {
        return { isDirectory: true, isFile: false, mtimeMs: 0, size: 0 };
      }
      const found = files.get(file);
      if (!found) return null;
      return { isDirectory: false, isFile: true, mtimeMs: found.mtimeMs, size: Buffer.byteLength(found.text) };
    },
    async readFile(file, maxBytes) {
      const found = files.get(file);
      if (!found) return null;
      return Buffer.from(found.text).subarray(0, maxBytes).toString('utf8');
    },
  };
}
