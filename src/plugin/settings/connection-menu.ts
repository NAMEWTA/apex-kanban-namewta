import { t } from '../../shared/i18n/runtime';

/** Page title and the connection menu item share this translation. */
export const CONNECTION_MENU_KEY = 'terminalAgent.settingsDetails.advanced.serverConnection';

const TERMINAL_MENU_KEYS = {
	shell: 'terminalAgent.settingsDetails.terminal.shellSettings',
	instance: 'terminalAgent.settingsDetails.terminal.instanceBehavior',
	workflows: 'terminalAgent.settingsDetails.terminal.presetScripts',
	appearance: 'terminalAgent.settingsDetails.terminal.displaySettings',
	behavior: 'terminalAgent.settingsDetails.terminal.behaviorSettings',
	connection: CONNECTION_MENU_KEY,
	visibility: 'terminalAgent.visibility.visibilitySettings',
	agents: 'settings.productTerminal',
} as const;

export type TerminalMenuId = keyof typeof TERMINAL_MENU_KEYS;

export function connectionMenuLabel(): string {
	return t(CONNECTION_MENU_KEY);
}

/** Labels for the terminal settings sections, in sidePages order. */
export function terminalMenuLabels(): Record<TerminalMenuId, string> {
	return {
		shell: t(TERMINAL_MENU_KEYS.shell),
		instance: t(TERMINAL_MENU_KEYS.instance),
		workflows: t(TERMINAL_MENU_KEYS.workflows),
		appearance: t(TERMINAL_MENU_KEYS.appearance),
		behavior: t(TERMINAL_MENU_KEYS.behavior),
		connection: connectionMenuLabel(),
		visibility: t(TERMINAL_MENU_KEYS.visibility),
		agents: t(TERMINAL_MENU_KEYS.agents),
	};
}
