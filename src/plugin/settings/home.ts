import { Setting } from 'obsidian';
import { t } from '../../shared/i18n';
import type { DashboardSettingTab } from './settings-tab';

/** Home is the first settings product. Its only job is to start or stop the others. */
export function renderHomeSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	const modules = this.plugin.settings.modules;
	const rows: Array<{ key: 'dashboard' | 'editor' | 'terminal'; name: string; desc: string }> = [
		{ key: 'dashboard', name: t('modules.dashboard'), desc: t('modules.dashboardDesc') },
		{ key: 'editor', name: t('modules.editor'), desc: t('modules.editorDesc') },
		{ key: 'terminal', name: t('modules.terminal'), desc: t('modules.terminalDesc') },
	];
	for (const row of rows) {
		new Setting(containerEl)
			.setName(row.name)
			.setDesc(row.desc)
			.addToggle((toggle) => {
				toggle.setValue(modules[row.key]).onChange(async (value) => {
					this.plugin.settings.modules = { ...this.plugin.settings.modules, [row.key]: value };
					await this.plugin.saveSettings();
					await this.plugin.applyModuleFlags();
				});
			});
	}
	new Setting(containerEl).setName(t('modules.sync')).setDesc(t('modules.syncDesc'));
}
