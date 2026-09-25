export interface ParsedTranscript {
  cwd: string | null;
  sessionId: string | null;
  title: string | null;
  messageCount: number;
}

const TITLE_LIMIT = 72;

export function parseClaudeTranscript(text: string, truncated: boolean): ParsedTranscript {
  let cwd: string | null = null;
  let sessionId: string | null = null;
  let title: string | null = null;
  let messageCount = 0;
  for (const line of completeLines(text, truncated)) {
    const record = parseRecord(line);
    if (!record) continue;
    if (typeof record.cwd === 'string' && record.cwd) cwd = record.cwd;
    if (typeof record.sessionId === 'string' && record.sessionId) sessionId = record.sessionId;
    if (record.type !== 'user' && record.type !== 'assistant') continue;
    messageCount += 1;
    if (record.type === 'user' && !title) {
      const message = asRecord(record.message);
      title = oneLineTitle(contentText(message?.content) || contentText(record.content));
    }
  }
  return { cwd, sessionId, title, messageCount };
}

export function parseCodexTranscript(text: string, truncated: boolean): ParsedTranscript {
  let cwd: string | null = null;
  let sessionId: string | null = null;
  let title: string | null = null;
  let messageCount = 0;
  for (const line of completeLines(text, truncated)) {
    const record = parseRecord(line);
    if (!record) continue;
    const payload = asRecord(record.payload);
    if (record.type === 'session_meta' && payload) {
      if (typeof payload.cwd === 'string' && payload.cwd) cwd = payload.cwd;
      if (typeof payload.id === 'string' && payload.id) sessionId = payload.id;
    }
    if (typeof record.cwd === 'string' && record.cwd && !cwd) cwd = record.cwd;
    if (record.type === 'event_msg' && payload?.type === 'user_message' && typeof payload.message === 'string') {
      messageCount += 1;
      title ??= oneLineTitle(payload.message);
      continue;
    }
    if (record.type === 'response_item' && payload?.type === 'message' && payload.role === 'user') {
      messageCount += 1;
      title ??= oneLineTitle(contentText(payload.content));
    }
  }
  return { cwd, sessionId, title, messageCount };
}

export function parseGeminiTranscript(text: string, truncated: boolean): ParsedTranscript {
  const trimmed = text.trim();
  if (!truncated && trimmed.startsWith('{')) {
    const record = parseRecord(trimmed);
    if (record) return geminiDocument(record);
  }
  if (trimmed.startsWith('{')) return geminiPrefix(text);
  return parseGeminiJsonl(text, truncated);
}

export function oneLineTitle(value: string): string | null {
  const line = value.replace(/\s+/g, ' ').trim();
  if (!line) return null;
  if (line.length <= TITLE_LIMIT) return line;
  return `${line.slice(0, TITLE_LIMIT - 1)}…`;
}

function parseGeminiJsonl(text: string, truncated: boolean): ParsedTranscript {
  let sessionId: string | null = null;
  let title: string | null = null;
  let messageCount = 0;
  for (const line of completeLines(text, truncated)) {
    const record = parseRecord(line);
    if (!record) continue;
    if (typeof record.sessionId === 'string' && record.sessionId) sessionId = record.sessionId;
    const kind = record.type === 'user' || record.type === 'gemini' ? record.type : null;
    if (!kind) continue;
    messageCount += 1;
    if (kind === 'user' && !title) title = oneLineTitle(contentText(record.content));
  }
  return { cwd: null, sessionId, title, messageCount };
}

function geminiDocument(record: Record<string, unknown>): ParsedTranscript {
  let title: string | null = null;
  let messageCount = 0;
  const messages = Array.isArray(record.messages) ? record.messages : [];
  for (const message of messages) {
    const entry = asRecord(message);
    if (!entry) continue;
    if (entry.type !== 'user' && entry.type !== 'gemini') continue;
    messageCount += 1;
    if (entry.type === 'user' && !title) title = oneLineTitle(contentText(entry.content));
  }
  return {
    cwd: null,
    sessionId: typeof record.sessionId === 'string' ? record.sessionId : null,
    title,
    messageCount,
  };
}

function geminiPrefix(text: string): ParsedTranscript {
  const sessionId = /"sessionId"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? null;
  const userHits = text.match(/"type"\s*:\s*"user"/g);
  const assistantHits = text.match(/"type"\s*:\s*"gemini"/g);
  const messageCount = (userHits?.length ?? 0) + (assistantHits?.length ?? 0);
  const quoted = /"type"\s*:\s*"user"[\s\S]{0,500}?"(?:text|content)"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(text);
  const title = quoted?.[1] ? oneLineTitle(unescapeJson(quoted[1])) : null;
  return { cwd: null, sessionId, title, messageCount };
}

function unescapeJson(value: string): string {
  return value.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function completeLines(text: string, truncated: boolean): string[] {
  const lines = text.split(/\r?\n/);
  if (truncated && lines.length > 0 && !text.endsWith('\n')) lines.pop();
  return lines;
}

function parseRecord(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return asRecord(JSON.parse(trimmed) as unknown);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((entry) => contentText(entry)).filter((entry) => entry.length > 0).join(' ');
  const record = asRecord(value);
  if (!record) return '';
  if (typeof record.text === 'string') return record.text;
  if ('content' in record) return contentText(record.content);
  return '';
}
