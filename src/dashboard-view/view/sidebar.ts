import { DASHBOARD_VIEW_TYPE } from './dashboard-view';
import type { DashboardView } from './dashboard-view';
import { Platform } from 'obsidian';
import { renderSidebarWidgets, isStackedLayout, renderSidebarWeekCalendar } from '../renderer';
import { getRecentDocs, renderRecentDocs } from '../ui/recent';
import { renderQuickActions } from '../notes/quick-actions';
import { startGuardedDrag } from '../ui/drag-guard';
import { clampSidebarWidth, clampWidgetUnitHeight } from '../widgets/widget-span';
import { showConfirmDialog } from '../ui/confirm-dialog';
import { t } from '../../shared/i18n';

export function renderSidebar(
	this: DashboardView,
	sidebar: HTMLElement,
	root: HTMLElement,
	reuseWidgets: HTMLElement | null,
): void {
	if (!this.data) return;

	const scroll = sidebar.createDiv({ cls: 'dashboard-sidebar-scroll' });

	// Week calendar and recent docs are CSS-hidden in stacked mode, so skip
	// building them there: the recent-docs list costs a full markdown-file
	// mtime sort per render, and the debounced refresh already no-ops when
	// the .dashboard-recent block is absent.
	if (!isStackedLayout(this.plugin.settings)) {
		renderSidebarWeekCalendar(scroll);
	}

	// Quick buttons participate in the widget drag/reorder system now; the
	// renderer adds them to the widget area like any other sidebar widget.
	const renderQuickActionsWidget = (container: HTMLElement): void => {
		if (!this.data) return;
		renderQuickActions(
			container,
			this.data.quickActions,
			(action) => {
				void this.executeAction(action);
			},
			(index) => {
				void showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				}).then((confirmed) => {
					if (confirmed) void this.sync.removeQuickAction(index);
				});
			},
			() => this.openAddActionModal(),
			this.data.quickActionOrder,
			(order) => {
				void this.sync.reorderQuickActions(order);
			},
			(key) => {
				void showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				}).then((confirmed) => {
					if (confirmed) void this.sync.removeQuickActionByKey(key);
				});
			},
			this.data.hiddenPresets,
			(action) => this.openEditActionModal(action),
			{
				bg: this.plugin.settings.quickButtonsBgColor,
				btn: this.plugin.settings.quickButtonsBtnColor,
				onChange: (kind, color) => {
					void (async () => {
						this.plugin.settings = {
							...this.plugin.settings,
							...(kind === 'bg'
								? { quickButtonsBgColor: color ?? undefined }
								: { quickButtonsBtnColor: color ?? undefined }),
						};
						await this.plugin.saveSettings();
					})();
				},
			},
		);
	};

	// Preserve: reuse the detached widgets DOM when the signature matched.
	// Either way, track the live element for the next render's detach step.
	this.sidebarWidgetsEl = renderSidebarWidgets(
		scroll,
		this.plugin.settings,
		this.app,
		this.pomodoroService ?? undefined,
		this.readingService ?? undefined,
		this.holidayData,
		(order) => {
			void (async () => {
				this.plugin.settings = {
					...this.plugin.settings,
					widgetOrder: order,
				};
				await this.plugin.saveSettings();
				this.render(this.data!);
			})();
		},
		reuseWidgets,
		(file, line) => this.openNote(file, undefined, line),
		renderQuickActionsWidget,
	);

	if (!isStackedLayout(this.plugin.settings)) {
		const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
		renderRecentDocs(scroll, docs, (path) => {
			void this.navigateToPath(path);
		});
	}
}

export function setupSidebarBehavior(this: DashboardView, sidebar: HTMLElement, root: HTMLElement): void {
	// Create slim indicator (visible only when collapsed)
	sidebar.createDiv({ cls: 'dashboard-sidebar-slim-indicator' });

	// Use capture phase so child handlers can't stopPropagation before we see it
	sidebar.addEventListener(
		'mousedown',
		(e: MouseEvent) => {
			if (this.sidebarPinned) return;
			if (sidebar.hasClass('dashboard-sidebar--collapsed')) {
				e.preventDefault();
				e.stopPropagation();
				sidebar.removeClass('dashboard-sidebar--collapsed');
				sidebar.addClass('dashboard-sidebar--expanded');
				this.sidebarExpanded = true;
			}
		},
		true,
	);

	// Click outside to collapse
	const outsideHandler = (e: MouseEvent) => {
		if (this.sidebarPinned) return;
		if (!this.sidebarExpanded) return;
		if (sidebar.contains(e.target as Node)) return;
		sidebar.removeClass('dashboard-sidebar--expanded');
		sidebar.addClass('dashboard-sidebar--collapsed');
		this.sidebarExpanded = false;
	};
	root.addEventListener('click', outsideHandler);
	this.cleanupFns.push(() => root.removeEventListener('click', outsideHandler));

	// Resize handles (desktop only): the stacked strip drags its unit
	// height, the side rail drags its width. Phones have neither surface
	// (the rail is display:none under 641px, the strip does not exist).
	// The handles are direct sidebar children, so the collapsed state's
	// `> *:not(.slim-indicator)` hiding rule keeps them unreachable there.
	if (Platform.isMobile) return;
	if (isStackedLayout(this.plugin.settings)) {
		this.attachStripHeightHandle(sidebar);
	} else {
		this.attachSidebarWidthHandle(sidebar);
	}
}

/** Write the persisted area sizing as CSS variables on the sidebar element.
 *  Runs every render and deliberately stays OUT of the widget signature:
 *  both values apply as plain custom properties (--db-sidebar-w /
 *  --db-widget-unit-h), so committing a drag never rebuilds the widgets
 *  DOM (live timers and listeners survive). Writing on the OUTER sidebar
 *  also covers the widgets-reuse path, where the inner strip is a
 *  re-attached node from a previous render. */
export function applySidebarSizing(this: DashboardView, sidebar: HTMLElement): void {
	const s = this.plugin.settings;
	if (isStackedLayout(s)) {
		sidebar.setCssProps({ '--db-widget-unit-h': `${clampWidgetUnitHeight(s.widgetUnitHeight)}px` });
	} else if (!Platform.isMobile) {
		// Unitless: the stylesheet multiplies by 1px for the width and by
		// 1/220 for the proportional content scale (see the CSS comment).
		sidebar.setCssProps({ '--db-sidebar-w': String(clampSidebarWidth(s.sidebarWidth)) });
	}
}

/** Stacked layout: drag the strip's bottom edge to scale the 6-row grid
 *  unit (--db-widget-unit-h). Every card keeps its row fraction, so the
 *  whole strip grows/shrinks proportionally. Live frames write the CSS
 *  variable only; the value is persisted on release — the zero-writes-
 *  mid-drag discipline of the section height handle. */
export function attachStripHeightHandle(this: DashboardView, sidebar: HTMLElement): void {
	const handle = sidebar.createDiv({ cls: 'dashboard-sidebar-strip-handle' });
	handle.setAttribute('aria-label', t('view.stripResizeHint'));
	handle.addEventListener('pointerdown', (e) => {
		const startY = e.clientY;
		// Settings anchor, not offsetHeight: the collapsed strip's rendered
		// height carries no usable unit value.
		const startH = clampWidgetUnitHeight(this.plugin.settings.widgetUnitHeight);
		sidebar.addClass('dashboard-sidebar--resizing');
		const shieldHost = sidebar.closest('.apex-dashboard-root') ?? sidebar.parentElement;
		shieldHost?.addClass('dashboard-frames-muted');
		let last = startH;
		startGuardedDrag(e, {
			cursor: 'ns-resize',
			onMove: (ev) => {
				// A re-render can tear the sidebar down mid-drag; resizing a
				// detached element is stale work.
				if (!sidebar.isConnected) {
					sidebar.removeClass('dashboard-sidebar--resizing');
					shieldHost?.removeClass('dashboard-frames-muted');
					return;
				}
				last = clampWidgetUnitHeight(startH + (ev.clientY - startY));
				sidebar.style.setProperty('--db-widget-unit-h', `${last}px`);
			},
			onUp: () => {
				sidebar.removeClass('dashboard-sidebar--resizing');
				shieldHost?.removeClass('dashboard-frames-muted');
				const finalH = Math.round(last);
				if (finalH === startH) return;
				this.commitSidebarSizing({ widgetUnitHeight: finalH }, '--db-widget-unit-h', `${finalH}px`);
			},
		});
	});
}

/** Side layout: drag the rail's right edge to resize the widget column
 *  (--db-sidebar-w, unitless). Card content adapts through pure CSS: the
 *  widgets area scales its em-based root font-size with the width ratio
 *  and the fluid internals (flex/percent/ellipsis) reflow — no re-render,
 *  no JS layout work. */
export function attachSidebarWidthHandle(this: DashboardView, sidebar: HTMLElement): void {
	const handle = sidebar.createDiv({ cls: 'dashboard-sidebar-width-handle' });
	handle.setAttribute('aria-label', t('view.sidebarResizeHint'));
	handle.addEventListener('pointerdown', (e) => {
		const startX = e.clientX;
		const startW = clampSidebarWidth(this.plugin.settings.sidebarWidth);
		sidebar.addClass('dashboard-sidebar--resizing');
		const shieldHost = sidebar.closest('.apex-dashboard-root') ?? sidebar.parentElement;
		shieldHost?.addClass('dashboard-frames-muted');
		let last = startW;
		startGuardedDrag(e, {
			cursor: 'col-resize',
			onMove: (ev) => {
				if (!sidebar.isConnected) {
					sidebar.removeClass('dashboard-sidebar--resizing');
					shieldHost?.removeClass('dashboard-frames-muted');
					return;
				}
				last = clampSidebarWidth(startW + (ev.clientX - startX));
				sidebar.style.setProperty('--db-sidebar-w', String(last));
			},
			onUp: () => {
				sidebar.removeClass('dashboard-sidebar--resizing');
				shieldHost?.removeClass('dashboard-frames-muted');
				const finalW = Math.round(last);
				if (finalW === startW) return;
				this.commitSidebarSizing({ sidebarWidth: finalW }, '--db-sidebar-w', String(finalW));
			},
		});
	});
}

/** Persist a committed resize and mirror the value onto every OTHER open
 *  dashboard view's sidebar — a cheap setProperty sweep, because a full
 *  refreshAllDashboards would rebuild boards for a pure CSS change. Other
 *  views also pick the value up on their next render from settings. */
export function commitSidebarSizing(
	this: DashboardView,
	patch: { sidebarWidth?: number; widgetUnitHeight?: number },
	cssVar: string,
	value: string,
): void {
	this.plugin.settings = { ...this.plugin.settings, ...patch };
	void this.plugin.saveSettings();
	for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
		const other = leaf.view as DashboardView | undefined;
		if (!other || other === this) continue;
		other.containerEl
			.querySelectorAll<HTMLElement>('.dashboard-sidebar')
			.forEach((el) => el.style.setProperty(cssVar, value));
	}
}
