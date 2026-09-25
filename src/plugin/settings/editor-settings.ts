import { Setting } from 'obsidian';
import type { EditorDomainId } from '../../shared/editor-workbench';
import { t } from '../../shared/i18n';
import type { DashboardSettingTab } from './settings-tab';

const DOMAINS: readonly EditorDomainId[] = ['comments', 'writing-stats', 'focus'];

function isDomain(value: string): value is EditorDomainId {
	return (DOMAINS as readonly string[]).includes(value);
}

/** Editor product block. Comment bodies stay in the vault sidecar, not data.json. */
export function renderEditorSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	const workbench = this.plugin.settings.editorWorkbench;

	new Setting(containerEl)
		.setName(t('settings.editorHighlight'))
		.setDesc(t('settings.editorHighlightDesc'))
		.addToggle((toggle) =>
			toggle.setValue(workbench.highlightEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					editorWorkbench: { ...this.plugin.settings.editorWorkbench, highlightEnabled: value },
				};
				await this.plugin.saveSettings();
				this.plugin.editorHost?.notifySettingsChanged();
			}),
		);

	new Setting(containerEl)
		.setName(t('settings.editorPopover'))
		.setDesc(t('settings.editorPopoverDesc'))
		.addToggle((toggle) =>
			toggle.setValue(workbench.popoverEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					editorWorkbench: { ...this.plugin.settings.editorWorkbench, popoverEnabled: value },
				};
				await this.plugin.saveSettings();
				this.plugin.editorHost?.notifySettingsChanged();
			}),
		);

	new Setting(containerEl)
		.setName(t('settings.editorDefaultDomain'))
		.setDesc(t('settings.editorDefaultDomainDesc'))
		.addDropdown((dropdown) => {
			dropdown
				.addOption('comments', t('editor.comments.title'))
				.addOption('writing-stats', t('editor.writingStats.title'))
				.addOption('focus', t('editor.focus.title'))
				.setValue(workbench.activeDomain)
				.onChange(async (value) => {
					if (!isDomain(value)) return;
					this.plugin.settings = {
						...this.plugin.settings,
						editorWorkbench: { ...this.plugin.settings.editorWorkbench, activeDomain: value },
					};
					await this.plugin.saveSettings();
					this.plugin.editorHost?.notifyLayoutChanged();
				});
		});
}

/** Sync product is not built yet. One line, so the settings page already has a home for it. */
export function renderSyncSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	new Setting(containerEl).setName(t('settings.tabSync')).setDesc(t('editor.sync.placeholder'));
}
