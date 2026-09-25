import * as fs from 'node:fs';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import { t } from '../../shared/i18n';
import { getAgent } from './catalog';
import type { AgentId, UsageKind, UsageSnapshot, UsageWindow } from './types';

const REQUEST_TIMEOUT_MS = 10_000;

type ProviderSnapshot = Omit<UsageSnapshot, 'agentId' | 'failed'>;

const READERS: Partial<Record<UsageKind, () => Promise<ProviderSnapshot>>> = {
  claude: readClaudeUsage,
  codex: readCodexUsage,
  grok: readGrokUsage,
  gemini: readGeminiUsage,
  opencode: readOpenCodeUsage,
  kimi: readKimiUsage,
  antigravity: readAntigravityUsage,
  minimax: readMiniMaxUsage,
};

export async function readUsageSnapshots(enabled: readonly AgentId[]): Promise<UsageSnapshot[]> {
  const jobs: Array<Promise<UsageSnapshot>> = [];
  for (const id of enabled) {
    const agent = getAgent(id);
    const read = READERS[agent.usage];
    if (!read) continue;
    jobs.push(safeRead(id, read));
  }
  return Promise.all(jobs);
}

export function primaryUsageWindow(snapshot: UsageSnapshot): UsageWindow | null {
  const quota = snapshot.windows.find((window) => window.name === '每周')
    ?? snapshot.windows.find((window) => window.name === '每月')
    ?? snapshot.windows.find((window) => window.usedPct !== null);
  if (!quota || quota.usedPct === null) return null;
  return quota;
}

export function remainingPercent(window: UsageWindow): number {
  return Math.max(0, Math.min(100, Math.round(100 - (window.usedPct ?? 0))));
}

export function formatUsageChip(snapshot: UsageSnapshot): string | null {
  const quota = primaryUsageWindow(snapshot);
  if (!quota) return null;
  return `${remainingPercent(quota)}%`;
}

async function safeRead(agentId: AgentId, read: () => Promise<ProviderSnapshot>): Promise<UsageSnapshot> {
  const provider = getAgent(agentId).title;
  try {
    const snapshot = await read();
    return { ...snapshot, agentId, provider, failed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : t('terminalAgent.agents.readFailed');
    return { agentId, provider, account: null, status: message, failed: true, windows: [] };
  }
}

async function readClaudeUsage(): Promise<ProviderSnapshot> {
  const credentialsPath = path.join(os.homedir(), '.claude', '.credentials.json');
  const credentials = readJson(credentialsPath);
  const oauth = asRecord(credentials?.claudeAiOauth);
  const token = typeof oauth?.accessToken === 'string' ? oauth.accessToken : '';
  if (!token) {
    return { provider: 'Claude', account: null, status: t('terminalAgent.agents.notSignedIn'), windows: [] };
  }
  const data = await requestJson('https://api.anthropic.com/api/oauth/usage', {
    Authorization: `Bearer ${token}`,
    'anthropic-beta': 'oauth-2025-04-20',
    'User-Agent': 'claude-code/2.1.0',
    Accept: 'application/json',
  });
  const windows = [
    mapPercentWindow('5小时', asRecord(data.five_hour), ['utilization', 'used_percentage']),
    mapPercentWindow('每周', asRecord(data.seven_day), ['utilization', 'used_percentage']),
  ].filter((window): window is UsageWindow => window !== null);
  return {
    provider: 'Claude',
    account: null,
    status: windows.length > 0 ? t('terminalAgent.agents.readOk') : t('terminalAgent.agents.noNumbers'),
    windows,
  };
}

async function readCodexUsage(): Promise<ProviderSnapshot> {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const auth = readJson(path.join(home, 'auth.json'));
  const tokens = asRecord(auth?.tokens);
  const accessToken = typeof tokens?.access_token === 'string' ? tokens.access_token : '';
  if (!accessToken) {
    return { provider: 'Codex', account: null, status: t('terminalAgent.agents.notSignedIn'), windows: [] };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'codex-cli',
    'OpenAI-Beta': 'codex-1',
    originator: 'Codex Desktop',
    Accept: 'application/json',
  };
  if (typeof tokens?.account_id === 'string' && tokens.account_id) {
    headers['ChatGPT-Account-Id'] = tokens.account_id;
  }
  const data = await requestJson('https://chatgpt.com/backend-api/wham/usage', headers);
  const rateLimit = asRecord(data.rate_limit);
  const windows = [
    mapCodexWindow(asRecord(rateLimit?.primary_window)),
    mapCodexWindow(asRecord(rateLimit?.secondary_window)),
  ].filter((window): window is UsageWindow => window !== null);
  const plan = typeof data.plan_type === 'string' ? data.plan_type : null;
  return {
    provider: 'Codex',
    account: plan,
    status: windows.length > 0 ? t('terminalAgent.agents.readOk') : t('terminalAgent.agents.noNumbers'),
    windows,
  };
}

async function readGrokUsage(): Promise<ProviderSnapshot> {
  const session = readGrokSession();
  if (!session) {
    return { provider: 'Grok', account: null, status: t('terminalAgent.agents.notSignedIn'), windows: [] };
  }
  if (session.expiresAtMs !== null && session.expiresAtMs - Date.now() <= 5 * 60 * 1000) {
    return { provider: 'Grok', account: session.email, status: t('terminalAgent.agents.expired'), windows: [] };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    'X-XAI-Token-Auth': 'xai-grok-cli',
    Accept: 'application/json',
  };
  if (session.userId) headers['x-userid'] = session.userId;
  const data = await requestJson('https://cli-chat-proxy.grok.com/v1/billing?format=credits', headers);
  const config = asRecord(data.config) ?? data;
  const windows: UsageWindow[] = [];
  const weekly = numberField(config, ['creditUsagePercent']);
  if (weekly !== null) {
    windows.push({
      name: '每周',
      usedPct: clampPct(weekly),
      resetAt: resetLabel(stringField(asRecord(config.currentPeriod) ?? {}, ['end']) ?? stringField(config, ['billingPeriodEnd'])),
    });
  }
  const monthly = monthlyPercent(config);
  if (monthly) windows.push(monthly);
  return {
    provider: 'Grok',
    account: session.email,
    status: windows.length > 0 ? t('terminalAgent.agents.readOk') : t('terminalAgent.agents.noNumbers'),
    windows,
  };
}

function readGrokSession(): { accessToken: string; userId: string | null; email: string | null; expiresAtMs: number | null } | null {
  const home = process.env.GROK_HOME || path.join(os.homedir(), '.grok');
  const parsed = readJson(path.join(home, 'auth.json'));
  if (!parsed) return null;
  const entries = Object.entries(parsed);
  const preferred = entries.find(([key]) => key === 'https://auth.x.ai' || key.startsWith('https://auth.x.ai::'));
  const chosen = asRecord((preferred ?? entries[0])?.[1]);
  const accessToken = typeof chosen?.key === 'string' ? chosen.key : '';
  if (!accessToken) return null;
  const expires = typeof chosen?.expires_at === 'string' ? Date.parse(chosen.expires_at) : Number.NaN;
  return {
    accessToken,
    userId: typeof chosen?.user_id === 'string' ? chosen.user_id : null,
    email: typeof chosen?.email === 'string' ? chosen.email : null,
    expiresAtMs: Number.isFinite(expires) ? expires : null,
  };
}

function mapCodexWindow(record: Record<string, unknown> | null): UsageWindow | null {
  if (!record) return null;
  const used = numberField(record, ['used_percent', 'used_percentage']);
  if (used === null) return null;
  const seconds = numberField(record, ['limit_window_seconds']);
  const name = seconds !== null && seconds > 8 * 60 * 60 ? '每周' : '5小时';
  const reset = record.reset_at;
  const resetAt = typeof reset === 'number'
    ? resetLabel(new Date(reset > 10_000_000_000 ? reset : reset * 1000).toISOString())
    : resetLabel(typeof reset === 'string' ? reset : null);
  return { name, usedPct: clampPct(used), resetAt };
}

function mapPercentWindow(name: string, record: Record<string, unknown> | null, keys: string[]): UsageWindow | null {
  if (!record) return null;
  const used = numberField(record, keys);
  if (used === null) return null;
  return {
    name,
    usedPct: clampPct(used),
    resetAt: resetLabel(stringField(record, ['resets_at', 'resetsAt'])),
  };
}

function monthlyPercent(config: Record<string, unknown>): UsageWindow | null {
  const limit = money(config.monthlyLimit);
  const used = money(config.used);
  if (limit === null || used === null || limit <= 0) return null;
  return {
    name: '每月',
    usedPct: clampPct((used / limit) * 100),
    resetAt: resetLabel(stringField(asRecord(config.currentPeriod) ?? {}, ['end']) ?? stringField(config, ['billingPeriodEnd'])),
  };
}

function money(value: unknown): number | null {
  const record = asRecord(value);
  const raw = record?.val;
  const num = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
  return typeof num === 'number' && Number.isFinite(num) ? num : null;
}

function resetLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function numberField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

function requestJson(url: string, headers: Record<string, string>, redirects = 3): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers, timeout: REQUEST_TIMEOUT_MS }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location && redirects > 0) {
        response.resume();
        resolve(requestJson(new URL(location, url).toString(), headers, redirects - 1));
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (status !== 200) {
          reject(new Error(`HTTP ${status}`));
          return;
        }
        try {
          const parsed = asRecord(JSON.parse(body));
          if (!parsed) {
            reject(new Error('用量响应不是对象'));
            return;
          }
          resolve(parsed);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('用量响应无法解析'));
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('用量请求超时'));
    });
    request.on('error', reject);
  });
}

function requestRaw(url: string, headers: Record<string, string>, body?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: body ? 'POST' : 'GET',
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    }, (response) => {
      const status = response.statusCode ?? 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (status !== 200) {
          reject(new Error(`HTTP ${status}`));
          return;
        }
        try {
          resolve(JSON.parse(text) as unknown);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('用量响应无法解析'));
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('用量请求超时'));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function readGeminiUsage(): Promise<ProviderSnapshot> {
  const creds = readJson(path.join(os.homedir(), '.gemini', 'oauth_creds.json'));
  const token = typeof creds?.access_token === 'string' ? creds.access_token : '';
  const expiry = typeof creds?.expiry_date === 'number' ? creds.expiry_date : 0;
  if (!token) return { provider: 'Gemini', account: null, status: t('terminalAgent.agents.notSignedIn'), windows: [] };
  if (expiry > 0 && expiry < Date.now()) {
    return { provider: 'Gemini', account: null, status: t('terminalAgent.agents.expired'), windows: [] };
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const loaded = asRecord(await requestRaw(
    'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
    headers,
    JSON.stringify({ metadata: { ideType: 'GEMINI_CLI', pluginType: 'GEMINI' } }),
  ));
  const project = typeof loaded?.cloudaicompanionProject === 'string' ? loaded.cloudaicompanionProject : '';
  if (!project) return { provider: 'Gemini', account: null, status: t('terminalAgent.agents.noNumbers'), windows: [] };
  const quota = await requestRaw(
    'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota',
    headers,
    JSON.stringify({ project }),
  );
  const buckets = Array.isArray(quota) ? quota : asRecord(quota)?.buckets;
  const windows: UsageWindow[] = [];
  if (Array.isArray(buckets)) {
    for (const bucket of buckets) {
      const record = asRecord(bucket);
      const remaining = typeof record?.remainingFraction === 'number' ? record.remainingFraction : null;
      if (remaining === null) continue;
      windows.push({
        name: '每周',
        usedPct: clampPct((1 - remaining) * 100),
        resetAt: resetLabel(typeof record?.resetTime === 'string' ? record.resetTime : null),
      });
    }
  }
  const tightest = windows.sort((a, b) => (b.usedPct ?? 0) - (a.usedPct ?? 0))[0];
  return {
    provider: 'Gemini',
    account: null,
    status: tightest ? t('terminalAgent.agents.readOk') : t('terminalAgent.agents.noNumbers'),
    windows: tightest ? [tightest] : [],
  };
}

async function readAntigravityUsage(): Promise<ProviderSnapshot> {
  const gemini = await readGeminiUsage();
  return { ...gemini, provider: 'Antigravity' };
}

async function readKimiUsage(): Promise<ProviderSnapshot> {
  const home = process.env.KIMI_CODE_HOME?.trim() || path.join(os.homedir(), '.kimi-code');
  const creds = readJson(path.join(home, 'credentials', 'kimi-code.json'));
  const token = typeof creds?.access_token === 'string' ? creds.access_token : '';
  const expires = typeof creds?.expires_at === 'number' ? creds.expires_at : 0;
  if (!token) return { provider: 'Kimi', account: null, status: t('terminalAgent.agents.notSignedIn'), windows: [] };
  if (expires - Math.floor(Date.now() / 1000) <= 5) {
    return { provider: 'Kimi', account: null, status: t('terminalAgent.agents.expired'), windows: [] };
  }
  const base = (process.env.KIMI_CODE_BASE_URL ?? 'https://api.kimi.com/coding/v1').replace(/\/$/, '');
  const data = asRecord(await requestRaw(`${base}/usages`, {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }));
  const windows: UsageWindow[] = [];
  const weekly = kimiWindow(asRecord(data?.usage) , '每周');
  if (weekly) windows.push(weekly);
  const limits = Array.isArray(data?.limits) ? data.limits : [];
  for (const limit of limits) {
    const record = asRecord(limit);
    const session = kimiWindow(asRecord(record?.detail), '5小时');
    if (session) {
      windows.push(session);
      break;
    }
  }
  return {
    provider: 'Kimi',
    account: null,
    status: windows.length > 0 ? t('terminalAgent.agents.readOk') : t('terminalAgent.agents.noNumbers'),
    windows,
  };
}

function kimiWindow(detail: Record<string, unknown> | null, name: string): UsageWindow | null {
  if (!detail) return null;
  const limit = numberField(detail, ['limit']);
  let used = numberField(detail, ['used']);
  const remaining = numberField(detail, ['remaining']);
  if (used === null && remaining !== null && limit !== null) used = limit - remaining;
  if (limit === null || limit <= 0 || used === null) return null;
  const reset = stringField(detail, ['resetTime', 'resetAt']);
  return { name, usedPct: clampPct((used / limit) * 100), resetAt: resetLabel(reset) };
}

async function readOpenCodeUsage(): Promise<ProviderSnapshot> {
  const key = readOpenCodeGoKey();
  if (!key) return { provider: 'OpenCode', account: null, status: t('terminalAgent.agents.notSignedIn'), windows: [] };
  const data = asRecord(await requestRaw('https://opencode.ai/zen/go/v1/usage', {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  }));
  const usage = asRecord(data?.usage);
  const windows = [
    percentWindow('5小时', asRecord(usage?.rolling)),
    percentWindow('每周', asRecord(usage?.weekly)),
    percentWindow('每月', asRecord(usage?.monthly)),
  ].filter((window): window is UsageWindow => window !== null);
  return {
    provider: 'OpenCode',
    account: null,
    status: windows.length > 0 ? t('terminalAgent.agents.readOk') : t('terminalAgent.agents.noNumbers'),
    windows,
  };
}

function readOpenCodeGoKey(): string | null {
  const env = process.env.OPENCODE_API_KEY?.trim();
  if (env) return env;
  const candidates = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'opencode', 'auth.json') : null,
    process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, 'opencode', 'auth.json') : null,
    path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json'),
    path.join(os.homedir(), 'Library', 'Application Support', 'opencode', 'auth.json'),
  ].filter((candidate): candidate is string => candidate !== null);
  for (const candidate of candidates) {
    const parsed = readJson(candidate);
    const entry = asRecord(parsed?.['opencode-go']);
    if (entry?.type === 'api' && typeof entry.key === 'string' && entry.key.trim()) return entry.key.trim();
  }
  return null;
}

function percentWindow(name: string, record: Record<string, unknown> | null): UsageWindow | null {
  if (!record || typeof record.percent !== 'number' || !Number.isFinite(record.percent)) return null;
  return {
    name,
    usedPct: clampPct(record.percent),
    resetAt: resetLabel(typeof record.resetsAt === 'string' ? record.resetsAt : null),
  };
}

async function readMiniMaxUsage(): Promise<ProviderSnapshot> {
  const key = readMiniMaxKey();
  if (!key) return { provider: 'MiniMax', account: null, status: t('terminalAgent.agents.notSignedIn'), windows: [] };
  const data = asRecord(await requestRaw('https://platform.minimax.io/v1/api/openplatform/coding_plan/remains', {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  }));
  const remains = data?.model_remains ?? data?.modelRemains;
  const windows: UsageWindow[] = [];
  if (Array.isArray(remains)) {
    for (const item of remains) {
      const record = asRecord(item);
      if (!record) continue;
      const total = numberField(record, ['current_interval_total_count', 'total']);
      const used = numberField(record, ['current_interval_usage_count', 'used']);
      if (total === null || used === null || total <= 0) continue;
      windows.push({ name: '每周', usedPct: clampPct((used / total) * 100), resetAt: null });
      break;
    }
  }
  return {
    provider: 'MiniMax',
    account: null,
    status: windows.length > 0 ? t('terminalAgent.agents.readOk') : t('terminalAgent.agents.noNumbers'),
    windows,
  };
}

function readMiniMaxKey(): string | null {
  const env = process.env.MINIMAX_API_KEY?.trim();
  if (env) return env;
  try {
    const text = fs.readFileSync(path.join(os.homedir(), '.minimax', 'api_key'), 'utf8').trim();
    return text || null;
  } catch {
    return null;
  }
}
