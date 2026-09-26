import { Notice, Platform, Plugin, TAbstractFile, TFile } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	type DashboardSettings,
	type CountdownConfig,
	type AlbumConfig,
	type AnniversaryConfig,
} from '../dashboard-view/types';
import { normalizeTransition } from '../dashboard-view/widgets/album-widget';
import { DashboardSettingTab } from './settings';
import { DashboardView, DASHBOARD_VIEW_TYPE, showModuleDisabled } from '../dashboard-view';
import { EditorView, EDITOR_VIEW_TYPE, createEditorHost, type EditorHost, collectReferences } from '../editor-view';
import { TerminalAgentController, TERMINAL_VIEW_TYPE, readLegacyTerminalSettings } from '../terminal-agent';
import { setLanguage, t } from '../shared/i18n';
import { normalizeEditorWorkbench } from '../shared/editor-workbench';
import { IntroModal } from './intro-modal';
import { InactiveTerminalView } from './inactive-terminal-view';
import { terminalLeafKind } from './terminal-leaf-kind';

import { teardownBasenameIndex } from '../dashboard-view/renderer';
import { MediaTagService, sanitizeMediaTags, registerMediaTagService } from '../dashboard-view/media/media-tags';
import { HabitService, registerHabitService } from '../dashboard-view/habit/habit-service';
import { ExpenseService, registerExpenseService } from '../dashboard-view/expense/expense-service';
import { MusicService, registerMusicService } from '../dashboard-view/music/music-service';
import { generateDefaultMarkdown } from '../dashboard-view/parser';
import { registerShellCommands } from './commands';
import {
	alignWorkspaceNames,
	migrateWorkspaces,
	nextWorkspacePath,
	normalizeWorkspacePath,
	pruneMissingWorkspaces,
} from '../dashboard-view/workspace/workspace-registry';

/** All valid style preset keys — single source of truth for migration. */
const VALID_STYLE_PRESETS = [
	'earth',
	'nordic',
	'aurora',
	'blossom',
	'lilac',
	'island',
	'tundra',
	'matcha',
	'mono',
	'neon',
	'volt',
	'magma',
	'onyx',
] as const;

/** Removed or renamed presets mapped to a sensible replacement. */
const DEPRECATED_STYLE_PRESETS: Readonly<Record<string, string>> = {
	// Removed in favor of similar themes:
	prism: 'blossom', // rose glass -> Blossom (rose glass)
	dusk: 'lilac', // purple twilight -> Lilac (Morandi purple)
	sakura: 'blossom', // cherry blossom pink -> Blossom
	moonlight: 'nordic', // silver blue -> Nordic (blue minimal)
	ember: 'magma', // warm smoke -> Magma (dark + warm orange)
	haze: 'volt', // dark cyan glow -> Volt (dark + electric cyan)
	jade: 'matcha', // green bamboo -> Matcha (Morandi green)
	carbon: 'mono', // industrial monochrome -> Mono (b/w minimal)
};

/**
 * Normalize a saved style preset: map removed/renamed presets to a valid
 * replacement, and fall back to the default if the value is unknown.
 */
function migrateStylePreset(preset: string): string {
	if ((VALID_STYLE_PRESETS as readonly string[]).includes(preset)) {
		return preset;
	}
	return DEPRECATED_STYLE_PRESETS[preset] ?? DEFAULT_SETTINGS.stylePreset;
}

/**
 * Migrate the legacy single-countdown fields (countdownTargetDate etc.) into
 * the new countdowns[] list. Existing list entries are preserved as-is.
 */
/** One year before today as YYYY-MM-DD (dynamic so a default anniversary
 *  entry always reads sensibly, never a hardcoded stale year). */
function oneYearAgoIso(): string {
	const d = new Date();
	d.setFullYear(d.getFullYear() - 1);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function migrateCountdowns(raw: Record<string, unknown>): CountdownConfig[] {
	if (Array.isArray(raw.countdowns)) {
		return (raw.countdowns as CountdownConfig[]).filter((c) => c && typeof c.id === 'string');
	}
	const targetDate = typeof raw.countdownTargetDate === 'string' ? raw.countdownTargetDate : '';
	if (!targetDate) return [];
	return [
		{
			id: 'migrated',
			label: typeof raw.countdownLabel === 'string' ? raw.countdownLabel : '',
			targetDate,
			displayMode:
				raw.countdownDisplayMode === 'hours' || raw.countdownDisplayMode === 'minutes'
					? raw.countdownDisplayMode
					: 'days',
			reminderDays: typeof raw.countdownReminderDays === 'number' ? raw.countdownReminderDays : 0,
		},
	];
}

/** Migrate the legacy single-album flat fields (widgetAlbum*) to the albums[]
 *  list. An existing albums[] wins untouched; the legacy fields stay in
 *  data.json so a downgrade keeps the old single widget working. */
function migrateAlbums(raw: Record<string, unknown>): AlbumConfig[] {
	if (Array.isArray(raw.albums)) {
		return (raw.albums as AlbumConfig[]).filter((a) => a && typeof a.id === 'number');
	}
	if (!raw.widgetAlbumEnabled) return [];
	return [
		{
			id: Date.now(),
			folder: typeof raw.widgetAlbumFolder === 'string' ? raw.widgetAlbumFolder : '',
			intervalSec:
				typeof raw.widgetAlbumIntervalSec === 'number' && raw.widgetAlbumIntervalSec > 0
					? raw.widgetAlbumIntervalSec
					: 8,
			recursive: raw.widgetAlbumRecursive !== false,
			ratio: raw.widgetAlbumRatio === '3:4' ? '3:4' : '1:1',
			transition: normalizeTransition(raw.widgetAlbumTransition as string | undefined),
			heightRatio: 'full',
		},
	];
}

/** Sanitize the anniversaries[] list (id must be a string); missing key = []. */
function migrateAnniversaries(raw: Record<string, unknown>): AnniversaryConfig[] {
	if (!Array.isArray(raw.anniversaries)) return [];
	return (raw.anniversaries as AnniversaryConfig[]).filter(
		(a) => a && typeof a.id === 'string' && typeof a.startDate === 'string',
	);
}

export default class DashboardPlugin extends Plugin {
	settings!: DashboardSettings;
	mediaTagService!: MediaTagService;
	habitService!: HabitService;
	expenseService!: ExpenseService;
	/** Desktop-only NetEase player; its detached <audio> must outlive views. */
	musicService?: MusicService;
	/** Lives while the editor module is on, even when the editor panel is closed. */
	editorHost?: EditorHost;
	/** Desktop PTY host. Absent on phones and while the agent module is off. */
	terminalHost?: TerminalAgentController;
	private settingsTab!: DashboardSettingTab;
	private dashboardServicesStarted = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
		this.registerView(EDITOR_VIEW_TYPE, (leaf) => new EditorView(leaf, this));
		this.registerView(TERMINAL_VIEW_TYPE, (leaf) => {
			if (this.terminalHost?.isActive()) return this.terminalHost.createLeafView(leaf);
			return new InactiveTerminalView(leaf, this);
		});

		await this.applyModuleFlags();

		this.addRibbonIcon('home', t('main.openHome'), () => this.openHome());
		this.addRibbonIcon('pen-line', t('editor.openPanel'), () => {
			void this.openEditorView();
		});

		registerShellCommands(this);

		this.addCommand({
			id: 'cycle-theme',
			name: t('main.cycleTheme'),
			callback: async () => {
				const themes = [
					'earth',
					'nordic',
					'aurora',
					'blossom',
					'lilac',
					'island',
					'tundra',
					'matcha',
					'mono',
					'neon',
					'volt',
					'magma',
					'onyx',
				];
				const idx = themes.indexOf(this.settings.stylePreset);
				const next = themes[(idx + 1) % themes.length] ?? 'earth';
				this.settings = { ...this.settings, stylePreset: next };
				await this.saveSettings();
				this.refreshAllDashboards();
			},
		});

		this.addCommand({
			id: 'next-workspace',
			name: t('main.nextWorkspace'),
			callback: () => this.cycleWorkspace(1),
		});

		this.addCommand({
			id: 'previous-workspace',
			name: t('main.prevWorkspace'),
			callback: () => this.cycleWorkspace(-1),
		});

		this.addCommand({
			id: 'toggle-note-popover',
			name: t('main.toggleNotePopover'),
			callback: async () => {
				const value = !this.settings.disableNotePopover;
				this.settings = { ...this.settings, disableNotePopover: value };
				await this.saveSettings();
				new Notice(value ? t('main.notePopoverOff') : t('main.notePopoverOn'));
			},
		});

		this.addCommand({
			id: 'add-section',
			name: t('main.addSection'),
			callback: () => {
				const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
				if (leaves.length === 0) {
					new Notice(t('main.openDashboard'));
					return;
				}
				const leaf = leaves[0]!;
				if (leaf.view instanceof DashboardView) {
					void leaf.view.addSection();
				}
			},
		});

		this.addCommand({
			id: 'toggle-banner-mode',
			name: t('main.toggleBannerMode'),
			callback: () => {
				const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
				if (leaves.length === 0) {
					new Notice(t('main.openDashboard'));
					return;
				}
				const leaf = leaves[0]!;
				if (leaf.view instanceof DashboardView) {
					void leaf.view.toggleBannerMode();
				}
			},
		});

		this.settingsTab = new DashboardSettingTab(this.app, this);
		this.addSettingTab(this.settingsTab);

		this.maybeShowIntro();

		// Registry hygiene: drop entries whose file vanished (sync lag, manual
		// deletion). After layout ready so the vault file index is settled.
		this.app.workspace.onLayoutReady(() => {
			if (!this.settings.modules.dashboard) return;
			void this.pruneWorkspaceRegistry();
		});
		// Keep the registry following the file explorer: renames/deletes of a
		// workspace file update the list (and the active entry) so the engine
		// watchers never point at a path that no longer exists.
		this.registerEvent(
			this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
				if (!this.settings.modules.dashboard) return;
				if (file instanceof TFile) void this.handleWorkspaceFileRenamed(file, oldPath);
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file: TAbstractFile) => {
				if (!this.settings.modules.dashboard) return;
				if (file instanceof TFile) void this.handleWorkspaceFileDeleted(file);
			}),
		);
	}

	private maybeShowIntro(): void {
		if (this.settings.introSeen) return;
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.introSeen) return;
			new IntroModal(this.app, () => {
				void this.markIntroSeen();
			}).open();
		});
	}

	private async markIntroSeen(): Promise<void> {
		if (this.settings.introSeen) return;
		this.settings = { ...this.settings, introSeen: true };
		await this.saveSettings();
	}

	openHome(): void {
		this.settingsTab.activeProduct = 'home';
		this.settingsTab.activePage = 'home';
		const setting = (this.app as unknown as {
			setting: { open: () => void; openTabById: (id: string) => void };
		}).setting;
		setting.open();
		setting.openTabById(this.manifest.id);
		this.settingsTab.refresh();
	}

	async applyModuleFlags(): Promise<void> {
		if (this.settings.modules.dashboard) await this.ensureDashboardServices();
		else this.stopDashboardServices();
		if (this.settings.modules.editor) this.ensureEditor();
		else this.stopEditor();
		if (this.settings.modules.terminal && Platform.isDesktopApp) await this.ensureTerminal();
		else await this.stopTerminal();
	}

	private async ensureDashboardServices(): Promise<void> {
		if (this.dashboardServicesStarted) return;
		this.dashboardServicesStarted = true;
		this.mediaTagService = new MediaTagService(this);
		this.mediaTagService.load();
		registerMediaTagService(this.mediaTagService);
		this.habitService = new HabitService(this);
		this.expenseService = new ExpenseService(this);
		await Promise.all([this.habitService.load(), this.expenseService.load()]);
		registerHabitService(this.habitService);
		registerExpenseService(this.expenseService);
		if (!Platform.isPhone) {
			this.musicService = new MusicService(this);
			await this.musicService.load();
			registerMusicService(this.musicService);
		}
		this.refreshDashboardLeaves();
	}

	private stopDashboardServices(): void {
		if (!this.dashboardServicesStarted) {
			this.refreshDashboardLeaves();
			return;
		}
		this.dashboardServicesStarted = false;
		registerMediaTagService(null);
		void this.mediaTagService.flush();
		this.mediaTagService.destroy();
		registerHabitService(null);
		this.habitService.destroy();
		registerExpenseService(null);
		this.expenseService.destroy();
		registerMusicService(null);
		this.musicService?.destroy();
		this.musicService = undefined;
		this.refreshDashboardLeaves();
	}

	private refreshDashboardLeaves(): void {
		if (!this.app.workspace.layoutReady) return;
		for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
			if (!(leaf.view instanceof DashboardView)) continue;
			if (this.settings.modules.dashboard) void leaf.view.onOpen();
			else showModuleDisabled.call(leaf.view);
		}
	}

	private ensureEditor(): void {
		if (!this.editorHost) this.editorHost = createEditorHost(this);
		this.editorHost.onload();
		this.refreshEditorLeaves();
	}

	private stopEditor(): void {
		this.editorHost?.onunload();
		this.refreshEditorLeaves();
	}

	private refreshEditorLeaves(): void {
		if (!this.app.workspace.layoutReady) return;
		for (const leaf of this.app.workspace.getLeavesOfType(EDITOR_VIEW_TYPE)) {
			if (leaf.view instanceof EditorView) void leaf.view.applyModuleGate();
		}
	}

	private async ensureTerminal(): Promise<void> {
		if (!Platform.isDesktopApp) return;
		if (!this.terminalHost) {
			this.terminalHost = new TerminalAgentController(this, {
				readAbsoluteReference: () => collectReferences(this.app, 'absolute'),
			});
			await this.terminalHost.onload();
		} else {
			this.terminalHost.activate();
		}
		await this.reopenTerminalLeaves();
	}

	private async stopTerminal(): Promise<void> {
		if (this.terminalHost?.isActive()) await this.terminalHost.deactivate();
		await this.reopenTerminalLeaves();
	}

	private async reopenTerminalLeaves(): Promise<void> {
		if (!this.app.workspace.layoutReady) return;
		const active = terminalLeafKind(this.terminalHost?.isActive() === true) === 'active';
		for (const leaf of this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)) {
			const next = active && this.terminalHost
				? this.terminalHost.createLeafView(leaf)
				: new InactiveTerminalView(leaf, this);
			await leaf.open(next);
		}
	}

	onunload(): void {
		this.terminalHost?.onunload();
		this.editorHost?.onunload();
		teardownBasenameIndex(this.app);
		if (!this.dashboardServicesStarted) return;
		registerMediaTagService(null);
		void this.mediaTagService.flush();
		this.mediaTagService.destroy();
		registerHabitService(null);
		this.habitService.destroy();
		registerExpenseService(null);
		this.expenseService.destroy();
		registerMusicService(null);
		this.musicService?.destroy();
	}

	async openDashboard(): Promise<void> {
		if (!this.settings.modules.dashboard) {
			new Notice(t('modules.disabledNotice'));
			this.openHome();
			return;
		}
		const existing = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.setActiveLeaf(existing[0]!, { focus: true });
			return;
		}
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
	}

	async openEditorView(): Promise<void> {
		if (!this.settings.modules.editor) {
			new Notice(t('modules.disabledNotice'));
			this.openHome();
			return;
		}
		const existing = this.app.workspace.getLeavesOfType(EDITOR_VIEW_TYPE);
		const open = existing[0];
		if (open) {
			await this.app.workspace.revealLeaf(open);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: EDITOR_VIEW_TYPE, active: true });
		void this.app.workspace.revealLeaf(leaf);
	}

	private terminalAgentImported = false;

	private async importTerminalAgent(raw: unknown): Promise<Record<string, unknown> | null> {
		if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
		const legacy = await readLegacyTerminalSettings(this.app);
		if (legacy && typeof legacy === 'object') {
			this.terminalAgentImported = true;
			return legacy as Record<string, unknown>;
		}
		return null;
	}

	async loadSettings(): Promise<void> {
		const loaded: unknown = await this.loadData();
		const raw = (loaded ?? {}) as Record<string, unknown> & Partial<DashboardSettings>;
		// Migrate old widgetTheme combo to individual flags
		if ('widgetTheme' in raw && typeof raw.widgetTheme === 'string') {
			const theme = raw.widgetTheme;
			raw.widgetWeatherEnabled = theme !== 'off';
			delete raw.widgetTheme;
		}
		// Migrate removed/renamed style presets so saved settings stay valid
		if (typeof raw.stylePreset === 'string') {
			raw.stylePreset = migrateStylePreset(raw.stylePreset);
		}
		// Migrate single-countdown flat fields to the countdowns[] list
		const countdowns = migrateCountdowns(raw);
		// Migrate the legacy single-album fields to albums[]; sanitize anniversaries
		const albums = migrateAlbums(raw);
		const anniversaries = migrateAnniversaries(raw);
		// Sanitize the media tag map (drop malformed entries, empty lists)
		const mediaTags = sanitizeMediaTags(raw.mediaTags);
		// Validate the workspace registry (files list + active entry)
		const workspace = migrateWorkspaces(raw);
		this.settings = {
			...DEFAULT_SETTINGS,
			...raw,
			countdowns,
			albums,
			anniversaries,
			mediaTags,
			workspaceFiles: workspace.files,
			workspaceNames: workspace.names,
			dashboardFile: workspace.active,
			editorWorkbench: normalizeEditorWorkbench(raw.editorWorkbench),
			terminalAgent: await this.importTerminalAgent(raw.terminalAgent),
			introSeen: raw.introSeen === true,
			modules: {
				dashboard: raw.modules?.dashboard !== false,
				editor: raw.modules?.editor !== false,
				terminal: raw.modules?.terminal !== false,
			},
		};
		// First install only (no data.json has ever existed): start with the
		// Common Actions bar enabled and the sidebar pinned open. Applied here
		// instead of DEFAULT_SETTINGS so users upgrading from older versions —
		// whose data.json may lack these keys — keep their current state.
		// The widget background presets likewise ship only to fresh installs
		// (the author's own photo picks) — an upgrade with no saved background
		// keeps its clean cards.
		if (loaded === null) {
			this.settings = {
				...this.settings,
				quickNotesEnabled: true,
				widgetHabitEnabled: true,
				quickActionsBackground: {
					image: 'https://images.pexels.com/photos/35462506/pexels-photo-35462506.jpeg',
					opacity: 100,
					dim: 0,
					blur: 0,
					foreground: 'light',
				},
				habitBackground: {
					image: 'https://images.pexels.com/photos/4958013/pexels-photo-4958013.jpeg',
					opacity: 100,
					dim: 30,
					blur: 0,
					foreground: 'light',
				},
				musicBackground: {
					image: 'https://images.pexels.com/photos/22710827/pexels-photo-22710827.jpeg',
					opacity: 95,
					dim: 0,
					blur: 0,
					foreground: '#f4ebeb',
				},
				countdownEnabled: true,
				countdowns: [
					{
						id: 'cd-default',
						label: t('defaults.countdownLabel'),
						targetDate: `${new Date().getFullYear()}-12-31T23:55`,
						displayMode: 'hours',
						reminderDays: 0,
						background: {
							image: 'https://images.pexels.com/photos/31409439/pexels-photo-31409439.jpeg',
							opacity: 100,
							dim: 0,
							blur: 0,
							foreground: 'light',
						},
					},
				],
				// Example anniversary so the widget ships with its background
				// styling already shown (the author's vault look). Dated one
				// year back from install so the elapsed value reads sensibly on
				// day one instead of a hardcoded year going stale.
				anniversaryEnabled: true,
				anniversaries: [
					{
						id: 'av-default',
						label: t('defaults.anniversaryLabel'),
						startDate: oneYearAgoIso(),
						precision: 'ymd' as const,
						annualReminder: false,
						background: {
							image: 'https://images.pexels.com/photos/10254198/pexels-photo-10254198.jpeg',
							opacity: 100,
							dim: 20,
							blur: 0,
							foreground: 'light',
						},
					},
				],
			};
			this.app.saveLocalStorage('apex-dashboard-sidebar-pinned', 'true');
			await this.saveSettings();
		} else if (this.terminalAgentImported) {
			await this.saveSettings();
		}
		setLanguage(this.settings.language);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	readTerminalAgent(): unknown {
		return this.settings.terminalAgent;
	}

	writeTerminalAgent(data: unknown): Promise<void> {
		this.settings = {
			...this.settings,
			terminalAgent: data && typeof data === 'object' ? data as Record<string, unknown> : null,
		};
		return this.saveSettings();
	}

	refreshAllDashboards(): void {
		const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		for (const leaf of leaves) {
			if (leaf.view instanceof DashboardView) {
				void leaf.view.refresh();
			}
		}
	}

	/** Reload every open dashboard view from disk (used after a backup restore). */
	async reloadAllDashboards(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		for (const leaf of leaves) {
			if (leaf.view instanceof DashboardView) {
				await leaf.view.reloadFromDisk();
			}
		}
	}

	// --- Multi-workspace orchestration -------------------------------------

	/** Serializes registry mutations + engine repoints: rapid clicks or a vault
	 *  rename/delete racing a user switch must never interleave two switchFile()
	 *  sequences on the same engine (duplicate watchers, duplicate renders). */
	private workspaceOps: Promise<void> = Promise.resolve();

	private runWorkspaceOp(op: () => Promise<void>): Promise<void> {
		const run = this.workspaceOps.then(op);
		this.workspaceOps = run.catch((err: unknown) => {
			console.error('Workspace operation failed:', err);
		});
		return this.workspaceOps;
	}

	/** File-existence check against the vault, extensionless path in. */
	private workspaceFileExists(path: string): boolean {
		const withExt = path.endsWith('.md') ? path : `${path}.md`;
		return !!this.app.vault.getFileByPath(withExt);
	}

	/** Switch the active workspace. `path` is a registry path (no .md). */
	async switchWorkspace(path: string): Promise<void> {
		return this.runWorkspaceOp(() => this.doSwitchWorkspace(path));
	}

	private async doSwitchWorkspace(path: string): Promise<void> {
		const target = normalizeWorkspacePath(path);
		if (!target || target === normalizeWorkspacePath(this.settings.dashboardFile)) return;
		if (!this.settings.workspaceFiles.includes(target)) return;
		this.settings = { ...this.settings, dashboardFile: target };
		// Persist BEFORE re-pointing engines: a crash mid-switch then reopens
		// on the new workspace instead of resurrecting the old one.
		await this.saveSettings();
		await this.repointAllViews();
	}

	/** Point every open dashboard view's engine at the (already-updated)
	 *  active workspace file and reload. Serial on purpose: each engine drains
	 *  its own queued writes into the OLD file before re-pointing, so two open
	 *  views never cross-write between workspace files. */
	private async repointAllViews(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		for (const leaf of leaves) {
			if (leaf.view instanceof DashboardView) {
				await leaf.view.applyWorkspaceSwitch();
			}
		}
	}

	/** Create a new workspace file with default board content, register it and
	 *  switch to it. */
	async createWorkspace(name: string): Promise<void> {
		return this.runWorkspaceOp(() => this.doCreateWorkspace(name));
	}

	private async doCreateWorkspace(name: string): Promise<void> {
		const trimmed = name.trim();
		const path = nextWorkspacePath(this.settings.workspaceFiles, trimmed, (p) => this.workspaceFileExists(p));
		try {
			const withExt = path.endsWith('.md') ? path : `${path}.md`;
			await this.app.vault.create(withExt, generateDefaultMarkdown());
		} catch (err) {
			console.error('Workspace file creation failed:', err);
			new Notice(t('workspace.createFailed'));
			return;
		}
		const names = alignWorkspaceNames(this.settings.workspaceFiles, this.settings.workspaceNames);
		this.settings = {
			...this.settings,
			workspaceFiles: [...this.settings.workspaceFiles, path],
			workspaceNames: [...names, trimmed],
			dashboardFile: path,
		};
		await this.saveSettings();
		await this.repointAllViews();
		new Notice(t('workspace.created', { name: trimmed || path }));
	}

	/** Rename a workspace's display name (tooltip/label only, file untouched). */
	async renameWorkspace(path: string, name: string): Promise<void> {
		const target = normalizeWorkspacePath(path);
		const idx = this.settings.workspaceFiles.indexOf(target);
		if (idx < 0) return;
		const trimmed = name.trim();
		const names = alignWorkspaceNames(this.settings.workspaceFiles, this.settings.workspaceNames);
		if (names[idx] === trimmed) return;
		this.settings = {
			...this.settings,
			workspaceNames: names.map((n, i) => (i === idx ? trimmed : n)),
		};
		await this.saveSettings();
		// Only labels change — a plain refresh rebuilds the banner switcher.
		this.refreshAllDashboards();
	}

	/** Unregister a workspace (the md file itself is kept on disk). Removing the
	 *  active workspace switches to the first remaining one. */
	async removeWorkspace(path: string): Promise<void> {
		return this.runWorkspaceOp(() => this.doRemoveWorkspace(path));
	}

	private async doRemoveWorkspace(path: string): Promise<void> {
		const files = this.settings.workspaceFiles;
		if (files.length <= 1) return;
		const target = normalizeWorkspacePath(path);
		const idx = files.indexOf(target);
		if (idx < 0) return;
		const names = alignWorkspaceNames(files, this.settings.workspaceNames);
		const nextFiles = files.filter((_, i) => i !== idx);
		const nextActive =
			target === normalizeWorkspacePath(this.settings.dashboardFile)
				? nextFiles[0]!
				: this.settings.dashboardFile;
		this.settings = {
			...this.settings,
			workspaceFiles: nextFiles,
			workspaceNames: names.filter((_, i) => i !== idx),
			dashboardFile: nextActive,
		};
		await this.saveSettings();
		await this.repointAllViews();
	}

	/** Reorder the workspace registry (banner pill order). Both indices refer
	 *  to the CURRENT registry order. */
	async reorderWorkspaces(from: number, to: number): Promise<void> {
		return this.runWorkspaceOp(() => this.doReorderWorkspaces(from, to));
	}

	private async doReorderWorkspaces(from: number, to: number): Promise<void> {
		const files = [...this.settings.workspaceFiles];
		const names = alignWorkspaceNames(files, this.settings.workspaceNames);
		if (from < 0 || from >= files.length || to < 0 || to >= files.length || from === to) return;
		const [movedFile] = files.splice(from, 1);
		const [movedName] = names.splice(from, 1);
		files.splice(to, 0, movedFile!);
		names.splice(to, 0, movedName!);
		this.settings = { ...this.settings, workspaceFiles: files, workspaceNames: names };
		await this.saveSettings();
		// Active workspace unchanged — only the pill order/numbers re-render.
		this.refreshAllDashboards();
	}

	/** Point a registered workspace at a new file location (e.g. after the user
	 *  moved the md outside Obsidian, where the vault rename listener cannot
	 *  follow). The target file must already exist and not be registered. */
	async retargetWorkspace(oldPath: string, newPath: string): Promise<void> {
		return this.runWorkspaceOp(() => this.doRetargetWorkspace(oldPath, newPath));
	}

	private async doRetargetWorkspace(oldPath: string, newPath: string): Promise<void> {
		const target = normalizeWorkspacePath(oldPath);
		const next = normalizeWorkspacePath(newPath);
		const idx = this.settings.workspaceFiles.indexOf(target);
		if (idx < 0 || !next || next === target) return;
		if (this.settings.workspaceFiles.includes(next)) {
			new Notice(t('workspace.pathExists'));
			return;
		}
		if (!this.workspaceFileExists(next)) {
			new Notice(t('workspace.pathNotFound', { file: `${next}.md` }));
			return;
		}
		const files = this.settings.workspaceFiles.map((p, i) => (i === idx ? next : p));
		const names = alignWorkspaceNames(this.settings.workspaceFiles, this.settings.workspaceNames);
		const active = normalizeWorkspacePath(this.settings.dashboardFile);
		const activeChanged = active === target;
		this.settings = {
			...this.settings,
			workspaceFiles: files,
			workspaceNames: names,
			dashboardFile: activeChanged ? next : this.settings.dashboardFile,
		};
		await this.saveSettings();
		if (activeChanged) {
			await this.repointAllViews();
		} else {
			this.refreshAllDashboards();
		}
	}

	/** Switch to the adjacent workspace (wraps around; no-op with one). */
	private cycleWorkspace(delta: 1 | -1): void {
		const files = this.settings.workspaceFiles;
		if (files.length < 2) return;
		const active = normalizeWorkspacePath(this.settings.dashboardFile);
		const idx = Math.max(0, files.indexOf(active));
		const next = files[(idx + delta + files.length) % files.length]!;
		void this.switchWorkspace(next);
	}

	/** Drop registry entries whose board file no longer exists. The active
	 *  entry is never pruned (SyncEngine recreates it), so no repoint is needed. */
	private async pruneWorkspaceRegistry(): Promise<void> {
		const active = normalizeWorkspacePath(this.settings.dashboardFile);
		const pruned = pruneMissingWorkspaces(
			this.settings.workspaceFiles,
			alignWorkspaceNames(this.settings.workspaceFiles, this.settings.workspaceNames),
			active,
			(p) => this.workspaceFileExists(p),
		);
		if (pruned.files.length === this.settings.workspaceFiles.length) return;
		this.settings = {
			...this.settings,
			workspaceFiles: pruned.files,
			workspaceNames: pruned.names,
		};
		await this.saveSettings();
		// Refresh so the banner switcher drops the vanished buttons.
		this.refreshAllDashboards();
	}

	/** A workspace file renamed in the file explorer: follow it in the registry
	 *  (and as the active path when applicable), then re-point the engines —
	 *  they still hold the same TFile, but their modify watcher captured the
	 *  old path string and must be re-registered. */
	private handleWorkspaceFileRenamed(file: TFile, oldPath: string): Promise<void> {
		return this.runWorkspaceOp(() => this.doHandleWorkspaceFileRenamed(file, oldPath));
	}

	private async doHandleWorkspaceFileRenamed(file: TFile, oldPath: string): Promise<void> {
		const oldEntry = normalizeWorkspacePath(oldPath);
		const idx = this.settings.workspaceFiles.indexOf(oldEntry);
		if (idx < 0) return;
		const newEntry = normalizeWorkspacePath(file.path);
		const names = alignWorkspaceNames(this.settings.workspaceFiles, this.settings.workspaceNames);
		const active = normalizeWorkspacePath(this.settings.dashboardFile);
		this.settings = {
			...this.settings,
			workspaceFiles: this.settings.workspaceFiles.map((p, i) => (i === idx ? newEntry : p)),
			workspaceNames: names,
			dashboardFile: active === oldEntry ? newEntry : this.settings.dashboardFile,
		};
		await this.saveSettings();
		await this.repointAllViews();
	}

	/** A workspace file deleted in the file explorer: drop it from the registry
	 *  and, when it was active, fall back to the first remaining workspace. */
	private handleWorkspaceFileDeleted(file: TFile): Promise<void> {
		return this.runWorkspaceOp(() => this.doHandleWorkspaceFileDeleted(file));
	}

	private async doHandleWorkspaceFileDeleted(file: TFile): Promise<void> {
		const entry = normalizeWorkspacePath(file.path);
		const files = this.settings.workspaceFiles;
		const idx = files.indexOf(entry);
		if (idx < 0) return;
		if (files.length <= 1) {
			// Last workspace file gone: reset to the default entry. The engine's
			// findOrCreateFile() recreates a default board rather than crashing
			// on an empty registry.
			this.settings = {
				...this.settings,
				workspaceFiles: ['dashboard'],
				workspaceNames: [''],
				dashboardFile: 'dashboard',
			};
		} else {
			const names = alignWorkspaceNames(files, this.settings.workspaceNames);
			const nextFiles = files.filter((_, i) => i !== idx);
			const active = normalizeWorkspacePath(this.settings.dashboardFile);
			this.settings = {
				...this.settings,
				workspaceFiles: nextFiles,
				workspaceNames: names.filter((_, i) => i !== idx),
				dashboardFile: active === entry ? nextFiles[0]! : this.settings.dashboardFile,
			};
		}
		await this.saveSettings();
		await this.repointAllViews();
	}
}
