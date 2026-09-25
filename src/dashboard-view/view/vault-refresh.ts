import type { DashboardView } from './dashboard-view';
import { setIcon, TAbstractFile, TFile } from 'obsidian';
import type { DashboardColumn } from '../types';
import {
	destroyAllCharts,
	renderSidebarPomodoro,
	renderSidebarReading,
	refreshScanningSections,
	refreshMediaSections,
} from '../renderer';
import { refreshSidebarTaskCalendar } from '../calendar/calendar-widget';
import { refreshCalendarSections } from '../calendar/calendar-section';
import { renderSidebarHabitWidget, refreshHabitWidget } from '../habit/habit-widget';
import { renderSidebarExpenseWidget, refreshExpenseWidget } from '../expense/expense-widget';
import { refreshAlbumWidgets, destroyAlbumWidgets } from '../widgets/album-widget';
import { destroyAnniversaryTimers } from '../widgets/anniversary-widget';
import { refreshMusicWidget } from '../music/music-widget';
import { refreshBannerStats } from '../banner/banner-stats';
import { getRecentDocs, renderRecentDocs } from '../ui/recent';
import { setupDragAndDrop } from '../ui/dnd';
import { renderSidebarLunarWidget } from '../widgets/lunar-widget';
import { t } from '../../shared/i18n';
import { dashboardMarkdownPath } from '../ui/render-update';
import { captureScrollStates, restoreScrollStates } from '../ui/scroll-preserve';
import { fileKind } from '../../shared/file-types';

export function registerVaultListeners(this: DashboardView): void {
	this.unregisterVaultListeners();
	const events = this.app.vault;
	const dashboardPath = dashboardMarkdownPath(this.plugin.settings.dashboardFile);
	// Record one vault change. File events contribute their path (renames
	// both ends); folder events and unknown entities set the broad flag —
	// a folder carries no file path to scope-match, so refresh everything.
	// Our own dashboard-file writes are skipped: the engine owns that state
	// and handleDataUpdate has already re-rendered whatever they changed.
	const record = (file: TAbstractFile | null, oldPath?: string): void => {
		if (file instanceof TFile) {
			if (file.path !== dashboardPath) this.vaultChangePaths.add(file.path);
			if (oldPath && oldPath !== dashboardPath) this.vaultChangePaths.add(oldPath);
		} else {
			this.vaultChangeBroad = true;
		}
		this.scheduleVaultRefresh();
	};

	const createRef = events.on('create', (file: TAbstractFile) => record(file));
	const modifyRef = events.on('modify', (file: TAbstractFile) => {
		// Plain content edits only matter to the note-derived views; an
		// image overwrite with the same path renders identically.
		if (file instanceof TFile && file.extension === 'md') {
			record(file);
		}
	});
	const deleteRef = events.on('delete', (file: TAbstractFile) => record(file));
	const renameRef = events.on('rename', (file: TAbstractFile, oldPath: string) => record(file, oldPath));

	this.vaultEventRefs = [
		{ evt: events, ref: createRef },
		{ evt: events, ref: modifyRef },
		{ evt: events, ref: deleteRef },
		{ evt: events, ref: renameRef },
	];
}

export function unregisterVaultListeners(this: DashboardView): void {
	for (const { evt, ref } of this.vaultEventRefs) {
		evt.offref(ref as Parameters<typeof evt.offref>[0]);
	}
	this.vaultEventRefs = [];
	if (this.vaultRefreshTimer) {
		window.clearTimeout(this.vaultRefreshTimer);
		this.vaultRefreshTimer = null;
	}
	this.vaultChangePaths = new Set();
	this.vaultChangeBroad = false;
	if (this.bannerStatsTimer) {
		window.clearTimeout(this.bannerStatsTimer);
		this.bannerStatsTimer = null;
	}
}

/** One trailing debounce for every vault event. A burst of edits costs a
 *  single fan-out pass instead of five independently-reset timers. */
export function scheduleVaultRefresh(this: DashboardView): void {
	if (this.vaultRefreshTimer) window.clearTimeout(this.vaultRefreshTimer);
	this.vaultRefreshTimer = window.setTimeout(() => {
		this.vaultRefreshTimer = null;
		const paths = this.vaultChangePaths;
		const broad = this.vaultChangeBroad;
		this.vaultChangePaths = new Set();
		this.vaultChangeBroad = false;
		this.flushVaultRefresh(paths, broad);
	}, this.VAULT_REFRESH_DEBOUNCE);
}

/** Apply one debounced batch of vault changes. Each derived view is gated
 *  by what the batch can actually affect: note-derived sidebars and
 *  calendar sections need an .md change, album slideshows and media
 *  sections an image/audio/video one, and scanning sections a change
 *  inside their scan scope. */
export function flushVaultRefresh(this: DashboardView, paths: ReadonlySet<string>, broad: boolean): void {
	const lowerPaths = [...paths].map((p) => p.toLowerCase());
	const changedMd = broad || lowerPaths.some((p) => p.endsWith('.md'));
	const changedMedia =
		broad ||
		lowerPaths.some((p) => {
			const dot = p.lastIndexOf('.');
			const ext = dot >= 0 ? p.slice(dot + 1) : '';
			const kind = fileKind(ext);
			return kind === 'image' || kind === 'audio' || kind === 'video';
		});
	if (changedMd) {
		this.refreshRecentDocs();
		this.refreshSidebarCalendarNow();
		// Keeps its own extra debounce: the stats recompute walks the vault.
		this.debouncedRefreshBannerStats();
	}
	if (changedMedia) {
		this.refreshAlbumWidgetsNow();
	}
	this.refreshSectionsFor(lowerPaths, broad, changedMd, changedMedia);
}

/** Re-scan the sidebar task calendar in place (task dots). The widget DOM
 *  is preserved across full re-renders, so without this the dots would
 *  never update. */
export function refreshSidebarCalendarNow(this: DashboardView): void {
	if (!this.plugin.settings.widgetCalendarEnabled) return;
	const root = this.containerEl.children[1] as HTMLElement | undefined;
	if (root) refreshSidebarTaskCalendar(root);
}

/** Re-scan the album folders in place via the widget's controller: an
 *  unchanged path list leaves the slideshow position and timer untouched. */
export function refreshAlbumWidgetsNow(this: DashboardView): void {
	const albums = this.plugin.settings.albums ?? [];
	if (!albums.some((a) => a.folder.trim())) return;
	const root = this.containerEl.children[1] as HTMLElement | undefined;
	if (root) refreshAlbumWidgets(root, albums, this.app);
}

/** Rebuild only the sections whose scan scope intersects the changed
 *  paths. Library/folder sections are scoped by their configured folders
 *  (a library without folders scans the whole vault, so it always
 *  qualifies); calendar sections aggregate tasks across all notes, so any
 *  .md change qualifies; media sections react to media-file changes.
 *  `broad` (folder-level events) conservatively refreshes everything. */
export function refreshSectionsFor(
	this: DashboardView,
	lowerPaths: readonly string[],
	broad: boolean,
	changedMd: boolean,
	changedMedia: boolean,
): void {
	const data = this.sync.getData();
	if (!data) return;
	const sectionType = (col: { sectionType?: string }) => col.sectionType;
	const hasScanning = data.columns.some((col) => {
		const st = sectionType(col);
		return st === 'library' || st === 'calendar' || st === 'folder';
	});
	const hasMedia = data.columns.some((col) => {
		const st = sectionType(col);
		return st === 'images' || st === 'videos';
	});
	if (!hasScanning && !hasMedia) return;

	const root = this.containerEl.children[1] as HTMLElement | undefined;
	const kanban = root?.querySelector('.dashboard-kanban') as HTMLElement | null;
	if (!kanban) {
		// View not laid out yet — fall back to a full render.
		this.render(data);
		return;
	}

	const inScope = (col: DashboardColumn): boolean => {
		const folders = (col.libraryConfig?.folders ?? [])
			.map((f) => f.trim().replace(/^\/+|\/+$/g, ''))
			.filter((f) => f.length > 0);
		// No configured folders: the section scans the whole vault.
		if (folders.length === 0) return true;
		if (broad || lowerPaths.length === 0) return true;
		return lowerPaths.some((p) => folders.some((f) => p.startsWith(f.toLowerCase() + '/')));
	};
	const shouldRefreshScanning = (col: DashboardColumn): boolean => {
		const st = sectionType(col);
		// Tasks live in any note, so calendar sections follow every .md.
		if (st === 'calendar') return changedMd;
		return inScope(col);
	};

	const callbacks = this.createCallbacks();
	let swapped = 0;
	if (hasScanning) {
		swapped += refreshScanningSections(
			kanban,
			data,
			callbacks,
			this.app,
			this.plugin.settings,
			this,
			shouldRefreshScanning,
			dashboardMarkdownPath(this.plugin.settings.dashboardFile),
		);
		// Calendar sections refresh their grid in place (nav/filter state
		// preserved) instead of going through refreshScanningSections.
		if (changedMd) refreshCalendarSections(kanban);
	}
	if (hasMedia && changedMedia) {
		swapped += refreshMediaSections(kanban, data, callbacks, this.app, this.plugin.settings, this);
	}
	if (swapped > 0) {
		// Refreshed sections were replaced (new DOM), so their grip/card
		// DnD handlers are gone — re-wire DnD across the whole kanban.
		for (const fn of this.dndCleanupFns) fn();
		this.dndCleanupFns = [];
		setupDragAndDrop(kanban, callbacks, this.dndCleanupFns);
	}
}

/** Music state changed (transport tick, playlist edit from any surface):
 *  refresh only the derived parts of the sidebar widget. Desktop-only. */
export function onMusicChanged(this: DashboardView): void {
	const root = this.containerEl.children[1] as HTMLElement | undefined;
	if (root) refreshMusicWidget(root);
}

/** Habit data changed (toggle/add/rename/remove from any view or overlay):
 *  refresh the habit widget in place + the mobile habit panel, and let the
 *  banner debounce recompute when it shows the habit heatmap. */
export function onHabitChanged(this: DashboardView): void {
	const root = this.containerEl.children[1] as HTMLElement | undefined;
	if (root) refreshHabitWidget(root);
	const panel = root?.querySelector<HTMLElement>('.dashboard-mobile-widget-panel');
	if (panel && this.mobileWidgetExpanded === 'habit') {
		panel.empty();
		renderSidebarHabitWidget(panel, this.app);
	}
	this.debouncedRefreshBannerStats();
}

/** Expense data changed (entry added / record deleted from any view or
 *  the stats overlay): refresh the widget's derived labels in place + the
 *  mobile expense panel. The form inputs are never touched, so typing in
 *  this view survives entries made elsewhere. */
export function onExpenseChanged(this: DashboardView): void {
	const root = this.containerEl.children[1] as HTMLElement | undefined;
	if (root) refreshExpenseWidget(root);
	const panel = root?.querySelector<HTMLElement>('.dashboard-mobile-widget-panel');
	if (panel && this.mobileWidgetExpanded === 'expense') {
		panel.empty();
		renderSidebarExpenseWidget(panel, this.app);
	}
}

/** Pomodoro data changed externally (focus re-sync merged another
 *  device's records): re-render the widget in place + the mobile panel.
 *  Timer state lives in the service, so a running session is untouched. */
export function onPomodoroDataChanged(this: DashboardView): void {
	const service = this.pomodoroService;
	if (!service) return;
	this.refreshDataWidget('.dashboard-sidebar-pomodoro', (c) =>
		renderSidebarPomodoro(c, service, this.plugin.settings, this.app, (bg) => {
			this.plugin.settings = { ...this.plugin.settings, pomodoroBackground: bg };
			void this.plugin.saveSettings();
			this.plugin.refreshAllDashboards();
		}),
	);
	const root = this.containerEl.children[1] as HTMLElement | undefined;
	const panel = root?.querySelector<HTMLElement>('.dashboard-mobile-widget-panel');
	if (panel && this.mobileWidgetExpanded === 'pomodoro') {
		panel.empty();
		renderSidebarPomodoro(panel, service, this.plugin.settings);
	}
}

/** Reading data changed externally (focus re-sync merged another device's
 *  records): re-render the widget in place + the mobile panel. */
export function onReadingDataChanged(this: DashboardView): void {
	const service = this.readingService;
	if (!service) return;
	this.refreshDataWidget('.dashboard-sidebar-reading', (c) => renderSidebarReading(c, service));
	const root = this.containerEl.children[1] as HTMLElement | undefined;
	const panel = root?.querySelector<HTMLElement>('.dashboard-mobile-widget-panel');
	if (panel && this.mobileWidgetExpanded === 'reading') {
		panel.empty();
		renderSidebarReading(panel, service);
	}
}

/** Holiday data can arrive over the network after the first mobile paint.
 *  Update only the lunar widget/panel; a second full dashboard render here
 *  was one of the startup memory spikes that could trigger a WebView reload. */
export function refreshLunarWidgetsInPlace(this: DashboardView): void {
	this.refreshDataWidget('.dashboard-sidebar-lunar', (container) =>
		renderSidebarLunarWidget(container, this.holidayData, this.app),
	);
	const root = this.containerEl.children[1] as HTMLElement | undefined;
	const panel = root?.querySelector<HTMLElement>('.dashboard-mobile-widget-panel');
	if (panel && this.mobileWidgetExpanded === 'lunar') {
		panel.empty();
		renderSidebarLunarWidget(panel, this.holidayData, this.app);
	}
}

/** Re-render one sidebar data widget in place: render into a fresh mount
 *  at the same position, then drop the old node (emptying in place would
 *  nest a second .dashboard-sidebar-widget inside and confuse the
 *  sidebar's widget enumeration/drag handlers). The swapped widget's
 *  internal scroll (habit list, music playlist) carries over the swap so
 *  a data refresh elsewhere never yanks the widget's viewport. */
export function refreshDataWidget(
	this: DashboardView,
	selector: string,
	render: (container: HTMLElement) => void,
): void {
	const root = this.containerEl.children[1] as HTMLElement | undefined;
	const widget = root?.querySelector<HTMLElement>(selector);
	if (!widget || !widget.isConnected) return;
	const parent = widget.parentElement;
	if (!parent) return;
	const scrollStates = captureScrollStates(widget);
	const mount = createDiv();
	mount.addClass('dashboard-sidebar-widget-mount');
	// Carry the replaced widget's identity onto the mount: the stacked
	// widget grid keys its per-type sizing off [data-widget-key] on the
	// DIRECT child, which after this swap is the mount, not the widget.
	const key = widget.dataset.widgetKey;
	if (key) mount.dataset.widgetKey = key;
	const span = widget.style.getPropertyValue('--db-widget-span');
	if (span) mount.style.setProperty('--db-widget-span', span);
	parent.insertBefore(mount, widget);
	widget.remove();
	render(mount);
	restoreScrollStates(mount, scrollStates);
}

/** Recompute the stats banner in place (only when in stats mode). Vault
 *  changes are the trigger; debounced so a burst of edits costs one pass.
 *  Refresh regardless of whether a statsConfig is saved — defaults resolve
 *  at render time, so an absent config must not skip the refresh (that would
 *  freeze the stats after first paint). */
export function debouncedRefreshBannerStats(this: DashboardView): void {
	if (!this.data || this.data.banner.mode !== 'stats') return;
	if (this.bannerStatsTimer) window.clearTimeout(this.bannerStatsTimer);
	this.bannerStatsTimer = window.setTimeout(() => {
		const el = this.bannerStatsEl;
		if (el && el.isConnected) {
			refreshBannerStats(el, this.data!.banner.statsConfig, this.app);
		}
	}, this.BANNER_STATS_DEBOUNCE);
}

export function refreshRecentDocs(this: DashboardView): void {
	const root = this.containerEl.children[1] as HTMLElement;
	if (!root) return;

	const recentSection = root.querySelector('.dashboard-recent');
	if (!recentSection) return;

	const parent = recentSection.parentElement;
	if (!parent) return;

	recentSection.remove();
	const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
	renderRecentDocs(parent, docs, (path) => {
		void this.navigateToPath(path);
	});
}

/** Tear down per-render resources. With `preserveSidebarWidgets`, the sidebar
 *  widgets DOM is being re-attached (signature unchanged): its countdown
 *  timers and the pomodoro/reading services' onTick wiring (which reference
 *  live DOM inside it) must survive; a fresh widgets render re-wires them. */
export function runCleanup(this: DashboardView, preserveSidebarWidgets = false): void {
	destroyAllCharts(preserveSidebarWidgets ? this.sidebarWidgetsEl : null);
	destroyAlbumWidgets(preserveSidebarWidgets ? this.sidebarWidgetsEl : null);
	destroyAnniversaryTimers(preserveSidebarWidgets ? this.sidebarWidgetsEl : null);
	if (!preserveSidebarWidgets) {
		if (this.pomodoroService) {
			this.pomodoroService.setOnTick(null);
			this.pomodoroService.setOnComplete(null);
		}
		if (this.readingService) {
			this.readingService.setOnTick(null);
		}
	}
	for (const fn of this.cleanupFns) fn();
	this.cleanupFns = [];
	for (const fn of this.dndCleanupFns) fn();
	this.dndCleanupFns = [];
}

/**
 * Floating "back to top" button pinned to the bottom-right corner.
 *
 * The active scroll element differs by layout: on desktop the inner
 * `.dashboard-kanban` scrolls; on mobile (<=640px) the `.apex-dashboard-root`
 * itself scrolls. We detect which one is actually scrollable and listen to it,
 * so the button always scrolls the right container and only appears once the
 * user has scrolled down. Cleanup is registered so listeners are torn down on
 * re-render / close.
 */
export function renderScrollToTop(this: DashboardView, container: HTMLElement): void {
	const btn = container.createEl('button', {
		cls: 'dashboard-scroll-top',
		attr: { 'aria-label': t('renderer.scrollToTop'), type: 'button' },
	});
	setIcon(btn, 'arrow-up');

	// Pick the element that actually scrolls in the current layout.
	const root = container;
	const kanbanEl = container.querySelector('.dashboard-kanban');
	const regionEl = container.querySelector('.dashboard-scroll-region');
	const pickScroller = (): HTMLElement => {
		if (window.innerWidth <= 640) return root;
		// Stacked layout: the shared region scrolls (widgets + sections);
		// the kanban itself is a static pass-through there.
		return (regionEl as HTMLElement) ?? (kanbanEl as HTMLElement) ?? root;
	};

	const updateVisibility = (): void => {
		const scroller = pickScroller();
		const threshold = Math.max(160, scroller.clientHeight * 0.3);
		if (scroller.scrollTop > threshold) {
			btn.addClass('dashboard-scroll-top--visible');
		} else {
			btn.removeClass('dashboard-scroll-top--visible');
		}
	};

	btn.addEventListener('click', () => {
		const scroller = pickScroller();
		scroller.scrollTo({ top: 0, behavior: 'smooth' });
	});

	// Listen on both candidates: cheap, and covers desktop↔mobile resizes.
	const onKanbanScroll = (): void => updateVisibility();
	const onRootScroll = (): void => updateVisibility();
	const onResize = (): void => updateVisibility();
	if (kanbanEl) kanbanEl.addEventListener('scroll', onKanbanScroll, { passive: true });
	root.addEventListener('scroll', onRootScroll, { passive: true });
	window.addEventListener('resize', onResize);

	this.cleanupFns.push(() => {
		btn.remove();
		if (kanbanEl) kanbanEl.removeEventListener('scroll', onKanbanScroll);
		root.removeEventListener('scroll', onRootScroll);
		window.removeEventListener('resize', onResize);
	});

	updateVisibility();
}
