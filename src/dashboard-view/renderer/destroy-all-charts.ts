import { App, Component, Platform, TFile } from 'obsidian';
import type { HoverParent, EventRef } from 'obsidian';
import type { DashboardSettings } from '../types';
import { t, getLanguage } from '../../shared/i18n';
import { RATIO_SPAN, buildStackedSpanSpecs, resolveStackedSpans, isTieredWidgetKey } from '../widgets/widget-span';
import type { PomodoroService } from '../pomodoro/pomodoro-service';
import type { ReadingService } from '../reading/reading-service';
import { renderSidebarLunarWidget } from '../widgets/lunar-widget';
import { renderSidebarYearProgress } from '../widgets/year-progress-widget';
import { renderSidebarCalendar } from '../calendar/calendar-widget';
import { renderSidebarHabitWidget } from '../habit/habit-widget';
import { renderSidebarExpenseWidget } from '../expense/expense-widget';
import { renderSidebarAlbumWidget } from '../widgets/album-widget';
import { renderSidebarAnniversaryWidget } from '../widgets/anniversary-widget';
import { applyWidgetBackground, appendInlineBackgroundButton, getWidgetPlugin } from '../widgets/widget-background';
import { renderSidebarMusicWidget } from '../music/music-widget';
import { SUPPORTED_FILE_EXTS } from '../../shared/file-types';
import type { HolidayInfo } from '../calendar/holiday-service';
import {
	Chart,
	LineController,
	LineElement,
	PointElement,
	BarController,
	BarElement,
	LinearScale,
	CategoryScale,
	Filler,
	Tooltip,
} from 'chart.js';
import {
	WidgetEntry,
	renderSidebarPomodoro,
	renderSidebarWeather,
	setupWidgetDnD,
	sortByOrder,
} from './refresh-sidebar-weather-widget';
import { renderSidebarCountdown, renderSidebarReading } from './render-sidebar-countdown';

Chart.register(
	LineController,
	LineElement,
	PointElement,
	BarController,
	BarElement,
	LinearScale,
	CategoryScale,
	Filler,
	Tooltip,
);

export const chartInstances = new Map<string, Chart>();
export const countdownTimers = new Map<number, HTMLElement>();
export function destroyChart(cardId: string): void {
	const chart = chartInstances.get(cardId);
	if (chart) {
		chart.destroy();
		chartInstances.delete(cardId);
	}
}
export function destroyAllCharts(preserveWidgets?: HTMLElement | null): void {
	for (const [, chart] of chartInstances) {
		chart.destroy();
	}
	chartInstances.clear();
	for (const [id, content] of countdownTimers) {
		if (preserveWidgets && preserveWidgets.contains(content)) continue;
		window.clearInterval(id);
		countdownTimers.delete(id);
	}
}
export function getCSSVar(name: string): string {
	const el = activeDocument.querySelector('.apex-dashboard-root');
	if (!el) return '';
	return getComputedStyle(el).getPropertyValue(name).trim();
}
function isAccentLight(): boolean {
	const el = activeDocument.querySelector('.apex-dashboard-root');
	if (!el) return false;
	return isLightColor(getComputedStyle(el).getPropertyValue('--db-accent').trim());
}
function isLightColor(color: string): boolean {
	const value = color.trim();
	if (value.startsWith('rgb')) {
		const nums = value.match(/[\d.]+/g);
		if (!nums || nums.length < 3) return false;
		return relativeLuminance(Number(nums[0]), Number(nums[1]), Number(nums[2])) > 0.6;
	}
	const hex = value.replace(/^#/, '');
	if (!/^[0-9a-fA-F]+$/.test(hex)) return false;
	const full =
		hex.length === 3
			? hex
					.split('')
					.map((c) => c + c)
					.join('')
			: hex;
	if (full.length !== 6) return false;
	return (
		relativeLuminance(
			parseInt(full.slice(0, 2), 16),
			parseInt(full.slice(2, 4), 16),
			parseInt(full.slice(4, 6), 16),
		) > 0.6
	);
}
function relativeLuminance(r: number, g: number, b: number): number {
	const toLinear = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
export const taskDragSource = { current: null as { cardId: string; taskPath: number[] } | null };
export const docDragSource = { current: null as { cardId: string; docPath: number[] } | null };
export const activeHoverParent = { current: null as HoverParent | null };
export const activeNoteOpener = { current: null as ((file: TFile, subpath?: string) => void) | null };
export const activeMarkdownComponent = { current: null as Component | null };
const VAULT_FILE_EXTS = SUPPORTED_FILE_EXTS;
export function getSearchableFiles(app: App) {
	return app.vault.getFiles().filter((f) => !f.path.startsWith('.') && VAULT_FILE_EXTS.has(f.extension));
}
let basenameIndex: Map<string, TFile> | null = null;
let basenameIndexApp: App | null = null;
const basenameEventRefs: EventRef[] = [];
function indexFile(file: TFile): void {
	if (file.path.startsWith('.') || !VAULT_FILE_EXTS.has(file.extension)) return;
	const idx = basenameIndex;
	if (idx && !idx.has(file.basename)) idx.set(file.basename, file);
}
function unindexFile(file: TFile): void {
	const idx = basenameIndex;
	if (!idx) return;
	// Only clear if this file is the one indexed; a same-named other may own it.
	if (idx.get(file.basename) === file) {
		idx.delete(file.basename);
	}
}
function ensureBasenameIndex(app: App): Map<string, TFile> {
	if (basenameIndex && basenameIndexApp === app) return basenameIndex;
	const idx = new Map<string, TFile>();
	for (const f of app.vault.getFiles()) {
		if (!f.path.startsWith('.') && VAULT_FILE_EXTS.has(f.extension) && !idx.has(f.basename)) {
			idx.set(f.basename, f);
		}
	}
	basenameIndex = idx;
	basenameIndexApp = app;
	// Register invalidation hooks exactly once per app; store refs so the plugin
	// can detach them on unload (matches the sync.ts EventRef pattern).
	basenameEventRefs.push(app.vault.on('create', indexFile));
	basenameEventRefs.push(app.vault.on('delete', unindexFile));
	basenameEventRefs.push(
		app.vault.on('rename', (file, oldPath) => {
			// Rename keeps the TFile identity but Obsidian has already updated
			// file.basename/path to the NEW values by the time this fires. Drop the
			// old key (derived from oldPath) if this file owned it, then re-index.
			const oldBasename =
				oldPath
					.split('/')
					.pop()
					?.replace(/\.[^.]+$/, '') ?? '';
			if (basenameIndex?.get(oldBasename) === file) basenameIndex?.delete(oldBasename);
			if (file instanceof TFile) indexFile(file);
		}),
	);
	return idx;
}
export function teardownBasenameIndex(app: App): void {
	for (const ref of basenameEventRefs) app.vault.offref(ref);
	basenameEventRefs.length = 0;
	basenameIndex = null;
	basenameIndexApp = null;
}
export function resolveNoteFile(app: App, rawPath: string): TFile | null {
	const direct = app.vault.getFileByPath(rawPath);
	if (direct) return direct;
	const withMd = rawPath.includes('.') ? rawPath : `${rawPath}.md`;
	const tried = app.vault.getFileByPath(withMd);
	if (tried) return tried;
	const basename = rawPath.split('/').pop()?.replace(/\.md$/, '') ?? '';
	if (basename) {
		return ensureBasenameIndex(app).get(basename) ?? null;
	}
	return null;
}
export function renderSidebarWeekCalendar(container: HTMLElement): void {
	// Reuse the existing calendar node so cross-day refreshes don't grow the DOM.
	let row = container.querySelector<HTMLElement>('.dashboard-sidebar-week-calendar');
	if (row) {
		row.empty();
	} else {
		row = container.createDiv({ cls: 'dashboard-sidebar-week-calendar' });
	}

	const now = new Date();
	const today = now.getDay();
	const mondayOffset = today === 0 ? -6 : 1 - today;
	const monday = new Date(now);
	monday.setDate(now.getDate() + mondayOffset);

	const lang = getLanguage() === 'zh' ? 'zh-CN' : 'en';
	const accentLight = isAccentLight();

	for (let i = 0; i < 7; i++) {
		const d = new Date(monday);
		d.setDate(monday.getDate() + i);
		const isToday = d.toDateString() === now.toDateString();

		const cell = row.createDiv({
			cls:
				'dashboard-sidebar-week-cell' +
				(isToday ? ' dashboard-sidebar-week-cell--today' : '') +
				(isToday && accentLight ? ' dashboard-sidebar-week-cell--today-on-light' : ''),
		});
		cell.createDiv({
			cls: 'dashboard-sidebar-week-day',
			text: d.toLocaleDateString(lang, { weekday: 'narrow' }),
		});
		cell.createDiv({
			cls: 'dashboard-sidebar-week-date',
			text: String(d.getDate()),
		});
	}
}
export function isStackedLayout(settings: import('../types').DashboardSettings): boolean {
	return settings.layoutMode === 'stacked' && !Platform.isPhone;
}
export function sidebarWidgetSignature(
	settings: import('../types').DashboardSettings,
	hasPomodoro: boolean,
	hasReading: boolean,
	hasHolidayData: boolean,
	quickActionsSig: string,
): string {
	return JSON.stringify({
		// The stacked widget area has a different internal structure (quick
		// actions card pinned leftmost + column-major strip wrapper), so a
		// layout switch must rebuild rather than re-attach the previous mode's
		// DOM.
		stacked: isStackedLayout(settings),
		weatherEnabled: settings.widgetWeatherEnabled,
		weatherCity: settings.widgetWeatherCity,
		weatherLat: settings.widgetWeatherLat,
		weatherLon: settings.widgetWeatherLon,
		pomodoroEnabled: settings.pomodoroEnabled,
		pomodoroLongBreakInterval: settings.pomodoroLongBreakInterval,
		lunarEnabled: settings.widgetLunarEnabled,
		yearProgressEnabled: settings.widgetYearProgressEnabled,
		calendarEnabled: settings.widgetCalendarEnabled,
		calendarExcludeFolders: settings.calendarExcludeFolders,
		habitEnabled: settings.widgetHabitEnabled,
		// Tier settings must break the reuse signature: they change the stacked
		// grid spans, which are written as inline CSS variables at build time.
		// (sidebarWidth / widgetUnitHeight deliberately stay OUT — those apply
		// as plain CSS variables on the outer sidebar every render and must not
		// churn the widgets DOM.)
		habitHeightRatio: settings.habitHeightRatio,
		readingHeightRatio: settings.readingHeightRatio,
		expenseEnabled: settings.widgetExpenseEnabled,
		expenseCurrency: settings.expenseCurrency,
		albums: settings.albums ?? [],
		quickActionsBackground: settings.quickActionsBackground,
		pomodoroBackground: settings.pomodoroBackground,
		habitBackground: settings.habitBackground,
		musicBackground: settings.musicBackground,
		yearProgressBackground: settings.yearProgressBackground,
		anniversaryEnabled: settings.anniversaryEnabled,
		anniversaries: settings.anniversaries ?? [],
		// Playlist content itself must NOT enter the signature: every add would
		// rebuild the whole widget area. The service subscription refreshes it
		// in place instead; only the enable flag matters here. Phones have no
		// sidebar widget area; tablets share the desktop layout.
		musicEnabled: settings.widgetMusicEnabled && !Platform.isPhone,
		countdownEnabled: settings.countdownEnabled,
		countdowns: settings.countdowns,
		readingEnabled: settings.readingEnabled,
		quickActionsEnabled: settings.widgetQuickActionsEnabled,
		// Quick buttons live inside the widget area now; their content (actions,
		// order, hidden presets) must break the reuse signature so add/remove/edit
		// rebuilds the area instead of re-attaching a stale quick-actions DOM.
		quickActionsSig,
		widgetOrder: settings.widgetOrder,
		hasPomodoro,
		hasReading,
		hasHolidayData,
		lang: getLanguage(),
	});
}
function saveSingletonBackground(
	app: App,
	key:
		| 'quickActionsBackground'
		| 'pomodoroBackground'
		| 'habitBackground'
		| 'musicBackground'
		| 'yearProgressBackground',
	bg: import('../types').WidgetBackground | undefined,
): void {
	const plugin = getWidgetPlugin(app);
	if (!plugin) return;
	plugin.settings = { ...plugin.settings, [key]: bg };
	void plugin.saveSettings();
	plugin.refreshAllDashboards();
}
export function renderSidebarWidgets(
	container: HTMLElement,
	settings: import('../types').DashboardSettings,
	app: App,
	pomodoroService?: PomodoroService,
	readingService?: ReadingService,
	holidayData?: Record<string, HolidayInfo>,
	onWidgetReorder?: (order: string[]) => void,
	reuse?: HTMLElement | null,
	onOpenNote?: (file: TFile, line?: number) => void,
	renderQuickActions?: (container: HTMLElement) => void,
): HTMLElement | null {
	const anyEnabled =
		settings.widgetWeatherEnabled ||
		settings.pomodoroEnabled ||
		settings.widgetLunarEnabled ||
		settings.widgetYearProgressEnabled ||
		settings.widgetCalendarEnabled ||
		settings.widgetHabitEnabled ||
		settings.widgetExpenseEnabled ||
		(settings.albums?.length ?? 0) > 0 ||
		(settings.anniversaryEnabled && (settings.anniversaries?.length ?? 0) > 0) ||
		(settings.countdownEnabled && (settings.countdowns?.length ?? 0) > 0) ||
		settings.readingEnabled ||
		(settings.widgetQuickActionsEnabled && !!renderQuickActions) ||
		(settings.widgetMusicEnabled && !Platform.isPhone);
	if (!anyEnabled) return null;

	const stacked = isStackedLayout(settings);
	// Unchanged inputs: keep the previous DOM (and its live timers/listeners).
	// The layout marker check is local defense-in-depth on top of the caller's
	// signature gate: a side-built area (flat children) must never re-attach
	// into a stacked render (strip wrapper expected) or vice versa, even if a
	// future caller forgets to include the layout in its signature.
	if (
		reuse &&
		reuse.isConnected === false &&
		reuse.childElementCount > 0 &&
		reuse.dataset.layout === (stacked ? 'stacked' : 'side')
	) {
		container.appendChild(reuse);
		return reuse;
	}

	const widgetArea = container.createDiv({ cls: 'dashboard-sidebar-widgets' });
	widgetArea.dataset.layout = stacked ? 'stacked' : 'side';

	const DEFAULT_ORDER = [
		'quickActions',
		'lunar',
		'weather',
		'pomodoro',
		'reading',
		'countdown',
		'anniversary',
		'yearProgress',
		'calendar',
		'habit',
		'expense',
		'album',
		'music',
	];
	// Legacy: an order saved before quick buttons were a widget lacks the
	// 'quickActions' key. Render it first there (its historical spot, above the
	// other widgets) until the user drags it elsewhere.
	const order = settings.widgetOrder?.length ? settings.widgetOrder : DEFAULT_ORDER;

	type WidgetEntry = { key: string; render: (host: HTMLElement) => void };
	const enabled: WidgetEntry[] = [];
	if (settings.widgetQuickActionsEnabled && renderQuickActions) {
		const renderQuick = renderQuickActions;
		enabled.push({
			key: 'quickActions',
			render: (host) => {
				renderQuick(host);
			},
		});
	}
	if (settings.widgetLunarEnabled) {
		enabled.push({ key: 'lunar', render: (host) => renderSidebarLunarWidget(host, holidayData ?? {}, app) });
	}
	if (settings.widgetYearProgressEnabled) {
		enabled.push({
			key: 'yearProgress',
			render: (host) =>
				renderSidebarYearProgress(host, settings.yearProgressBackground, app, (bg) =>
					saveSingletonBackground(app, 'yearProgressBackground', bg),
				),
		});
	}
	if (settings.widgetCalendarEnabled) {
		enabled.push({ key: 'calendar', render: (host) => renderSidebarCalendar(host, settings, app, onOpenNote) });
	}
	if (settings.widgetWeatherEnabled) {
		enabled.push({ key: 'weather', render: (host) => renderSidebarWeather(host, settings, app) });
	}
	if (settings.pomodoroEnabled && pomodoroService) {
		enabled.push({
			key: 'pomodoro',
			render: (host) =>
				renderSidebarPomodoro(host, pomodoroService, settings, app, (bg) =>
					saveSingletonBackground(app, 'pomodoroBackground', bg),
				),
		});
	}
	if (settings.readingEnabled && readingService) {
		enabled.push({ key: 'reading', render: (host) => renderSidebarReading(host, readingService) });
	}
	if (settings.widgetHabitEnabled) {
		enabled.push({
			key: 'habit',
			render: (host) =>
				renderSidebarHabitWidget(host, app, settings.habitBackground, (bg) =>
					saveSingletonBackground(app, 'habitBackground', bg),
				),
		});
	}
	if (settings.widgetExpenseEnabled) {
		enabled.push({ key: 'expense', render: (host) => renderSidebarExpenseWidget(host, app) });
	}
	// Multiple album widgets: one card per albums[] entry, keyed album-<id>.
	// renderSidebarAlbumWidget reads the legacy flat fields, so each entry
	// renders through a per-album settings shim (spread — never mutated).
	for (const cfg of settings.albums ?? []) {
		const ref = cfg;
		enabled.push({
			key: `album-${ref.id}`,
			render: (host) =>
				renderSidebarAlbumWidget(
					host,
					{
						...settings,
						widgetAlbumFolder: ref.folder,
						widgetAlbumIntervalSec: ref.intervalSec,
						widgetAlbumRecursive: ref.recursive,
						widgetAlbumRatio: ref.ratio,
						widgetAlbumTransition: ref.transition,
					},
					app,
				),
		});
	}
	// Anniversary widgets: one card per anniversaries[] entry, keyed
	// anniversary-<id> (the countdown multi-instance pattern).
	if (settings.anniversaryEnabled) {
		for (const cfg of settings.anniversaries ?? []) {
			const ref = cfg;
			enabled.push({
				key: `anniversary-${ref.id}`,
				render: (host) =>
					renderSidebarAnniversaryWidget(host, ref, app, (updated) => {
						const plugin = getWidgetPlugin(app);
						if (!plugin) return;
						plugin.settings = {
							...plugin.settings,
							anniversaries: (plugin.settings.anniversaries ?? []).map((a) =>
								a.id === updated.id ? updated : a,
							),
						};
						void plugin.saveSettings();
						plugin.refreshAllDashboards();
					}),
			});
		}
	}
	if (settings.widgetMusicEnabled && !Platform.isPhone) {
		enabled.push({
			key: 'music',
			render: (host) =>
				renderSidebarMusicWidget(host, settings.musicBackground, app, (bg) =>
					saveSingletonBackground(app, 'musicBackground', bg),
				),
		});
	}
	if (settings.countdownEnabled) {
		for (const cd of settings.countdowns ?? []) {
			const cdRef = cd;
			enabled.push({ key: `countdown-${cd.id}`, render: (host) => renderSidebarCountdown(host, cdRef, app) });
		}
	}

	const ordered = sortByOrder(enabled, order);

	// Stacked mode: quick actions is a regular card in the strip grid, always
	// FIRST in the build order = leftmost column (it also exits the reorder
	// system there, so the pinned position is deterministic). The saved drag
	// order is untouched and still rules the side layout. The strip wrapper is
	// created lazily on the first widget, so an empty enable set never gets a
	// stray container.
	const buildOrder = stacked
		? [...ordered.filter((e) => e.key === 'quickActions'), ...ordered.filter((e) => e.key !== 'quickActions')]
		: ordered;
	let stripRow: HTMLElement | null = null;
	const hostFor = (_key: string): HTMLElement => {
		if (!stacked) return widgetArea;
		stripRow ??= widgetArea.createDiv({ cls: 'dashboard-sidebar-widgets-row' });
		return stripRow;
	};

	// Stacked-mode height ratios: rows of the 6-row widget grid per fraction.
	const albumById = new Map((settings.albums ?? []).map((a) => [String(a.id), a]));
	// Adaptive column packing ("首选档 + 放不下自动换挡"): simulate the sparse
	// column-first grid over the DOM order and resolve each TIERED card's
	// span (habit / reading / album-*). Fixed cards keep their hardcoded
	// per-type CSS spans; tiered cards get the resolved span inline as
	// --db-widget-span, which their CSS rule reads with a historical fallback.
	const spans = stacked
		? resolveStackedSpans(
				buildStackedSpanSpecs(
					buildOrder.map((e) => e.key),
					{
						// Explicit mapping: the settings field names (habitHeightRatio)
						// differ from the StackedRatios shape, and a whole-settings pass
						// would type-check (all-optional interface) while silently reading
						// undefined -> default tiers.
						habit: settings.habitHeightRatio,
						reading: settings.readingHeightRatio,
						albums: settings.albums,
					},
				),
			)
		: null;

	for (let i = 0; i < buildOrder.length; i++) {
		const { key, render } = buildOrder[i]!;
		const host = hostFor(key);
		const childCount = host.children.length;
		render(host);
		const el = host.children[childCount] as HTMLElement | undefined;
		if (el) {
			el.dataset.widgetKey = key;
			// The quick-actions section carries its own section classes; give it
			// the widget class too so it joins the drag-to-reorder system.
			if (key === 'quickActions') {
				el.addClass('dashboard-sidebar-widget');
				// Card background + config gear INSIDE the header's button group
				// (left of palette/add) — a corner button would overlap them.
				applyWidgetBackground(el, settings.quickActionsBackground, app, { skipFrame: true });
				const btnGroup = el.querySelector<HTMLElement>('.dashboard-qa-btn-group');
				if (btnGroup) {
					const gear = appendInlineBackgroundButton(btnGroup, app, settings.quickActionsBackground, (bg) =>
						saveSingletonBackground(app, 'quickActionsBackground', bg),
					);
					btnGroup.insertBefore(gear, btnGroup.firstChild);
				}
			}
			// Album cards carry their config id (the multi-instance refresh
			// matches on it).
			if (key.startsWith('album-')) {
				const cfg = albumById.get(key.slice('album-'.length));
				if (cfg) el.dataset.albumId = String(cfg.id);
			}
			if (spans && isTieredWidgetKey(key)) {
				el.setCssProps({ '--db-widget-span': String(spans[i] ?? RATIO_SPAN.full) });
			}
		}
	}

	if (onWidgetReorder) {
		setupWidgetDnD(
			widgetArea,
			ordered.map((e) => e.key),
			onWidgetReorder,
			stacked,
		);
	}
	return widgetArea;
}
