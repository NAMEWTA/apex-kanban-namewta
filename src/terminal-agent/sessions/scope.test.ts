import assert from 'node:assert/strict';
import test from 'node:test';

import {
  claudeProjectDirInVaultScope,
  encodeClaudeProjectPath,
  encodeClaudeProjectPaths,
  isCwdInsideVault,
  resumeArgs,
  sessionAge,
} from './scope.ts';

test('claude project names keep one dash per separator', () => {
  assert.equal(encodeClaudeProjectPath('/Users/ada/orca/workspaces'), '-Users-ada-orca-workspaces');
  assert.equal(encodeClaudeProjectPath('/Users/ada/.orca/worktrees'), '-Users-ada--orca-worktrees');
  assert.equal(encodeClaudeProjectPath('C:\\Users\\ada\\orca\\workspaces'), 'C--Users-ada-orca-workspaces');
  assert.equal(encodeClaudeProjectPath('C:\\'), 'C--');
  assert.equal(encodeClaudeProjectPath('/Users/ada/orca/'), '-Users-ada-orca');
  assert.equal(encodeClaudeProjectPath('/'), '-');
});

test('claude project names include the NFC spelling when it differs', () => {
  const nfd = '/Users/ada/cafe\u0301';
  assert.deepEqual(encodeClaudeProjectPaths(nfd), [
    encodeClaudeProjectPath(nfd),
    encodeClaudeProjectPath(nfd.normalize('NFC')),
  ]);
  assert.deepEqual(encodeClaudeProjectPaths('/Users/ada/cafe'), ['-Users-ada-cafe']);
});

test('claude buckets follow the vault and not a sibling prefix', () => {
  assert.equal(claudeProjectDirInVaultScope('D--vault', 'D:\\vault', 'win32'), true);
  assert.equal(claudeProjectDirInVaultScope('D--vault-src', 'D:\\vault', 'win32'), true);
  assert.equal(claudeProjectDirInVaultScope('d--vault-src', 'D:\\vault', 'win32'), true);
  assert.equal(claudeProjectDirInVaultScope('D--vault2', 'D:\\vault', 'win32'), false);
  assert.equal(claudeProjectDirInVaultScope('-w-orcadyne', '/w/orca', 'posix'), false);
});

test('a session cwd must be the vault or a directory inside it', () => {
  assert.equal(isCwdInsideVault('D:\\vault', 'D:/vault', 'win32'), true);
  assert.equal(isCwdInsideVault('D:\\vault', 'D:\\vault\\src', 'win32'), true);
  assert.equal(isCwdInsideVault('D:\\vault', 'D:\\vault2', 'win32'), false);
  assert.equal(isCwdInsideVault('/work/nand', '/work/nand/src', 'posix'), true);
  assert.equal(isCwdInsideVault('/work/nand', '/work/nand-other', 'posix'), false);
});

test('resume args keep permission flags and address the right cli', () => {
  assert.deepEqual(resumeArgs('claude-code', 'abc', ['--dangerously-skip-permissions']), [
    '--dangerously-skip-permissions',
    '--resume',
    'abc',
  ]);
  assert.deepEqual(resumeArgs('codex', 'abc', ['--dangerously-bypass-approvals-and-sandbox']), [
    '--dangerously-bypass-approvals-and-sandbox',
    'resume',
    'abc',
  ]);
  assert.deepEqual(resumeArgs('gemini', 'abc', ['--resume', 'old']), ['--resume', 'abc']);
});

test('session age uses minute, hour, and day buckets', () => {
  const now = 1_700_000_000_000;
  assert.deepEqual(sessionAge(now - 10_000, now), { kind: 'now' });
  assert.deepEqual(sessionAge(now - 5 * 60_000, now), { kind: 'minutes', count: 5 });
  assert.deepEqual(sessionAge(now - 3 * 3_600_000, now), { kind: 'hours', count: 3 });
  assert.deepEqual(sessionAge(now - 2 * 86_400_000, now), { kind: 'days', count: 2 });
});
