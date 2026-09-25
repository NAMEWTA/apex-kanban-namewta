import { renderGeneralSettings, renderLayoutPicker } from './general';
import { renderWorkspaceSettings } from './workspace-settings';
import { renderServiceSettings } from './services';
import {
	renderWidgetSettings,
	renderWeatherSettings,
	renderLunarSettings,
	renderYearProgressSettings,
	attachCitySuggest,
	suggestCities,
} from './widgets-settings';
import { renderCountdownList, editCountdown, applyCountdownUpdate } from './countdown-settings';
import { renderAlbumSettings, editAlbum, applyAlbumUpdate } from './album-settings';
import { renderAnniversarySettings, editAnniversary, applyAnniversaryUpdate } from './anniversary-settings';
import { renderCalendarSettings } from './calendar-settings';
import { renderCoffeeSettings } from './coffee';
import { renderEditorSettings, renderSyncSettings } from './editor-settings';
import { renderWidgetBackgroundSetting } from './widget-background-setting';
import { App, Platform, PluginSettingTab, setIcon, Setting, type SettingDefinitionItem } from 'obsidian';
import type DashboardPlugin from '../main';
import type { DashboardSettings, CountdownConfig, AlbumConfig, AnniversaryConfig } from '../../dashboard-view/types';
import { t } from '../../shared/i18n';
import { renderTerminalAgentSettings, type TerminalSettingsSection } from '../../terminal-agent';
import { renderHomeSettings } from './home';
import { defaultPage, productOrder, sidePages, type SettingsPage, type SettingsProduct } from './nav';

export type { DashboardSettings };

/** Settings pages, shared by the declarative (1.13+) navigable
 *  definitions and the pre-1.13 fallback. Primary row on top, secondary
 *  list on the left. */

export class DashboardSettingTab extends PluginSettingTab {
	declare renderGeneralSettings: (containerEl: HTMLElement) => void;
	declare renderLayoutPicker: (containerEl: HTMLElement) => void;
	declare renderWorkspaceSettings: (containerEl: HTMLElement) => void;
	declare renderServiceSettings: (containerEl: HTMLElement) => void;
	declare renderWidgetSettings: (containerEl: HTMLElement) => void;
	declare renderWeatherSettings: (containerEl: HTMLElement) => void;
	declare renderLunarSettings: (containerEl: HTMLElement) => void;
	declare renderYearProgressSettings: (containerEl: HTMLElement) => void;
	declare attachCitySuggest: (inputEl: HTMLInputElement) => void;
	declare suggestCities: (
		inputEl: HTMLInputElement,
		query: string,
		dropdown: HTMLElement | null,
		close: () => void,
	) => Promise<HTMLElement | null>;
	declare renderCountdownList: (containerEl: HTMLElement) => void;
	declare editCountdown: (existing: CountdownConfig | null) => void;
	declare applyCountdownUpdate: (updated: CountdownConfig) => Promise<void>;
	declare renderAlbumSettings: (containerEl: HTMLElement) => void;
	declare editAlbum: (existing: AlbumConfig | null) => void;
	declare applyAlbumUpdate: (updated: AlbumConfig) => Promise<void>;
	declare renderAnniversarySettings: (containerEl: HTMLElement) => void;
	declare editAnniversary: (existing: AnniversaryConfig | null) => void;
	declare applyAnniversaryUpdate: (updated: AnniversaryConfig) => Promise<void>;
	declare renderCalendarSettings: (containerEl: HTMLElement) => void;
	declare renderCoffeeSettings: (containerEl: HTMLElement) => void;
	declare renderHomeSettings: (containerEl: HTMLElement) => void;
	declare renderEditorSettings: (containerEl: HTMLElement) => void;
	declare renderSyncSettings: (containerEl: HTMLElement) => void;
	declare renderWidgetBackgroundSetting: (
		containerEl: HTMLElement,
		key:
			| 'quickActionsBackground'
			| 'pomodoroBackground'
			| 'habitBackground'
			| 'musicBackground'
			| 'yearProgressBackground',
	) => void;

	plugin: DashboardPlugin;

	constructor(app: App, plugin: DashboardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Declarative settings bridge (Obsidian 1.13+): one inline group whose
	 * first row is the product navigation (首页 / 看板 / 编辑器 / 智能体 / 同步,
	 * defaulting to 常规). Every section stays a real definition row — tagged
	 * with its page and hidden via CSS while another tab is active — so
	 * Obsidian's unified settings search keeps indexing them all. Tab clicks
	 * only toggle row visibility in place; `update()` re-renders through the
	 * same callbacks and re-applies `activePage`, so no drift between the
	 * declarative path and the pre-1.13 fallback.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		// Each section renders inside one definition row. Obsidian styles rows
		// as horizontal flex (.setting-item), which would lay the section's
		// many rows out sideways — mark the host so CSS neutralizes it back
		// to a plain block container (styles.css), stacking vertically like
		// the pre-1.13 fallback tab. The .setting-item class itself stays so
		// Obsidian's search/scroll machinery keeps working.
		const asBlock = (setting: Setting) => {
			setting.settingEl.addClass('dashboard-settings-section');
			setting.settingEl.empty();
		};
		// Tag a section row with its page and hide it when another tab is
		// active (re-evaluated on every update() re-render).
		const onProduct = (product: SettingsProduct, page: SettingsPage) => (setting: Setting) => {
			setting.settingEl.dataset.settingsProduct = product;
			setting.settingEl.dataset.settingsPage = page;
			const hidden = this.activeProduct !== product || this.activePage !== page;
			setting.settingEl.toggleClass('dashboard-settings-page-hidden', hidden);
		};
		return [
			{
				type: 'group',
				items: [
					{
						name: t('settings.general'),
						searchable: false, // the tab bar, not a setting
						render: (setting) => {
							asBlock(setting);
							this.renderChrome(setting.settingEl);
						},
					},
					{
						name: t('settings.productHome'),
						desc: t('modules.dashboardDesc'),
						searchable: false,
						render: (setting) => {
							asBlock(setting);
							onProduct('home', 'home')(setting);
							this.renderHomeSettings(setting.settingEl);
						},
					},
					{
						name: t('settings.general'),
						desc: t('settings.languageDesc'),
						aliases: [
							t('settings.layoutMode'),
							t('settings.language'),
							t('settings.stylePreset'),
							t('settings.recentCount'),
							t('quickNote.title'),
							t('settings.workspaceList'),
							t('settings.libraryNewNotePath'),
							t('settings.memoTemplate'),
						],
						render: (setting) => {
							asBlock(setting);
							onProduct('dashboard', 'general')(setting);
							this.renderGeneralSettings(setting.settingEl);
						},
					},
					{
						name: t('settings.dataServices'),
						desc: t('settings.wereadApiKeyDesc'),
						aliases: [t('settings.wereadApiKey')],
						render: (setting) => {
							asBlock(setting);
							onProduct('dashboard', 'general')(setting);
							this.renderServiceSettings(setting.settingEl);
						},
					},
					{
						name: t('settings.widgetTheme'),
						desc: t('settings.widgetWeatherEnabledDesc'),
						aliases: [
							t('settings.widgetWeatherEnabled'),
							t('settings.widgetQuickActionsEnabled'),
							t('settings.countdownEnabled'),
							t('settings.pomodoroEnabled'),
							t('settings.readingEnabled'),
							t('settings.widgetHabitEnabled'),
							t('settings.widgetExpenseEnabled'),
							t('settings.widgetMusic'),
						],
						render: (setting) => {
							asBlock(setting);
							onProduct('dashboard', 'widgets')(setting);
							this.renderWeatherSettings(setting.settingEl);
						},
					},
					{
						name: t('settings.widgetCalendar'),
						desc: t('settings.widgetCalendarEnabledDesc'),
						aliases: [t('settings.widgetCalendarExclude')],
						render: (setting) => {
							asBlock(setting);
							onProduct('dashboard', 'widgets')(setting);
							this.renderCalendarSettings(setting.settingEl);
						},
					},
					{
						// Continuation of the widgetTheme block (pomodoro,
						// reading, habit, expense, countdown) — rendered between
						// the calendar section above and the lunar/year sections
						// below. The cards stay searchable through the
						// widgetTheme entry's aliases.
						name: t('settings.widgetTheme'),
						searchable: false,
						render: (setting) => {
							asBlock(setting);
							onProduct('dashboard', 'widgets')(setting);
							this.renderWidgetSettings(setting.settingEl);
						},
					},
					{
						name: t('settings.widgetLunar'),
						desc: t('settings.widgetLunarEnabledDesc'),
						render: (setting) => {
							asBlock(setting);
							onProduct('dashboard', 'widgets')(setting);
							this.renderLunarSettings(setting.settingEl);
						},
					},
					{
						name: t('settings.widgetYearProgress'),
						desc: t('settings.widgetYearProgressEnabledDesc'),
						render: (setting) => {
							asBlock(setting);
							onProduct('dashboard', 'widgets')(setting);
							this.renderYearProgressSettings(setting.settingEl);
						},
					},
					{
						name: t('settings.widgetAlbum'),
						desc: t('album.sectionDesc'),
						aliases: [t('album.add'), t('album.heightRatio')],
						render: (setting) => {
							asBlock(setting);
							onProduct('dashboard', 'widgets')(setting);
							this.renderAlbumSettings(setting.settingEl);
						},
					},
					{
						name: t('settings.widgetAnniversary'),
						desc: t('anniversary.enabledDesc'),
						aliases: [t('anniversary.add'), t('anniversary.annualReminder')],
						render: (setting) => {
							asBlock(setting);
							onProduct('dashboard', 'widgets')(setting);
							this.renderAnniversarySettings(setting.settingEl);
						},
					},
					{
						name: t('settings.tabEditor'),
						desc: t('settings.tabEditorDesc'),
						aliases: [t('editor.comments.title'), t('settings.editorHighlight'), t('settings.editorPopover')],
						render: (setting) => {
							asBlock(setting);
							onProduct('editor', 'comments')(setting);
							this.renderEditorSettings(setting.settingEl);
						},
					},
					{
						name: t('editor.copy.title'),
						desc: t('editor.copy.desc'),
						aliases: [t('editor.copy.relative'), t('editor.copy.absolute')],
						render: (setting) => {
							asBlock(setting);
							onProduct('editor', 'copy')(setting);
							new Setting(setting.settingEl)
								.setName(t('editor.copy.title'))
								.setDesc(t('editor.copy.desc'))
								.setHeading();
						},
					},
					{
						name: t('settings.productTerminal'),
						desc: t('settings.terminalDesktopOnly'),
						searchable: false,
						render: (setting) => {
							asBlock(setting);
							onProduct('terminal', this.activePage)(setting);
							this.renderTerminalProduct(setting.settingEl);
						},
					},
					{
						name: t('settings.tabSync'),
						desc: t('editor.sync.placeholder'),
						searchable: false,
						render: (setting) => {
							asBlock(setting);
							onProduct('sync', 'sync')(setting);
							this.renderSyncSettings(setting.settingEl);
						},
					},
					{
						name: t('settings.tabAbout'),
						searchable: false, // pure content, not a setting
						render: (setting) => {
							asBlock(setting);
							onProduct('dashboard', 'coffee')(setting);
							this.renderCoffeeSettings(setting.settingEl);
						},
					},
				],
			},
		];
	}

	/** Remembered across update() re-renders. */
	activeProduct: SettingsProduct = 'home';
	activePage: SettingsPage = 'home';

	productTabs(): Array<{ key: SettingsProduct; label: string; icon: string }> {
		const icons: Record<SettingsProduct, string> = {
			home: 'house',
			dashboard: 'layout-dashboard',
			editor: 'pen-line',
			terminal: 'terminal',
			sync: 'refresh-cw',
		};
		const labels: Record<SettingsProduct, string> = {
			home: t('settings.productHome'),
			dashboard: t('settings.productDashboard'),
			editor: t('settings.productEditor'),
			terminal: t('settings.productTerminal'),
			sync: t('settings.productSync'),
		};
		return productOrder().map((key) => ({ key, label: labels[key], icon: icons[key] }));
	}

	sectionTabs(): Array<{ key: SettingsPage; label: string; icon: string }> {
		const meta: Partial<Record<SettingsPage, { label: string; icon: string }>> = {
			general: { label: t('settings.tabGeneral'), icon: 'settings' },
			widgets: { label: t('settings.tabWidgets'), icon: 'layout-grid' },
			coffee: { label: t('settings.tabAbout'), icon: 'user-round' },
			comments: { label: t('editor.comments.title'), icon: 'message-square' },
			copy: { label: t('editor.copy.title'), icon: 'copy' },
			shell: { label: t('terminalAgent.settingsDetails.terminal.shellSettings'), icon: 'square-terminal' },
			instance: { label: t('terminalAgent.settingsDetails.terminal.instanceBehavior'), icon: 'columns-2' },
			workflows: { label: t('terminalAgent.settingsDetails.terminal.presetScripts'), icon: 'list-tree' },
			appearance: { label: t('terminalAgent.settingsDetails.terminal.displaySettings'), icon: 'palette' },
			behavior: { label: t('terminalAgent.settingsDetails.terminal.behaviorSettings'), icon: 'sliders-horizontal' },
			connection: { label: t('terminalAgent.settingsDetails.terminal.serverConnection'), icon: 'cable' },
			visibility: { label: t('terminalAgent.visibility.visibilitySettings'), icon: 'eye' },
			agents: { label: t('settings.productTerminal'), icon: 'bot' },
		};
		return sidePages(this.activeProduct).flatMap((key) => {
			const item = meta[key];
			return item ? [{ key, label: item.label, icon: item.icon }] : [];
		});
	}

	renderChrome(host: HTMLElement): void {
		host.empty();
		if (host.hasClass('dashboard-settings-section')) {
			host.addClass('nand-settings-chrome');
			host.closest('.vertical-tab-content')?.addClass('nand-settings');
		}
		const shell = host.createDiv({ cls: 'dashboard-settings-shell' });
		const products = shell.createDiv({ cls: 'dashboard-settings-products' });
		for (const tab of this.productTabs()) {
			const btn = products.createDiv({
				cls: 'dashboard-settings-tab' + (tab.key === this.activeProduct ? ' active' : ''),
			});
			setIcon(btn.createSpan({ cls: 'dashboard-settings-tab-icon' }), tab.icon);
			btn.createSpan({ text: tab.label });
			btn.addEventListener('click', () => {
				if (this.activeProduct === tab.key) return;
				this.activeProduct = tab.key;
				this.activePage = defaultPage(tab.key);
				this.refresh();
			});
		}
		const sections = this.sectionTabs();
		const layout = host.closest('.nand-settings, .dashboard-settings-root');
		layout?.toggleClass('nand-settings-split', sections.length > 0);
		if (sections.length === 0) return;
		const side = shell.createDiv({ cls: 'dashboard-settings-sidenav' });
		for (const tab of sections) {
			const btn = side.createDiv({
				cls: 'dashboard-settings-tab' + (tab.key === this.activePage ? ' active' : ''),
			});
			setIcon(btn.createSpan({ cls: 'dashboard-settings-tab-icon' }), tab.icon);
			btn.createSpan({ text: tab.label });
			btn.addEventListener('click', () => {
				if (this.activePage === tab.key) return;
				this.activePage = tab.key;
				this.refresh();
			});
		}
	}

	renderTerminalProduct(host: HTMLElement): void {
		if (!Platform.isDesktopApp || !this.plugin.terminalHost) {
			host.createEl('p', { text: t('settings.terminalDesktopOnly') });
			return;
		}
		const section = this.activePage;
		if (!isTerminalSection(section)) return;
		renderTerminalAgentSettings(host, this.plugin.terminalHost, section);
	}

	/** Fallback renderer for Obsidian < 1.13 (declarative API absent). */
	display(): void {
		this.renderFallback();
	}

	renderFallback(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.addClass('dashboard-settings-root');
		const barHost = containerEl.createDiv();
		this.renderChrome(barHost);

		const host = containerEl.createDiv({ cls: 'dashboard-settings-content' });
		if (this.activeProduct === 'home') {
			this.renderHomeSettings(host);
			return;
		}
		if (this.activeProduct === 'sync') {
			this.renderSyncSettings(host);
			return;
		}
		if (this.activeProduct === 'editor') {
			if (this.activePage === 'copy') {
				new Setting(host).setName(t('editor.copy.title')).setDesc(t('editor.copy.desc')).setHeading();
			} else {
				this.renderEditorSettings(host);
			}
			return;
		}
		if (this.activeProduct === 'terminal') {
			this.renderTerminalProduct(host);
			return;
		}
		if (this.activePage === 'general') {
			this.renderGeneralSettings(host);
			this.renderServiceSettings(host);
		} else if (this.activePage === 'widgets') {
			this.renderWeatherSettings(host);
			this.renderCalendarSettings(host);
			this.renderWidgetSettings(host);
			this.renderLunarSettings(host);
			this.renderYearProgressSettings(host);
			this.renderAlbumSettings(host);
			this.renderAnniversarySettings(host);
		} else {
			this.renderCoffeeSettings(host);
		}
	}

	/** Redraw when the sections themselves change (a widget toggled on/off,
	 *  countdown added, ...). update() arrived with the declarative API in
	 *  1.13; older builds have no definitions to rebuild from and redraw via
	 *  display() instead. */
	refresh(): void {
		const tab = this as unknown as { update?: () => void };
		if (typeof tab.update === 'function') tab.update();
		else this.renderFallback();
	}

	renderAboutSection(wrap: HTMLElement, heading: string, fill: (section: HTMLElement) => void): void {
		const section = wrap.createDiv({ cls: 'dashboard-about-section' });
		section.createDiv({ cls: 'dashboard-about-section-title', text: heading });
		fill(section);
	}
}

DashboardSettingTab.prototype.renderGeneralSettings = renderGeneralSettings;
DashboardSettingTab.prototype.renderLayoutPicker = renderLayoutPicker;
DashboardSettingTab.prototype.renderWorkspaceSettings = renderWorkspaceSettings;
DashboardSettingTab.prototype.renderServiceSettings = renderServiceSettings;
DashboardSettingTab.prototype.renderWidgetSettings = renderWidgetSettings;
DashboardSettingTab.prototype.renderWeatherSettings = renderWeatherSettings;
DashboardSettingTab.prototype.renderLunarSettings = renderLunarSettings;
DashboardSettingTab.prototype.renderYearProgressSettings = renderYearProgressSettings;
DashboardSettingTab.prototype.attachCitySuggest = attachCitySuggest;
DashboardSettingTab.prototype.suggestCities = suggestCities;
DashboardSettingTab.prototype.renderCountdownList = renderCountdownList;
DashboardSettingTab.prototype.editCountdown = editCountdown;
DashboardSettingTab.prototype.applyCountdownUpdate = applyCountdownUpdate;
DashboardSettingTab.prototype.renderAlbumSettings = renderAlbumSettings;
DashboardSettingTab.prototype.editAlbum = editAlbum;
DashboardSettingTab.prototype.applyAlbumUpdate = applyAlbumUpdate;
DashboardSettingTab.prototype.renderAnniversarySettings = renderAnniversarySettings;
DashboardSettingTab.prototype.editAnniversary = editAnniversary;
DashboardSettingTab.prototype.applyAnniversaryUpdate = applyAnniversaryUpdate;
DashboardSettingTab.prototype.renderCalendarSettings = renderCalendarSettings;
DashboardSettingTab.prototype.renderEditorSettings = renderEditorSettings;
DashboardSettingTab.prototype.renderSyncSettings = renderSyncSettings;
DashboardSettingTab.prototype.renderCoffeeSettings = renderCoffeeSettings;
DashboardSettingTab.prototype.renderHomeSettings = renderHomeSettings;
DashboardSettingTab.prototype.renderWidgetBackgroundSetting = renderWidgetBackgroundSetting;
function isTerminalSection(page: SettingsPage): page is TerminalSettingsSection {
	return (
		page === 'shell' ||
		page === 'instance' ||
		page === 'workflows' ||
		page === 'appearance' ||
		page === 'behavior' ||
		page === 'connection' ||
		page === 'visibility' ||
		page === 'agents'
	);
}
