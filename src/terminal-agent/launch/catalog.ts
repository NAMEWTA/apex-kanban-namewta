import type { AgentId, UsageKind } from './types';

export interface AgentCatalogEntry {
	id: AgentId;
	title: string;
	detectCommand: string;
	launchCommand: string;
	installDocsUrl: string;
	installCommands?: Partial<Record<NodeJS.Platform, string>>;
	upgradeCommands?: Partial<Record<NodeJS.Platform, string>>;
	versionRegistry?: { kind: 'npm'; package: string } | { kind: 'github-release'; repo: string };
	yoloFlags: readonly string[];
	accountKind: 'claude' | 'codex' | 'none';
	usage: UsageKind;
	contextAware: boolean;
	icon: string;
}

/**
 * One row per coding agent. Launch commands match the detect/launch names in
 * Orca's shared agent config: a click opens a terminal and sends that command.
 * Preset workflows, the install catalog, permission flags, and usage readers
 * all come from this list.
 */
export const AGENT_CATALOG: readonly AgentCatalogEntry[] = [
	{
		id: 'claude-code',
		title: 'Claude Code',
		detectCommand: 'claude',
		launchCommand: 'claude',
		installDocsUrl: 'https://code.claude.com/docs/en/overview',
		installCommands: {
			darwin: 'curl -fsSL https://claude.ai/install.sh | bash',
			linux: 'curl -fsSL https://claude.ai/install.sh | bash',
			win32: 'irm https://claude.ai/install.ps1 | iex',
		},
		upgradeCommands: {
			darwin: 'claude update',
			linux: 'claude update',
			win32: 'claude update',
		},
		versionRegistry: { kind: 'npm', package: '@anthropic-ai/claude-code' },
		yoloFlags: ['--dangerously-skip-permissions'],
		accountKind: 'claude',
		usage: 'claude',
		contextAware: true,
		icon: 'claude',
	},
	{
		id: 'codex',
		title: 'Codex',
		detectCommand: 'codex',
		launchCommand: 'codex',
		installDocsUrl: 'https://github.com/openai/codex',
		installCommands: {
			darwin: 'brew install --cask codex',
			linux: 'npm install -g @openai/codex',
			win32: 'npm install -g @openai/codex',
		},
		upgradeCommands: {
			darwin: 'brew upgrade --cask codex',
			linux: 'npm install -g @openai/codex@latest',
			win32: 'npm install -g @openai/codex@latest',
		},
		versionRegistry: { kind: 'npm', package: '@openai/codex' },
		yoloFlags: ['--dangerously-bypass-approvals-and-sandbox'],
		accountKind: 'codex',
		usage: 'codex',
		contextAware: true,
		icon: 'openai',
	},
	{
		id: 'grok',
		title: 'Grok',
		detectCommand: 'grok',
		launchCommand: 'grok',
		installDocsUrl: 'https://github.com/xai-org/grok-build',
		yoloFlags: ['--permission-mode', 'bypassPermissions'],
		accountKind: 'none',
		usage: 'grok',
		contextAware: false,
		icon: 'bot',
	},
	{
		id: 'opencode',
		title: 'OpenCode',
		detectCommand: 'opencode',
		launchCommand: 'opencode',
		installDocsUrl: 'https://opencode.ai/docs',
		installCommands: {
			darwin: 'curl -fsSL https://opencode.ai/install | bash',
			linux: 'curl -fsSL https://opencode.ai/install | bash',
			win32: 'npm install -g opencode-ai',
		},
		upgradeCommands: {
			darwin: 'curl -fsSL https://opencode.ai/install | bash',
			linux: 'curl -fsSL https://opencode.ai/install | bash',
			win32: 'npm install -g opencode-ai@latest',
		},
		versionRegistry: { kind: 'github-release', repo: 'anomalyco/opencode' },
		yoloFlags: [],
		accountKind: 'none',
		usage: 'opencode',
		contextAware: true,
		icon: 'opencode',
	},
	{
		id: 'gemini',
		title: 'Gemini CLI',
		detectCommand: 'gemini',
		launchCommand: 'gemini',
		installDocsUrl: 'https://github.com/google-gemini/gemini-cli',
		installCommands: {
			darwin: 'npm install -g @google/gemini-cli',
			linux: 'npm install -g @google/gemini-cli',
			win32: 'npm install -g @google/gemini-cli',
		},
		upgradeCommands: {
			darwin: 'npm install -g @google/gemini-cli@latest',
			linux: 'npm install -g @google/gemini-cli@latest',
			win32: 'npm install -g @google/gemini-cli@latest',
		},
		versionRegistry: { kind: 'npm', package: '@google/gemini-cli' },
		yoloFlags: [],
		accountKind: 'none',
		usage: 'gemini',
		contextAware: false,
		icon: 'gemini',
	},
	{
		id: 'qwen-code',
		title: 'Qwen Code',
		detectCommand: 'qwen',
		launchCommand: 'qwen',
		installDocsUrl: 'https://github.com/QwenLM/qwen-code',
		installCommands: {
			darwin: 'npm install -g @qwen-code/qwen-code',
			linux: 'npm install -g @qwen-code/qwen-code',
			win32: 'npm install -g @qwen-code/qwen-code',
		},
		upgradeCommands: {
			darwin: 'npm install -g @qwen-code/qwen-code@latest',
			linux: 'npm install -g @qwen-code/qwen-code@latest',
			win32: 'npm install -g @qwen-code/qwen-code@latest',
		},
		versionRegistry: { kind: 'npm', package: '@qwen-code/qwen-code' },
		yoloFlags: [],
		accountKind: 'none',
		usage: 'none',
		contextAware: false,
		icon: 'bot',
	},
	{
		id: 'kimi',
		title: 'Kimi',
		detectCommand: 'kimi',
		launchCommand: 'kimi',
		installDocsUrl: 'https://github.com/MoonshotAI/kimi-code',
		yoloFlags: [],
		accountKind: 'none',
		usage: 'kimi',
		contextAware: false,
		icon: 'bot',
	},
	{
		id: 'antigravity',
		title: 'Antigravity',
		detectCommand: 'agy',
		launchCommand: 'agy',
		installDocsUrl: 'https://antigravity.google/',
		yoloFlags: [],
		accountKind: 'none',
		usage: 'antigravity',
		contextAware: false,
		icon: 'bot',
	},
	{
		id: 'minimax',
		title: 'MiniMax',
		detectCommand: 'minimax',
		launchCommand: 'minimax',
		installDocsUrl: 'https://platform.minimaxi.com/',
		yoloFlags: [],
		accountKind: 'none',
		usage: 'minimax',
		contextAware: false,
		icon: 'bot',
	},
];

export function getAgent(id: AgentId): AgentCatalogEntry {
	const entry = AGENT_CATALOG.find((agent) => agent.id === id);
	if (!entry) {
		throw new Error(`Unknown agent ${id}`);
	}
	return entry;
}
