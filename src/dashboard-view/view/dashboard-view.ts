import {
	onOpen,
	onClose,
	handleDataUpdate,
	refresh,
	reloadFromDisk,
	applyWorkspaceSwitch,
	addSection,
	toggleBannerMode,
} from './lifecycle';
import { render } from './render';
import {
	renderMobileActions,
	renderMobileWidgetBar,
	refreshMobileWidgetPanel,
	openMobileDrawer,
	closeMobileDrawer,
} from './mobile';
import { setupBannerBehavior, setupBannerRotation, renderBannerPinButton } from './banner-behavior';
import {
	renderSidebar,
	setupSidebarBehavior,
	applySidebarSizing,
	attachStripHeightHandle,
	attachSidebarWidthHandle,
	commitSidebarSizing,
} from './sidebar';
import { createCallbacks, handleFileDrop, saveMemoAsNote, saveTasksToDaily, archiveCompletedTasks } from './callbacks';
import {
	openBannerEditModal,
	openCardEditModal,
	openNotePopover,
	openNote,
	openNoteInTab,
	addColumnWithType,
	openAddSectionModal,
	openWidgetTypeModal,
	openStickyCardTypeModal,
	openWeatherConfigModal,
	openTrackerConfigModal,
	openTemplatePicker,
	openLibraryConfigModal,
	openDataviewConfigModal,
	openWebConfigModal,
	openMediaConfigModal,
	openWereadConfigModal,
	handleMoveCard,
	reorderCardsInDOM,
	refreshSectionInPlace,
	openFolderConfigModal,
	handleCardNewNote,
	openNotesSectionConfigModal,
	handleLibraryNewNote,
	openAddActionModal,
	openEditActionModal,
	deleteColumn,
	executeAction,
	openProjectSearchModal,
	promptAddColumn,
	navigateToPath,
} from './actions';
import {
	registerVaultListeners,
	unregisterVaultListeners,
	scheduleVaultRefresh,
	flushVaultRefresh,
	refreshSidebarCalendarNow,
	refreshAlbumWidgetsNow,
	refreshSectionsFor,
	onMusicChanged,
	onHabitChanged,
	onExpenseChanged,
	onPomodoroDataChanged,
	onReadingDataChanged,
	refreshLunarWidgetsInPlace,
	refreshDataWidget,
	debouncedRefreshBannerStats,
	refreshRecentDocs,
	runCleanup,
	renderScrollToTop,
} from './vault-refresh';
import {
	startReminderChecker,
	stopReminderChecker,
	startWeatherRefresh,
	stopWeatherRefresh,
	startDayRolloverChecker,
	stopDayRolloverChecker,
	checkDayRollover,
	checkReminders,
	showReminderModal,
} from './timers';
import type { RenderCallbacks } from '../types';
import { Events, HoverParent, HoverPopover, ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type DashboardPlugin from '../../plugin/main';
import type { DashboardData, DashboardCard, QuickAction, BannerData } from '../types';
import { SyncEngine } from '../persist/sync';
import { sidebarWidgetSignature } from '../renderer';
import { NotePopoverModal } from '../ui/note-popover-modal';
import type { HolidayInfo } from '../calendar/holiday-service';
import { PomodoroService } from '../pomodoro/pomodoro-service';
import type { PomodoroMiniPanel } from '../pomodoro/pomodoro-mini-panel';
import type { ReadingMiniTimer } from '../reading/reading-mini-timer';
import { ReadingService } from '../reading/reading-service';
import { t } from '../../shared/i18n';
import type { App } from 'obsidian';
import type { DashboardUpdateSource } from '../ui/render-update';

interface DailyNotesOptions {
	folder?: string;
	format?: string;
}

interface DailyNotesPlugin {
	enabled?: boolean;
	instance?: { options?: DailyNotesOptions };
}

/** Read the core "Daily notes" plugin handle (folder/format live on instance.options). */
export function getDailyNotesPlugin(app: App): DailyNotesPlugin | undefined {
	const internalPlugins = (
		app as unknown as {
			internalPlugins?: { getPluginById?: (id: string) => DailyNotesPlugin | undefined };
		}
	).internalPlugins;
	return internalPlugins?.getPluginById?.('daily-notes');
}

/** Insert `block` right after the YAML frontmatter (or at the very top when there
 *  is none), preserving the original frontmatter text verbatim. */
export function prependAfterFrontmatter(md: string, block: string): string {
	const fmMatch = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	if (fmMatch) {
		const header = fmMatch[0];
		const body = md.slice(header.length).replace(/^\s+/, '');
		return body ? `${header}${block}\n\n${body}` : `${header}${block}\n`;
	}
	const body = md.replace(/^\s+/, '');
	return body ? `${block}\n\n${body}` : `${block}\n`;
}

export const DASHBOARD_VIEW_TYPE = 'apex-dashboard-view';

export class DashboardView extends ItemView implements HoverParent {
	declare onOpen: () => Promise<void>;
	declare onClose: () => Promise<void>;
	declare handleDataUpdate: (data: DashboardData, source: DashboardUpdateSource) => void;
	declare refresh: () => Promise<void>;
	declare reloadFromDisk: () => Promise<void>;
	declare applyWorkspaceSwitch: () => Promise<void>;
	declare addSection: () => Promise<void>;
	declare toggleBannerMode: () => Promise<void>;
	declare render: (data: DashboardData) => void;
	declare renderMobileActions: (bannerEl: HTMLElement) => void;
	declare renderMobileWidgetBar: (container: HTMLElement) => void;
	declare refreshMobileWidgetPanel: (bar: HTMLElement) => void;
	declare openMobileDrawer: (type: 'quickActions' | 'recent') => void;
	declare closeMobileDrawer: () => void;
	declare setupBannerBehavior: (bannerEl: HTMLElement) => void;
	declare setupBannerRotation: (container: HTMLElement, banner: BannerData) => void;
	declare renderBannerPinButton: (bannerEl: HTMLElement) => void;
	declare renderSidebar: (sidebar: HTMLElement, root: HTMLElement, reuseWidgets: HTMLElement | null) => void;
	declare setupSidebarBehavior: (sidebar: HTMLElement, root: HTMLElement) => void;
	declare applySidebarSizing: (sidebar: HTMLElement) => void;
	declare attachStripHeightHandle: (sidebar: HTMLElement) => void;
	declare attachSidebarWidthHandle: (sidebar: HTMLElement) => void;
	declare commitSidebarSizing: (
		patch: { sidebarWidth?: number; widgetUnitHeight?: number },
		cssVar: string,
		value: string,
	) => void;
	declare createCallbacks: () => RenderCallbacks;
	declare handleFileDrop: (cardId: string, filePath: string) => void;
	declare saveMemoAsNote: (card: DashboardCard) => Promise<void>;
	declare saveTasksToDaily: (card: DashboardCard) => Promise<void>;
	declare archiveCompletedTasks: (columnName: string) => Promise<void>;
	declare openBannerEditModal: (data: DashboardData) => void;
	declare openCardEditModal: (card: DashboardCard) => void;
	declare openNotePopover: (file: TFile, subpath?: string, line?: number) => void;
	declare openNote: (file: TFile, subpath?: string, line?: number) => void;
	declare openNoteInTab: (file: TFile, subpath?: string, line?: number) => Promise<void>;
	declare addColumnWithType: (name: string, sectionType?: string) => Promise<void>;
	declare openAddSectionModal: () => void;
	declare openWidgetTypeModal: (colName: string) => void;
	declare openStickyCardTypeModal: (colName: string) => void;
	declare openWeatherConfigModal: (colName: string) => void;
	declare openTrackerConfigModal: (colName: string) => void;
	declare openTemplatePicker: (colName: string) => void;
	declare openLibraryConfigModal: (colName: string) => void;
	declare openDataviewConfigModal: (colName: string) => void;
	declare openWebConfigModal: (colName: string) => void;
	declare openMediaConfigModal: (colName: string) => void;
	declare openWereadConfigModal: (colName: string) => void;
	declare handleMoveCard: (cardId: string, targetCol: string, targetIdx: number) => Promise<void>;
	declare reorderCardsInDOM: (columnName: string) => boolean;
	declare refreshSectionInPlace: (columnName: string) => boolean;
	declare openFolderConfigModal: (colName: string) => void;
	declare handleCardNewNote: (cardId: string) => Promise<void>;
	declare openNotesSectionConfigModal: (colName: string) => void;
	declare handleLibraryNewNote: (columnName: string, pos?: { x: number; y: number }) => Promise<void>;
	declare openAddActionModal: () => void;
	declare openEditActionModal: (action: QuickAction) => void;
	declare deleteColumn: (columnName: string, columnIndex?: number) => Promise<void>;
	declare executeAction: (action: QuickAction) => Promise<void>;
	declare openProjectSearchModal: (colName: string) => void;
	declare promptAddColumn: () => Promise<void>;
	declare navigateToPath: (path: string) => Promise<void>;
	declare registerVaultListeners: () => void;
	declare unregisterVaultListeners: () => void;
	declare scheduleVaultRefresh: () => void;
	declare flushVaultRefresh: (paths: ReadonlySet<string>, broad: boolean) => void;
	declare refreshSidebarCalendarNow: () => void;
	declare refreshAlbumWidgetsNow: () => void;
	declare refreshSectionsFor: (
		lowerPaths: readonly string[],
		broad: boolean,
		changedMd: boolean,
		changedMedia: boolean,
	) => void;
	declare onMusicChanged: () => void;
	declare onHabitChanged: () => void;
	declare onExpenseChanged: () => void;
	declare onPomodoroDataChanged: () => void;
	declare onReadingDataChanged: () => void;
	declare refreshLunarWidgetsInPlace: () => void;
	declare refreshDataWidget: (selector: string, render: (container: HTMLElement) => void) => void;
	declare debouncedRefreshBannerStats: () => void;
	declare refreshRecentDocs: () => void;
	declare runCleanup: (preserveSidebarWidgets?: boolean) => void;
	declare renderScrollToTop: (container: HTMLElement) => void;
	declare startReminderChecker: () => void;
	declare stopReminderChecker: () => void;
	declare startWeatherRefresh: () => void;
	declare stopWeatherRefresh: () => void;
	declare startDayRolloverChecker: () => void;
	declare stopDayRolloverChecker: () => void;
	declare checkDayRollover: () => void;
	declare checkReminders: () => void;
	declare showReminderModal: (taskText: string, cardId: string, taskPath: number[]) => void;

	plugin: DashboardPlugin;
	sync: SyncEngine;
	data: DashboardData | null = null;
	cleanupFns: Array<() => void> = [];
	dndCleanupFns: Array<() => void> = [];
	suppressNextRender = false;
	vaultEventRefs: Array<{ evt: Events; ref: unknown }> = [];
	bannerStatsTimer: number | null = null;
	bannerStatsEl: HTMLElement | null = null;
	/** Vault changes accumulated across one debounce window: every changed
	 *  file path (renames contribute old AND new), plus a broad flag for
	 *  folder-level events whose own path carries no section-scope meaning.
	 *  One shared trailing debounce fans them out — see scheduleVaultRefresh. */
	vaultChangePaths = new Set<string>();
	vaultChangeBroad = false;
	vaultRefreshTimer: number | null = null;
	readonly VAULT_REFRESH_DEBOUNCE = 500;
	readonly BANNER_STATS_DEBOUNCE = 800;
	/** True after the first `metadataCache` `resolved` event corrected the
	 *  banner stats following startup. One-shot to avoid repeat recomputes. */
	bannerStatsResolvedOnce = false;
	bannerQuoteIndex = 0;
	bannerImageIndex = 0;
	static readonly BANNER_QUOTE_ROTATION_MS = 60 * 60 * 1000; // 1 hour (on the hour)
	static readonly BANNER_IMAGE_ROTATION_MS = 30 * 60 * 1000; // 30 min (on the half)
	static readonly REMINDER_CHECK_MS = 60 * 1000; // 1 minute
	static readonly BANNER_QUOTE_OFFSET_MS = 60 * 60 * 1000; // offset by 1 hour from image
	reminderTimer: number | null = null;
	firedReminders = new Set<string>();
	sidebarPinned = this.app.loadLocalStorage('apex-dashboard-sidebar-pinned') === 'true';
	sidebarExpanded = false;
	bannerCollapsed = this.app.loadLocalStorage('apex-dashboard-banner-collapsed') === 'true';
	pendingScrollCardId: string | null = null;
	pendingScrollToLastCardOfColumn: string | null = null;
	pomodoroService: PomodoroService | null = null;
	pomodoroMiniPanel: PomodoroMiniPanel | null = null;
	readingMiniTimer: ReadingMiniTimer | null = null;
	readingService: ReadingService | null = null;
	habitUnsubscribe: (() => void) | null = null;
	expenseUnsubscribe: (() => void) | null = null;
	musicUnsubscribe: (() => void) | null = null;
	pomodoroUnsubscribe: (() => void) | null = null;
	readingUnsubscribe: (() => void) | null = null;
	holidayData: Record<string, HolidayInfo> = {};
	mobileWidgetExpanded: 'pomodoro' | 'reading' | 'lunar' | 'calendar' | 'habit' | 'expense' | null = null;
	mobileWidgetTabsOpen: boolean = false;
	static readonly WEATHER_REFRESH_MS = 30 * 60 * 1000; // 30 minutes
	weatherRefreshTimer: number | null = null;
	static readonly DAY_ROLLOVER_CHECK_MS = 60 * 1000; // 1 minute
	dayRolloverTimer: number | null = null;
	lastRenderedDay = new Date().toDateString();
	/** Sidebar widgets DOM detached from the previous render, re-attached when the
	 *  widget signature (see sidebarWidgetSignature) is unchanged - so dashboard
	 *  data mutations never rebuild the widgets. Null right after consumption. */
	sidebarWidgetsEl: HTMLElement | null = null;
	sidebarWidgetsSig: string | null = null;
	isOpening = false;
	isOpen = false;
	lifecycleRevision = 0;
	pendingInitialData: DashboardData | null = null;

	// HoverParent contract: Obsidian assigns/clears this when showing a Page
	// Preview popover over a dashboard link. Declared so the dashboard can act as
	// the hover owner for `hover-link` events.
	hoverPopover: HoverPopover | null = null;

	// The currently-open centered note editor popover, if any. Tracked so it can
	// be torn down (detaching its embedded leaf) when the view closes.
	popoverModal: NotePopoverModal | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.sync = new SyncEngine(this.app, this.plugin.settings);
		this.sync.onDataUpdate((data, source) => {
			this.handleDataUpdate(data, source);
		});
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t('main.dashboard');
	}

	getIcon(): string {
		return 'home';
	}

	/** Reentrancy guard: a second toolbar click while the title prompt is open
	 *  must not stack a second dialog (overlay stacking is a known bug class). */
	libraryNewNoteInFlight = false;
	cardNewNoteInFlight = false;
}

DashboardView.prototype.onOpen = onOpen;
DashboardView.prototype.onClose = onClose;
DashboardView.prototype.handleDataUpdate = handleDataUpdate;
DashboardView.prototype.refresh = refresh;
DashboardView.prototype.reloadFromDisk = reloadFromDisk;
DashboardView.prototype.applyWorkspaceSwitch = applyWorkspaceSwitch;
DashboardView.prototype.addSection = addSection;
DashboardView.prototype.toggleBannerMode = toggleBannerMode;
DashboardView.prototype.render = render;
DashboardView.prototype.renderMobileActions = renderMobileActions;
DashboardView.prototype.renderMobileWidgetBar = renderMobileWidgetBar;
DashboardView.prototype.refreshMobileWidgetPanel = refreshMobileWidgetPanel;
DashboardView.prototype.openMobileDrawer = openMobileDrawer;
DashboardView.prototype.closeMobileDrawer = closeMobileDrawer;
DashboardView.prototype.setupBannerBehavior = setupBannerBehavior;
DashboardView.prototype.setupBannerRotation = setupBannerRotation;
DashboardView.prototype.renderBannerPinButton = renderBannerPinButton;
DashboardView.prototype.renderSidebar = renderSidebar;
DashboardView.prototype.setupSidebarBehavior = setupSidebarBehavior;
DashboardView.prototype.applySidebarSizing = applySidebarSizing;
DashboardView.prototype.attachStripHeightHandle = attachStripHeightHandle;
DashboardView.prototype.attachSidebarWidthHandle = attachSidebarWidthHandle;
DashboardView.prototype.commitSidebarSizing = commitSidebarSizing;
DashboardView.prototype.createCallbacks = createCallbacks;
DashboardView.prototype.handleFileDrop = handleFileDrop;
DashboardView.prototype.saveMemoAsNote = saveMemoAsNote;
DashboardView.prototype.saveTasksToDaily = saveTasksToDaily;
DashboardView.prototype.archiveCompletedTasks = archiveCompletedTasks;
DashboardView.prototype.openBannerEditModal = openBannerEditModal;
DashboardView.prototype.openCardEditModal = openCardEditModal;
DashboardView.prototype.openNotePopover = openNotePopover;
DashboardView.prototype.openNote = openNote;
DashboardView.prototype.openNoteInTab = openNoteInTab;
DashboardView.prototype.addColumnWithType = addColumnWithType;
DashboardView.prototype.openAddSectionModal = openAddSectionModal;
DashboardView.prototype.openWidgetTypeModal = openWidgetTypeModal;
DashboardView.prototype.openStickyCardTypeModal = openStickyCardTypeModal;
DashboardView.prototype.openWeatherConfigModal = openWeatherConfigModal;
DashboardView.prototype.openTrackerConfigModal = openTrackerConfigModal;
DashboardView.prototype.openTemplatePicker = openTemplatePicker;
DashboardView.prototype.openLibraryConfigModal = openLibraryConfigModal;
DashboardView.prototype.openDataviewConfigModal = openDataviewConfigModal;
DashboardView.prototype.openWebConfigModal = openWebConfigModal;
DashboardView.prototype.openMediaConfigModal = openMediaConfigModal;
DashboardView.prototype.openWereadConfigModal = openWereadConfigModal;
DashboardView.prototype.handleMoveCard = handleMoveCard;
DashboardView.prototype.reorderCardsInDOM = reorderCardsInDOM;
DashboardView.prototype.refreshSectionInPlace = refreshSectionInPlace;
DashboardView.prototype.openFolderConfigModal = openFolderConfigModal;
DashboardView.prototype.handleCardNewNote = handleCardNewNote;
DashboardView.prototype.openNotesSectionConfigModal = openNotesSectionConfigModal;
DashboardView.prototype.handleLibraryNewNote = handleLibraryNewNote;
DashboardView.prototype.openAddActionModal = openAddActionModal;
DashboardView.prototype.openEditActionModal = openEditActionModal;
DashboardView.prototype.deleteColumn = deleteColumn;
DashboardView.prototype.executeAction = executeAction;
DashboardView.prototype.openProjectSearchModal = openProjectSearchModal;
DashboardView.prototype.promptAddColumn = promptAddColumn;
DashboardView.prototype.navigateToPath = navigateToPath;
DashboardView.prototype.registerVaultListeners = registerVaultListeners;
DashboardView.prototype.unregisterVaultListeners = unregisterVaultListeners;
DashboardView.prototype.scheduleVaultRefresh = scheduleVaultRefresh;
DashboardView.prototype.flushVaultRefresh = flushVaultRefresh;
DashboardView.prototype.refreshSidebarCalendarNow = refreshSidebarCalendarNow;
DashboardView.prototype.refreshAlbumWidgetsNow = refreshAlbumWidgetsNow;
DashboardView.prototype.refreshSectionsFor = refreshSectionsFor;
DashboardView.prototype.onMusicChanged = onMusicChanged;
DashboardView.prototype.onHabitChanged = onHabitChanged;
DashboardView.prototype.onExpenseChanged = onExpenseChanged;
DashboardView.prototype.onPomodoroDataChanged = onPomodoroDataChanged;
DashboardView.prototype.onReadingDataChanged = onReadingDataChanged;
DashboardView.prototype.refreshLunarWidgetsInPlace = refreshLunarWidgetsInPlace;
DashboardView.prototype.refreshDataWidget = refreshDataWidget;
DashboardView.prototype.debouncedRefreshBannerStats = debouncedRefreshBannerStats;
DashboardView.prototype.refreshRecentDocs = refreshRecentDocs;
DashboardView.prototype.runCleanup = runCleanup;
DashboardView.prototype.renderScrollToTop = renderScrollToTop;
DashboardView.prototype.startReminderChecker = startReminderChecker;
DashboardView.prototype.stopReminderChecker = stopReminderChecker;
DashboardView.prototype.startWeatherRefresh = startWeatherRefresh;
DashboardView.prototype.stopWeatherRefresh = stopWeatherRefresh;
DashboardView.prototype.startDayRolloverChecker = startDayRolloverChecker;
DashboardView.prototype.stopDayRolloverChecker = stopDayRolloverChecker;
DashboardView.prototype.checkDayRollover = checkDayRollover;
DashboardView.prototype.checkReminders = checkReminders;
DashboardView.prototype.showReminderModal = showReminderModal;
