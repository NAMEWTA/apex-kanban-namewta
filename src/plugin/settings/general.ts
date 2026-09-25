import type { DashboardSettingTab } from './settings-tab';
import { setIcon, Setting, type TextComponent } from 'obsidian';
import type { DashboardLayoutMode } from '../../dashboard-view/types';
import { t, setLanguage, type Language } from '../../shared/i18n';
import { ThemeStudioModal } from '../../dashboard-view/appearance/theme-studio-modal';
import { QuickNoteConfigModal } from '../../dashboard-view/notes/quick-note-config-modal';
import { PathPickerModal } from '../../dashboard-view/ui/path-picker-modal';

/** Top block: layout, language, style, quick notes, paths. Shared by
 *  display() (pre-1.13) and the declarative General section (1.13+). */
export function renderGeneralSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	new Setting(containerEl).setName(t('settings.layoutMode'));
	this.renderLayoutPicker(containerEl);

	new Setting(containerEl)
		.setName(t('settings.language'))
		.setDesc(t('settings.languageDesc'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					en: t('settings.languageEn'),
					zh: t('settings.languageZh'),
				})
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					const lang = value as Language;
					this.plugin.settings = {
						...this.plugin.settings,
						language: lang,
					};
					setLanguage(lang);
					await this.plugin.saveSettings();
					this.refresh();
					this.plugin.refreshAllDashboards();
				}),
		);

	new Setting(containerEl)
		.setName(t('settings.stylePreset'))
		.setDesc(t('settings.stylePresetDesc'))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions({
					earth: t('settings.styleEarth'),
					nordic: t('settings.styleNordic'),
					aurora: t('settings.styleAurora'),
					blossom: t('settings.styleBlossom'),
					lilac: t('settings.styleLilac'),
					island: t('settings.styleIsland'),
					tundra: t('settings.styleTundra'),
					matcha: t('settings.styleMatcha'),
					mono: t('settings.styleMono'),
					neon: t('settings.styleNeon'),
					volt: t('settings.styleVolt'),
					magma: t('settings.styleMagma'),
					onyx: t('settings.styleOnyx'),
				})
				.setValue(this.plugin.settings.stylePreset)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						stylePreset: value,
					};
					await this.plugin.saveSettings();
					this.plugin.refreshAllDashboards();
				}),
		);

	new Setting(containerEl)
		.setName(t('themeStudio.title'))
		.setDesc(t('themeStudio.settingsDesc'))
		.addButton((btn) =>
			btn
				.setButtonText(t('themeStudio.open'))
				.setCta()
				.onClick(() => {
					new ThemeStudioModal(this.app, this.plugin).open();
				}),
		);

	new Setting(containerEl)
		.setName(t('quickNote.title'))
		.setDesc(t('quickNote.settingsDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.quickNotesEnabled).onChange(async (value) => {
				this.plugin.settings = { ...this.plugin.settings, quickNotesEnabled: value };
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
			}),
		)
		.addButton((btn) =>
			btn.setButtonText(t('quickNote.config')).onClick(() => {
				new QuickNoteConfigModal(this.app, this.plugin).open();
			}),
		);

	const recentSetting = new Setting(containerEl)
		.setName(t('settings.recentCount') + '  ' + this.plugin.settings.recentDocCount)
		.setDesc(t('settings.recentCountDesc'))
		.addSlider((slider) =>
			slider
				.setLimits(3, 15, 1)
				.setValue(this.plugin.settings.recentDocCount)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						recentDocCount: value,
					};
					await this.plugin.saveSettings();
					recentSetting.nameEl.setText(t('settings.recentCount') + '  ' + value);
				}),
		);

	this.renderWorkspaceSettings(containerEl);

	let memoInput: TextComponent | undefined;
	new Setting(containerEl)
		.setName(t('settings.memoSavePath'))
		.setDesc(t('settings.memoSavePathDesc'))
		.addText((text) => {
			memoInput = text;
			text.setPlaceholder('Memos')
				.setValue(this.plugin.settings.memoSavePath)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						memoSavePath: value.trim(),
					};
					await this.plugin.saveSettings();
				});
		})
		// Browse button: pick an existing folder instead of typing its path.
		.addExtraButton((btn) =>
			btn
				.setIcon('folder-search')
				.setTooltip(t('pathPicker.pickFolder'))
				.onClick(() => {
					new PathPickerModal(this.app, 'folder', (path) => {
						this.plugin.settings = {
							...this.plugin.settings,
							memoSavePath: path,
						};
						void this.plugin.saveSettings();
						memoInput?.setValue(path);
					}).open();
				}),
		);

	let memoTplInput: TextComponent | undefined;
	new Setting(containerEl)
		.setName(t('settings.memoTemplate'))
		.setDesc(t('settings.memoTemplateDesc'))
		.addText((text) => {
			memoTplInput = text;
			text.setPlaceholder('Templates/memo.md')
				.setValue(this.plugin.settings.memoTemplatePath)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						memoTemplatePath: value.trim(),
					};
					await this.plugin.saveSettings();
				});
		})
		// Browse button: pick an existing template note instead of typing its path.
		.addExtraButton((btn) =>
			btn
				.setIcon('file-search')
				.setTooltip(t('pathPicker.pickFile'))
				.onClick(() => {
					new PathPickerModal(this.app, 'file', (path) => {
						this.plugin.settings = {
							...this.plugin.settings,
							memoTemplatePath: path,
						};
						void this.plugin.saveSettings();
						memoTplInput?.setValue(path);
					}).open();
				}),
		);

	// Archive destination: a fixed file (the historical behavior) or
	// today's daily note (created from the daily-notes template when
	// missing). The path setting below only applies to file mode, so the
	// tab refreshes on switch to show/hide it.
	new Setting(containerEl)
		.setName(t('settings.taskArchiveTarget'))
		.setDesc(t('settings.taskArchiveTargetDesc'))
		.addDropdown((dropdown) =>
			dropdown
				.addOption('file', t('settings.taskArchiveTargetFile'))
				.addOption('daily', t('settings.taskArchiveTargetDaily'))
				.setValue(this.plugin.settings.taskArchiveTarget === 'daily' ? 'daily' : 'file')
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						taskArchiveTarget: value === 'daily' ? 'daily' : 'file',
					};
					await this.plugin.saveSettings();
					this.refresh();
				}),
		);

	if (this.plugin.settings.taskArchiveTarget !== 'daily') {
		let archiveInput: TextComponent | undefined;
		new Setting(containerEl)
			.setName(t('settings.taskArchivePath'))
			.setDesc(t('settings.taskArchivePathDesc'))
			.addText((text) => {
				archiveInput = text;
				text.setPlaceholder('Archive/Done.md')
					.setValue(this.plugin.settings.taskArchivePath)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							taskArchivePath: value.trim(),
						};
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((btn) =>
				btn
					.setIcon('file-search')
					.setTooltip(t('pathPicker.pickFile'))
					.onClick(() => {
						new PathPickerModal(this.app, 'file', (path) => {
							this.plugin.settings = {
								...this.plugin.settings,
								taskArchivePath: path,
							};
							void this.plugin.saveSettings();
							archiveInput?.setValue(path);
						}).open();
					}),
			);
	}

	let libraryNewNoteInput: TextComponent | undefined;
	new Setting(containerEl)
		.setName(t('settings.libraryNewNotePath'))
		.setDesc(t('settings.libraryNewNotePathDesc'))
		.addText((text) => {
			libraryNewNoteInput = text;
			text.setPlaceholder('Notes/library')
				.setValue(this.plugin.settings.libraryNewNotePath)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						libraryNewNotePath: value.trim(),
					};
					await this.plugin.saveSettings();
				});
		})
		.addExtraButton((btn) =>
			btn
				.setIcon('folder-search')
				.setTooltip(t('pathPicker.pickFolder'))
				.onClick(() => {
					new PathPickerModal(this.app, 'folder', (path) => {
						this.plugin.settings = {
							...this.plugin.settings,
							libraryNewNotePath: path,
						};
						void this.plugin.saveSettings();
						libraryNewNoteInput?.setValue(path);
					}).open();
				}),
		);

	new Setting(containerEl)
		.setName(t('settings.disableNotePopover'))
		.setDesc(t('settings.disableNotePopoverDesc'))
		.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.disableNotePopover).onChange(async (value) => {
				this.plugin.settings = { ...this.plugin.settings, disableNotePopover: value };
				await this.plugin.saveSettings();
			}),
		);
}

/** Visual layout picker: two miniature board diagrams side by side, each
 *  with a centered radio circle underneath as THE click target (no button
 *  bar — theme button styles constrained the old card's height and its
 *  content spilled onto the rows around it). The active card carries the
 *  accent ring and a filled circle; the choice saves and refreshes
 *  immediately. */
export function renderLayoutPicker(this: DashboardSettingTab, containerEl: HTMLElement): void {
	const picker = containerEl.createDiv({ cls: 'dashboard-layout-picker' });
	picker.setAttribute('role', 'radiogroup');
	const modes: DashboardLayoutMode[] = ['side', 'stacked'];

	const option = (mode: DashboardLayoutMode): HTMLElement => {
		const current = this.plugin.settings.layoutMode;
		const card = picker.createDiv({
			cls: 'dashboard-layout-option' + (current === mode ? ' dashboard-layout-option--active' : ''),
		});
		card.dataset.mode = mode;
		const label = mode === 'side' ? t('settings.layoutSide') : t('settings.layoutStacked');
		card.setAttribute('aria-label', label);

		// Three-zone mock: banner bar, widget zone (left rail in side
		// mode / horizontal strip in stacked mode), main sections.
		const preview = card.createDiv({
			cls: `dashboard-layout-preview dashboard-layout-preview--${mode}`,
		});
		preview.createDiv({ cls: 'lp-banner' });
		if (mode === 'side') {
			const main = preview.createDiv({ cls: 'lp-main' });
			const rail = main.createDiv({ cls: 'lp-rail' });
			for (let i = 0; i < 3; i++) rail.createDiv({ cls: 'lp-widget' });
			const board = main.createDiv({ cls: 'lp-board' });
			for (let i = 0; i < 3; i++) board.createDiv({ cls: 'lp-section' });
		} else {
			const strip = preview.createDiv({ cls: 'lp-strip' });
			for (let i = 0; i < 4; i++) strip.createDiv({ cls: 'lp-widget' });
			const board = preview.createDiv({ cls: 'lp-board' });
			for (let i = 0; i < 3; i++) board.createDiv({ cls: 'lp-section' });
		}

		// The circle is the only interactive element (a real button so it
		// is focusable; reset styling comes from the CSS class).
		const circle = card.createEl('button', {
			cls: 'dashboard-layout-radio',
			attr: { type: 'button', role: 'radio', 'aria-checked': String(current === mode), title: label },
		});
		circle.createDiv({ cls: 'dashboard-layout-radio-dot' });
		card.createDiv({ cls: 'dashboard-layout-option-label', text: label });

		circle.addEventListener('click', () => {
			if (this.plugin.settings.layoutMode === mode) return;
			void (async () => {
				this.plugin.settings = { ...this.plugin.settings, layoutMode: mode };
				await this.plugin.saveSettings();
				this.plugin.refreshAllDashboards();
				picker.querySelectorAll('.dashboard-layout-option').forEach((el) => {
					const opt = el as HTMLElement;
					const active = opt.dataset.mode === mode;
					opt.toggleClass('dashboard-layout-option--active', active);
					const radio = opt.querySelector('.dashboard-layout-radio');
					radio?.setAttribute('aria-checked', String(active));
				});
			})();
		});
		return card;
	};

	for (const mode of modes) option(mode);
}
