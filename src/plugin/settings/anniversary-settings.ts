import type { DashboardSettingTab } from './settings-tab';
import { setIcon, Setting } from 'obsidian';
import type { AnniversaryConfig } from '../../dashboard-view/types';
import { t } from '../../shared/i18n';
import { AnniversarySettingsModal } from '../../dashboard-view/widgets/anniversary-settings-modal';

/** Widgets tab: anniversary ("纪念日") cards — the countdown list pattern. */
export function renderAnniversarySettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	new Setting(containerEl).setName(t('settings.widgetAnniversary')).setHeading();

	const card = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(card)
		.setName(t('anniversary.enabled'))
		.setDesc(t('anniversary.enabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.anniversaryEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					anniversaryEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
				this.refresh();
			}),
		);

	if (!this.plugin.settings.anniversaryEnabled) return;

	const list = this.plugin.settings.anniversaries ?? [];
	for (const cfg of list) {
		const summary = cfg.label || cfg.startDate || t('anniversary.unnamed');
		new Setting(card)
			.setName(summary)
			.setDesc(
				cfg.startDate
					? `${cfg.startDate} · ${cfg.annualReminder ? t('anniversary.reminderOn') : t('anniversary.reminderOff')}`
					: t('anniversary.setDate'),
			)
			.addExtraButton((btn) =>
				btn
					.setIcon('pencil')
					.setTooltip(t('common.edit'))
					.onClick(() => this.editAnniversary(cfg)),
			)
			.addExtraButton((btn) =>
				btn
					.setIcon('trash-2')
					.setTooltip(t('common.delete'))
					.onClick(async () => {
						this.plugin.settings = {
							...this.plugin.settings,
							anniversaries: list.filter((a) => a.id !== cfg.id),
						};
						await this.plugin.saveSettings();
						this.plugin.refreshAllDashboards();
						this.refresh();
					}),
			);
	}

	new Setting(card).addButton((btn) =>
		btn
			.setButtonText(t('anniversary.add'))
			.setIcon('plus')
			.onClick(() => this.editAnniversary(null)),
	);
}

export function editAnniversary(this: DashboardSettingTab, existing: AnniversaryConfig | null): void {
	const baseline: AnniversaryConfig = existing ?? {
		id: `av-${Date.now()}`,
		label: '',
		startDate: '',
		precision: 'ymd',
		annualReminder: false,
	};
	const modal = new AnniversarySettingsModal(this.app, baseline, (updated) => {
		void this.applyAnniversaryUpdate(updated);
	});
	modal.open();
}

export async function applyAnniversaryUpdate(this: DashboardSettingTab, updated: AnniversaryConfig): Promise<void> {
	const current = this.plugin.settings.anniversaries ?? [];
	const exists = current.some((a) => a.id === updated.id);
	this.plugin.settings = {
		...this.plugin.settings,
		anniversaries: exists ? current.map((a) => (a.id === updated.id ? updated : a)) : [...current, updated],
	};
	await this.plugin.saveSettings();
	this.plugin.refreshAllDashboards();
	this.refresh();
}
