import assert from 'node:assert/strict';
import test from 'node:test';

import { parseClaudeTranscript, parseCodexTranscript, parseGeminiTranscript } from './parse.ts';

test('claude transcripts keep cwd, id, and the first user line', () => {
  const text = [
    JSON.stringify({
      type: 'user',
      cwd: 'D:\\vault\\src',
      sessionId: 'sess-1',
      message: { role: 'user', content: [{ type: 'text', text: 'Fix the menu\nplease' }] },
    }),
    JSON.stringify({ type: 'assistant', message: { content: 'ok' } }),
  ].join('\n');
  assert.deepEqual(parseClaudeTranscript(text, false), {
    cwd: 'D:\\vault\\src',
    sessionId: 'sess-1',
    title: 'Fix the menu please',
    messageCount: 2,
  });
});

test('an empty claude file is not a session', () => {
  assert.equal(parseClaudeTranscript('{"type":"summary","cwd":"D:\\\\vault"}\n', false).messageCount, 0);
});

test('codex transcripts read session_meta and the first user message', () => {
  const text = [
    JSON.stringify({ type: 'session_meta', payload: { id: 'codex-1', cwd: 'D:\\vault' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'resume me' } }),
  ].join('\n');
  const parsed = parseCodexTranscript(text, false);
  assert.equal(parsed.sessionId, 'codex-1');
  assert.equal(parsed.cwd, 'D:\\vault');
  assert.equal(parsed.title, 'resume me');
  assert.equal(parsed.messageCount, 1);
});

test('gemini chat documents use the first user turn', () => {
  const text = JSON.stringify({
    sessionId: 'gem-1',
    messages: [
      { type: 'user', content: 'hello vault' },
      { type: 'gemini', content: [{ text: 'hi' }] },
    ],
  });
  const parsed = parseGeminiTranscript(text, false);
  assert.equal(parsed.sessionId, 'gem-1');
  assert.equal(parsed.title, 'hello vault');
  assert.equal(parsed.messageCount, 2);
});
