import { APEX_COMMANDS } from '../shared/commands';
import { t } from '../shared/i18n';
import type DashboardPlugin from './main';

/** Shell commands. Products register their own commands from their host. */
export function registerShellCommands(plugin: DashboardPlugin): void {
	plugin.addCommand({
		id: APEX_COMMANDS.OPEN_DASHBOARD,
		name: t('main.openDashboard'),
		callback: () => {
			void plugin.openDashboard();
		},
	});
	plugin.addCommand({
		id: APEX_COMMANDS.OPEN_EDITOR_VIEW,
		name: t('editor.openPanel'),
		callback: () => {
			void plugin.openEditorView();
		},
	});
}
