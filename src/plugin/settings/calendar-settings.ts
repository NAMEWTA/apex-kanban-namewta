import type { DashboardSettingTab } from './settings-tab';
import { setIcon, Setting } from 'obsidian';
import { t } from '../../shared/i18n';
import { MultiFolderSelectModal } from '../../dashboard-view/library/folder-config-modal';
import { PathPickerModal } from '../../dashboard-view/ui/path-picker-modal';

export function renderCalendarSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	new Setting(containerEl).setName(t('settings.widgetCalendar')).setHeading();

	const card = containerEl.createDiv({ cls: 'dashboard-widget-settings-card' });
	new Setting(card)
		.setName(t('settings.widgetCalendarEnabled'))
		.setDesc(t('settings.widgetCalendarEnabledDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.widgetCalendarEnabled).onChange(async (value) => {
				this.plugin.settings = {
					...this.plugin.settings,
					widgetCalendarEnabled: value,
				};
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
				this.refresh();
			}),
		);

	if (!this.plugin.settings.widgetCalendarEnabled) return;

	// Excluded folders — tasks under these folders are hidden from the calendar.
	const excludeSetting = new Setting(card)
		.setName(t('settings.widgetCalendarExclude'))
		.setDesc(t('settings.widgetCalendarExcludeDesc'));
	const excludeRow = excludeSetting.controlEl.createDiv({ cls: 'dashboard-settings-folder-chips' });
	// The add row is a SIBLING of excludeRow, not a child: renderChips()
	// empties excludeRow on every change, which used to wipe the manual
	// input + browse controls along with the chips.
	const addControl = excludeSetting.controlEl.createDiv({ cls: 'dashboard-settings-folder-add' });

	const removeFolder = async (folder: string): Promise<void> => {
		this.plugin.settings = {
			...this.plugin.settings,
			calendarExcludeFolders: (this.plugin.settings.calendarExcludeFolders ?? []).filter((f) => f !== folder),
		};
		await this.plugin.saveSettings();
		this.plugin.refreshAllDashboards();
		renderChips();
	};

	const renderChips = (): void => {
		excludeRow.empty();
		const folders = this.plugin.settings.calendarExcludeFolders ?? [];
		for (const folder of folders) {
			const chip = excludeRow.createDiv({ cls: 'dashboard-settings-folder-chip' });
			chip.createSpan({ text: folder });
			const removeBtn = chip.createEl('button', {
				cls: 'dashboard-settings-folder-chip-remove',
				attr: { 'aria-label': t('common.remove', { name: folder }) },
			});
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', () => {
				void removeFolder(folder);
			});
		}
	};
	renderChips();

	const input = addControl.createEl('input', {
		cls: 'dashboard-settings-folder-input',
		attr: { type: 'text', placeholder: t('folder.selectFolder') },
	});
	const browseBtn = addControl.createEl('button', { cls: 'dashboard-settings-folder-browse' });
	setIcon(browseBtn, 'folder');
	browseBtn.addEventListener('click', () => {
		// Multi-select picker: manage the whole excluded set in one place.
		// Manual typing above stays for paths outside the folder tree.
		new MultiFolderSelectModal(
			this.app,
			this.plugin.settings.calendarExcludeFolders ?? [],
			(folders) => {
				void (async () => {
					this.plugin.settings = {
						...this.plugin.settings,
						calendarExcludeFolders: folders,
					};
					await this.plugin.saveSettings();
					this.plugin.refreshAllDashboards();
					renderChips();
				})();
			},
			{ parentCoversChildren: true },
		).open();
	});
	const addBtn = addControl.createEl('button', { cls: 'dashboard-settings-folder-add-btn', text: t('common.add') });
	const addFolder = async (): Promise<void> => {
		const folder = input.value.trim();
		if (!folder) return;
		const folders = this.plugin.settings.calendarExcludeFolders ?? [];
		if (folders.includes(folder)) {
			input.value = '';
			return;
		}
		this.plugin.settings = {
			...this.plugin.settings,
			calendarExcludeFolders: [...folders, folder],
		};
		input.value = '';
		await this.plugin.saveSettings();
		this.plugin.refreshAllDashboards();
		renderChips();
	};
	addBtn.addEventListener('click', () => {
		void addFolder();
	});
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			void addFolder();
		}
	});

	// Where calendar-added tasks land in the day's daily note.
	new Setting(card)
		.setName(t('settings.widgetCalendarTaskPosition'))
		.setDesc(t('settings.widgetCalendarTaskPositionDesc'))
		.addDropdown((d) =>
			d
				.addOption('start', t('settings.widgetCalendarTaskPositionStart'))
				.addOption('end', t('settings.widgetCalendarTaskPositionEnd'))
				.setValue(this.plugin.settings.calendarTaskInsertPosition)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						calendarTaskInsertPosition: value as 'start' | 'end',
					};
					await this.plugin.saveSettings();
				}),
		);

	// Fixed destination override: default is that day's daily note (created
	// when missing), a specific file, or a folder with one note per day.
	const currentTarget = this.plugin.settings.calendarTaskTarget;
	const targetMode: () => string = () => currentTarget?.kind ?? 'default';
	const targetSetting = new Setting(card)
		.setName(t('settings.calendarTarget'))
		.setDesc(t('settings.calendarTargetDesc'));
	let targetInput: HTMLInputElement | null = null;
	targetSetting.addDropdown((d) => {
		d.addOption('default', t('settings.calendarTargetDefault'))
			.addOption('file', t('settings.calendarTargetFile'))
			.addOption('folder', t('settings.calendarTargetFolder'))
			.setValue(targetMode())
			.onChange(async (value) => {
				if (value === 'default') {
					this.plugin.settings = { ...this.plugin.settings, calendarTaskTarget: undefined };
				} else {
					const existing = this.plugin.settings.calendarTaskTarget;
					this.plugin.settings = {
						...this.plugin.settings,
						calendarTaskTarget: { kind: value as 'file' | 'folder', path: existing?.path ?? '' },
					};
				}
				await this.plugin.saveSettings();
				if (targetInput) {
					targetInput.value = this.plugin.settings.calendarTaskTarget?.path ?? '';
					targetInput.disabled = value === 'default';
					targetInput.placeholder =
						value === 'folder' ? t('settings.calendarTargetFolderPlaceholder') : 'Notes/tasks.md';
				}
			});
	});
	targetSetting.addText((text) => {
		targetInput = text.inputEl;
		text.inputEl.disabled = targetMode() === 'default';
		text.setPlaceholder(
			currentTarget?.kind === 'folder' ? t('settings.calendarTargetFolderPlaceholder') : 'Notes/tasks.md',
		)
			.setValue(currentTarget?.path ?? '')
			.onChange(async (value) => {
				const tgt = this.plugin.settings.calendarTaskTarget;
				if (!tgt) return;
				this.plugin.settings = {
					...this.plugin.settings,
					calendarTaskTarget: { ...tgt, path: value.trim() },
				};
				await this.plugin.saveSettings();
			});
	});
	targetSetting.addExtraButton((btn) =>
		btn
			.setIcon('file-search')
			.setTooltip(t('pathPicker.pickFile'))
			.onClick(() => {
				const tgt = this.plugin.settings.calendarTaskTarget;
				const mode: 'file' | 'folder' = tgt?.kind === 'folder' ? 'folder' : 'file';
				new PathPickerModal(this.app, mode, (path) => {
					if (!this.plugin.settings.calendarTaskTarget) return;
					this.plugin.settings = {
						...this.plugin.settings,
						calendarTaskTarget: { ...this.plugin.settings.calendarTaskTarget, path },
					};
					void this.plugin.saveSettings();
					if (targetInput) targetInput.value = path;
				}).open();
			}),
	);
}
