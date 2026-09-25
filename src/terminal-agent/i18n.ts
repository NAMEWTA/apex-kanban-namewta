import { t as sharedT } from '../shared/i18n';

/** Terminal strings live in shared i18n under the `terminalAgent.` prefix. */
export function t(key: string, params?: Record<string, string | number>): string {
	return sharedT(`terminalAgent.${key}`, params);
}

export const i18n = {
	initialize(): void {
		// The plugin language switch owns zh/en. Obsidian's locale is not consulted.
	},
};
