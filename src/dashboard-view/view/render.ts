import type { DashboardView } from './dashboard-view';
import type { DashboardData } from '../types';
import { renderDashboard, sidebarWidgetSignature, isStackedLayout } from '../renderer';
import { renderBanner } from '../banner/banner';
import { renderWorkspaceSwitcher } from '../workspace/workspace-switcher';
import { applyAppearance } from '../appearance/appearance';
import { renderQuickNoteRegion } from '../notes/quick-note-section';
import { setupDragAndDrop } from '../ui/dnd';
import { captureRootScrollState, restoreRootScrollState } from '../ui/scroll-preserve';

export function render(this: DashboardView, data: DashboardData): void {
	// Snapshot EVERY scrolled container (stacked region, board, sidebar
	// rail, widget deck, card decks, task lists, widget internals — and the
	// root itself, which scrolls on mobile) before any teardown. Keyed by
	// card/widget/column anchors, so the replay at the end survives
	// reorders. The previous targeted saves missed the stacked widget deck:
	// detaching/re-attaching the widgets container resets scroll state, so
	// every re-render jumped the deck back to its first column. This must
	// run BEFORE the widgets detach below, while the deck is still in the
	// tree.
	const prevRoot = this.containerEl.children[1] as HTMLElement | undefined;
	const savedRootScroll = captureRootScrollState(prevRoot ?? createDiv());
	// Detach the sidebar widgets before tearing the rest down. If their
	// inputs (signature below) are unchanged, this exact node is re-attached
	// in renderSidebar instead of being rebuilt - dashboard data mutations
	// then cost nothing for the widgets (calendar keeps its month navigation,
	// countdowns keep ticking, no vault re-scan).
	const oldWidgets = prevRoot?.querySelector('.dashboard-sidebar-widgets');
	if (oldWidgets instanceof HTMLElement) {
		oldWidgets.remove();
		this.sidebarWidgetsEl = oldWidgets;
	}
	const widgetSig = sidebarWidgetSignature(
		this.plugin.settings,
		!!this.pomodoroService,
		!!this.readingService,
		!!this.holidayData && Object.keys(this.holidayData).length > 0,
		JSON.stringify([data.quickActions, data.quickActionOrder, data.hiddenPresets]),
	);
	const preserveWidgets = !!this.sidebarWidgetsEl && this.sidebarWidgetsSig === widgetSig;

	this.runCleanup(preserveWidgets);
	this.data = data;
	this.firedReminders.clear();
	this.sidebarWidgetsSig = widgetSig;

	const container = this.containerEl.children[1] as HTMLElement;

	// Sweep any touch-drag ghost clones stranded on activeDocument.body from a prior
	// interrupted drag (touchcancel). They live outside the container, so
	// container.empty() cannot reach them.
	activeDocument.body.querySelectorAll(':scope > .dashboard-card--ghost').forEach((el) => el.remove());

	container.empty();
	container.addClass('apex-dashboard-root');
	container.setAttribute('data-theme', this.plugin.settings.stylePreset);
	// Layout mode rides on an attribute so CSS owns the switch. Phones
	// always report 'side' (isStackedLayout excludes them) so their DOM and
	// CSS stay byte-identical regardless of this desktop-only setting.
	container.setAttribute('data-layout', isStackedLayout(this.plugin.settings) ? 'stacked' : 'side');

	// Apply user appearance overrides (background image layer + custom colors).
	// Must run after data-theme so inline `--db-*` overrides win by specificity,
	// and before banner/main are created so the bg layer sits behind content.
	applyAppearance(container, this.app, this.plugin.settings);

	const bannerEl = renderBanner(container, data.banner, () => this.openBannerEditModal(data), this.app);
	// Capture the stats panel (only present in stats mode) so vault changes
	// can refresh it in place without a full re-render.
	this.bannerStatsEl = bannerEl.querySelector('.dashboard-banner-stats');

	this.renderMobileActions(bannerEl);
	// Workspace switcher — banner, at the top-left corner of the stats
	// view's CENTER column (the CSS mirrors the stats grid: 20px panel
	// padding + 1/5 of the content width = the center column's left edge).
	// Rebuilt every render so the active highlight always matches settings.
	renderWorkspaceSwitcher(bannerEl, this.plugin);

	// Sidebar pin — desktop-only, bottom-left corner of the banner. Moved
	// here out of the quick-actions header because quick buttons became a
	// hideable sidebar widget (the pin must survive hiding them).
	this.renderBannerPinButton(bannerEl);

	if (this.bannerCollapsed && window.innerWidth > 640) {
		bannerEl.addClass('dashboard-banner--collapsed');
	}
	this.setupBannerBehavior(bannerEl);

	// Banner quote rotation
	this.setupBannerRotation(container, data.banner);

	this.renderMobileWidgetBar(container);

	const mainLayout = container.createDiv({ cls: 'dashboard-main' });

	// Stacked layout: the quick-notes work bar (capture pill, today note,
	// chips) moves OUT of the kanban to sit directly under the banner,
	// above the widget strip — the kanban sits below the strip there, so
	// its usual top slot would land the bar beneath the widgets. The side
	// layout keeps rendering it inside the kanban as before.
	//
	// Scroll model: the bar stays PINNED, while the widget deck and the
	// board scroll TOGETHER inside one region below it (the user wheels
	// through widgets and sections as one page). The side layout keeps the
	// old split (rail scrolls alone, board scrolls alone).
	const stacked = isStackedLayout(this.plugin.settings);
	if (stacked && this.plugin.settings.quickNotesEnabled) {
		renderQuickNoteRegion(mainLayout, this.plugin.settings, this.createCallbacks());
	}
	const contentHost = stacked ? mainLayout.createDiv({ cls: 'dashboard-scroll-region' }) : mainLayout;

	// Rail state classes apply in BOTH layouts: in stacked mode they carry
	// strip semantics instead (collapse to a slim bar, expand on click,
	// pin keeps it open) via the [data-layout="stacked"] CSS overrides.
	const sidebar = contentHost.createDiv({ cls: 'dashboard-sidebar' });
	if (this.sidebarPinned) {
		sidebar.addClass('dashboard-sidebar--pinned');
	} else if (this.sidebarExpanded) {
		sidebar.addClass('dashboard-sidebar--expanded');
	} else {
		sidebar.addClass('dashboard-sidebar--collapsed');
	}
	this.applySidebarSizing(sidebar);
	this.renderSidebar(sidebar, container, preserveWidgets ? this.sidebarWidgetsEl : null);
	this.setupSidebarBehavior(sidebar, container);

	// Two-layer board: a NON-scrolling wrapper around the scrolling
	// .dashboard-kanban. (The switcher itself lives on the banner; the split
	// stays because it gives the scroll layer a clean, non-scrolling host.)
	const kanbanWrapper = contentHost.createDiv({ cls: 'dashboard-kanban-wrapper' });
	const kanban = kanbanWrapper.createDiv({ cls: 'dashboard-kanban' });
	renderDashboard(kanban, data, this.createCallbacks(), this.app, this.plugin.settings, this, {
		skipQuickNotes: stacked,
	});
	setupDragAndDrop(kanban, this.createCallbacks(), this.dndCleanupFns);
	// Library config event delegation
	kanban.addEventListener('dashboard-library-config', ((e: CustomEvent) => {
		const { columnName } = e.detail as { columnName: string };
		const col = this.data?.columns.find((c) => c.name === columnName);
		if (col?.sectionType === 'folder') {
			this.openFolderConfigModal(columnName);
		} else if (col?.sectionType === 'weread') {
			this.openWereadConfigModal(columnName);
		} else if (col?.sectionType === 'dataview') {
			this.openDataviewConfigModal(columnName);
		} else if (col?.sectionType === 'web') {
			this.openWebConfigModal(columnName);
		} else if (col?.sectionType === 'images' || col?.sectionType === 'videos') {
			this.openMediaConfigModal(columnName);
		} else if (col?.sectionType === 'notes' || col?.sectionType === 'projects') {
			this.openNotesSectionConfigModal(columnName);
		} else {
			this.openLibraryConfigModal(columnName);
		}
	}) as EventListener);

	// Library/folder "new note" button — dispatched from the section toolbar.
	kanban.addEventListener('dashboard-library-new-note', ((e: CustomEvent) => {
		const { columnName, x, y } = e.detail as { columnName: string; x?: number; y?: number };
		const pos = typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined;
		void this.handleLibraryNewNote(columnName, pos);
	}) as EventListener);

	// Replay the pre-render scroll snapshot onto the rebuilt tree. Keys that
	// no longer resolve (a genuinely new structure) are skipped inside the
	// restore; the pendingScroll blocks below may then re-scroll on purpose.
	restoreRootScrollState(container, savedRootScroll);

	// Scroll to newly added card
	if (this.pendingScrollCardId) {
		const cardEl = container.querySelector(`[data-card-id="${this.pendingScrollCardId}"]`);
		if (cardEl) {
			window.requestAnimationFrame(() => {
				cardEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
			});
		}
		this.pendingScrollCardId = null;
	}
	if (this.pendingScrollToLastCardOfColumn) {
		const colName = this.pendingScrollToLastCardOfColumn;
		const sectionRow = container.querySelector(`[data-column="${colName}"]`);
		if (sectionRow) {
			const cards = sectionRow.querySelectorAll('.dashboard-card');
			const lastCard = cards[cards.length - 1];
			if (lastCard) {
				window.requestAnimationFrame(() => {
					lastCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
				});
			}
		}
		this.pendingScrollToLastCardOfColumn = null;
	}

	this.renderScrollToTop(container);
}
