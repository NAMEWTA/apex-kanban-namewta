import type { DashboardSettingTab } from './settings-tab';
import { setIcon, Setting } from 'obsidian';
import { t } from '../../shared/i18n';
import { WidgetBackgroundModal } from '../../dashboard-view/widgets/widget-background';

/** Shared background row for the singleton widget cards: opens the
 *  background modal and writes the result straight into one of the
 *  *Background settings keys (undefined = removed). */
export function renderWidgetBackgroundSetting(
	this: DashboardSettingTab,
	containerEl: HTMLElement,
	key:
		| 'quickActionsBackground'
		| 'pomodoroBackground'
		| 'habitBackground'
		| 'musicBackground'
		| 'yearProgressBackground',
): void {
	new Setting(containerEl)
		.setName(t('wbg.set'))
		.setDesc(this.plugin.settings[key]?.image ?? '')
		.addExtraButton((btn) =>
			btn
				.setIcon('image')
				.setTooltip(t('wbg.title'))
				.onClick(() => {
					new WidgetBackgroundModal(this.app, this.plugin.settings[key], (bg) => {
						this.plugin.settings = { ...this.plugin.settings, [key]: bg };
						void this.plugin.saveSettings();
						this.plugin.refreshAllDashboards();
						this.refresh();
					}).open();
				}),
		);
}
