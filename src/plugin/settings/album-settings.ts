import type { DashboardSettingTab } from './settings-tab';
import { setIcon, Setting } from 'obsidian';
import type { AlbumConfig } from '../../dashboard-view/types';
import { t } from '../../shared/i18n';
import { AlbumSettingsModal } from '../../dashboard-view/widgets/album-settings-modal';

/** Widgets tab: photo-album cards. Multiple albums are managed as a list
 *  (albums[]); the legacy single-album flat fields are migrated on load. */
export function renderAlbumSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	new Setting(containerEl).setName(t('settings.widgetAlbum')).setHeading();

	const card = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });

	const albums = this.plugin.settings.albums ?? [];
	for (const cfg of albums) {
		const sizeLabel = t(`album.size.${cfg.heightRatio}`);
		const name = cfg.folder.split('/').pop() || cfg.folder || t('album.unsetFolder');
		new Setting(card)
			.setName(name)
			.setDesc(`${cfg.folder || t('album.unsetFolder')} · ${sizeLabel}`)
			.addExtraButton((btn) =>
				btn
					.setIcon('pencil')
					.setTooltip(t('common.edit'))
					.onClick(() => this.editAlbum(cfg)),
			)
			.addExtraButton((btn) =>
				btn
					.setIcon('trash-2')
					.setTooltip(t('common.delete'))
					.onClick(async () => {
						this.plugin.settings = {
							...this.plugin.settings,
							albums: albums.filter((a) => a.id !== cfg.id),
						};
						await this.plugin.saveSettings();
						this.plugin.refreshAllDashboards();
						this.refresh();
					}),
			);
	}

	new Setting(card).addButton((btn) =>
		btn
			.setButtonText(t('album.add'))
			.setIcon('plus')
			.onClick(() => this.editAlbum(null)),
	);
}

export function editAlbum(this: DashboardSettingTab, existing: AlbumConfig | null): void {
	const baseline: AlbumConfig = existing ?? {
		id: Date.now(),
		folder: '',
		intervalSec: 8,
		recursive: true,
		ratio: '1:1',
		transition: 'fade',
		heightRatio: 'full',
	};
	const modal = new AlbumSettingsModal(this.app, baseline, (updated) => {
		void this.applyAlbumUpdate(updated);
	});
	modal.open();
}

export async function applyAlbumUpdate(this: DashboardSettingTab, updated: AlbumConfig): Promise<void> {
	const current = this.plugin.settings.albums ?? [];
	const exists = current.some((a) => a.id === updated.id);
	this.plugin.settings = {
		...this.plugin.settings,
		albums: exists ? current.map((a) => (a.id === updated.id ? updated : a)) : [...current, updated],
	};
	await this.plugin.saveSettings();
	this.plugin.refreshAllDashboards();
	this.refresh();
}
