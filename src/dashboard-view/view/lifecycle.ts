import type { DashboardView } from './dashboard-view';
import { Notice } from 'obsidian';
import type { DashboardData } from '../types';
import { invalidateScanningSectionSignatures } from '../renderer';
import { getMusicService } from '../music/music-service';
import { getHabitService } from '../habit/habit-service';
import { getExpenseService } from '../expense/expense-service';
import { showPromptDialog } from '../ui/prompt-dialog';
import { loadHolidayData } from '../widgets/lunar-widget';
import { PomodoroService } from '../pomodoro/pomodoro-service';
import { createPomodoroMiniPanel } from '../pomodoro/pomodoro-mini-panel';
import { createReadingMiniTimer } from '../reading/reading-mini-timer';
import { ReadingService } from '../reading/reading-service';
import { t } from '../../shared/i18n';
import { planDashboardUpdate, type DashboardUpdateSource } from '../ui/render-update';

export function showModuleDisabled(this: DashboardView): void {
	if (this.isOpen || this.isOpening) {
		void onClose.call(this);
	}
	const root = this.containerEl.children[1] as HTMLElement | undefined;
	if (!root) return;
	root.empty();
	root.addClass('nand-module-off');
	root.createEl('p', { text: t('modules.dashboardOff') });
	const button = root.createEl('button', { text: t('modules.openHome') });
	button.addEventListener('click', () => this.plugin.openHome());
}

export async function onOpen(this: DashboardView): Promise<void> {
	if (!this.plugin.settings.modules.dashboard) {
		showModuleDisabled.call(this);
		return;
	}
	if (this.isOpening || this.isOpen) return;
	this.isOpening = true;
	const revision = ++this.lifecycleRevision;
	this.sync.updateSettings(this.plugin.settings);
	await this.sync.init();
	if (revision !== this.lifecycleRevision) return;
	// The banner "streak" auto-detects the Daily Notes core plugin, whose
	// internal-plugins state may report as not-yet-enabled during the very
	// first render. Re-compute once the metadata cache has fully resolved so
	// the number never flashes an incorrect value from the startup race.
	// One-shot guard: `resolved` can fire repeatedly on large vaults.
	this.registerEvent(
		this.app.metadataCache.on('resolved', () => {
			if (this.bannerStatsResolvedOnce) return;
			this.bannerStatsResolvedOnce = true;
			// Sections rendered before the cache resolved may hold partially
			// indexed frontmatter; their path+mtime signatures cannot see that,
			// so drop them to force a rebuild on the next vault event.
			invalidateScanningSectionSignatures();
			this.debouncedRefreshBannerStats();
		}),
	);
	this.pomodoroService = new PomodoroService(this.plugin);
	this.readingService = new ReadingService(this.plugin);
	const holidayDataPromise = loadHolidayData(this.app);
	// Load both data files in parallel — on mobile either can block on an
	// iCloud download, and the old serial awaits stacked both waits into
	// view-open time. Holiday data may require a network request, so it must
	// never hold the first dashboard render hostage.
	await Promise.all([this.pomodoroService.loadSessions(), this.readingService.loadSessions()]);
	if (revision !== this.lifecycleRevision) return;
	// Body-level floating countdown pill; polls the service on its own so
	// it survives sidebar re-renders and stays up while other tabs show.
	this.pomodoroMiniPanel = createPomodoroMiniPanel(this.plugin, this.pomodoroService, this.containerEl.ownerDocument);
	// Tiny top-right elapsed-time pill while a reading session runs; its
	// stop button opens the same end-of-reading flow as the sidebar card.
	this.readingMiniTimer = createReadingMiniTimer(this.readingService, this.containerEl.ownerDocument);
	// Habit data is plugin-level: every open view subscribes so a check-in
	// in one view refreshes the widget and banner in all of them.
	this.habitUnsubscribe = getHabitService()?.subscribe(() => this.onHabitChanged()) ?? null;
	this.expenseUnsubscribe = getExpenseService()?.subscribe(() => this.onExpenseChanged()) ?? null;
	// Music is desktop-only (no service on mobile → null subscription).
	this.musicUnsubscribe = getMusicService()?.subscribe(() => this.onMusicChanged()) ?? null;
	// Focus re-sync merges another device's records and notifies — refresh
	// the pomodoro/reading widgets without restarting the timers.
	this.pomodoroUnsubscribe = this.pomodoroService.subscribe(() => this.onPomodoroDataChanged());
	this.readingUnsubscribe = this.readingService.subscribe(() => this.onReadingDataChanged());
	this.registerVaultListeners();
	this.startReminderChecker();
	this.startWeatherRefresh();
	this.startDayRolloverChecker();
	this.isOpen = true;
	this.isOpening = false;
	const initialData = this.pendingInitialData ?? this.sync.getData();
	this.pendingInitialData = null;
	if (initialData) this.render(initialData);
	void holidayDataPromise.then((data) => {
		if (revision !== this.lifecycleRevision || !this.isOpen) return;
		this.holidayData = data;
		this.refreshLunarWidgetsInPlace();
	});
}

export async function onClose(this: DashboardView): Promise<void> {
	this.lifecycleRevision++;
	this.isOpening = false;
	this.isOpen = false;
	this.pendingInitialData = null;
	this.popoverModal?.close();
	this.popoverModal = null;
	this.runCleanup();
	this.unregisterVaultListeners();
	this.stopReminderChecker();
	this.stopWeatherRefresh();
	this.stopDayRolloverChecker();
	this.pomodoroMiniPanel?.destroy();
	this.pomodoroMiniPanel = null;
	this.readingMiniTimer?.destroy();
	this.readingMiniTimer = null;
	this.pomodoroService?.destroy();
	this.pomodoroService = null;
	this.readingService?.destroy();
	this.readingService = null;
	this.habitUnsubscribe?.();
	this.habitUnsubscribe = null;
	this.expenseUnsubscribe?.();
	this.expenseUnsubscribe = null;
	this.musicUnsubscribe?.();
	this.musicUnsubscribe = null;
	this.pomodoroUnsubscribe?.();
	this.pomodoroUnsubscribe = null;
	this.readingUnsubscribe?.();
	this.readingUnsubscribe = null;
	this.sync.destroy();
}

export function handleDataUpdate(this: DashboardView, data: DashboardData, source: DashboardUpdateSource): void {
	const previous = this.data;
	this.data = data;
	if (this.isOpening || !this.isOpen) {
		this.pendingInitialData = data;
		return;
	}
	if (this.suppressNextRender) {
		this.suppressNextRender = false;
		return;
	}

	const plan = planDashboardUpdate(previous, data, source);
	if (plan.kind === 'none') return;
	if (plan.kind === 'sections') {
		// A height-only change on a calendar or web section is already live
		// in the DOM (the resize handle writes the inline height as it
		// drags); rebuilding would reset the calendar's month/week navigation
		// or reload the web section's embedded page for no gain.
		// Skip those; every other change re-renders as usual.
		const buildable = plan.names.filter((name) => {
			if (!previous) return true;
			const idx = data.columns.findIndex((c) => c.name === name);
			const before = previous.columns[idx];
			const after = data.columns[idx];
			if (!before || !after || (after.sectionType !== 'calendar' && after.sectionType !== 'web')) return true;
			return JSON.stringify({ ...before, height: undefined }) !== JSON.stringify({ ...after, height: undefined });
		});
		if (buildable.length === 0) return;
		const refreshed = buildable.every((name) => this.refreshSectionInPlace(name));
		if (refreshed) return;
	}
	this.render(data);
}

export async function refresh(this: DashboardView): Promise<void> {
	this.sync.updateSettings(this.plugin.settings);
	const data = this.sync.getData();
	if (data) {
		this.render(data);
	}
}

/** Reload the dashboard file from disk (e.g. after a backup restore) and
 *  re-render. The sync engine re-reads and notifies, which triggers render. */
export async function reloadFromDisk(this: DashboardView): Promise<void> {
	await this.sync.reloadFromDisk();
}

/** Re-point this view's engine at the (already-updated) active workspace and
 *  reload. Called by the plugin after any workspace switch/registry change.
 *  Settings objects are replaced (not mutated) on every save, so the fresh
 *  reference must be pushed into the engine before it re-resolves the file. */
export async function applyWorkspaceSwitch(this: DashboardView): Promise<void> {
	this.sync.updateSettings(this.plugin.settings);
	await this.sync.switchFile();
}

export async function addSection(this: DashboardView): Promise<void> {
	const name = await showPromptDialog(this.app, { title: t('renderer.sectionName') });
	if (name) {
		void this.sync.addColumn(name);
	}
}

/** Flip the banner between poster & quotes and the stats dashboard.
 *  updateBanner persists the new mode and re-renders via the sync callback. */
export async function toggleBannerMode(this: DashboardView): Promise<void> {
	const data = this.sync.getData();
	if (!data) return;
	const nextMode = data.banner.mode === 'stats' ? 'quote' : 'stats';
	await this.sync.updateBanner({ mode: nextMode });
	new Notice(nextMode === 'stats' ? t('main.bannerModeStats') : t('main.bannerModeQuote'));
}
