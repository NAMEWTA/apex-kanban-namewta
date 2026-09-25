import type { DashboardView } from './dashboard-view';
import { setIcon } from 'obsidian';
import { renderSidebarPomodoro, renderSidebarReading } from '../renderer';
import { renderSidebarCalendar } from '../calendar/calendar-widget';
import { renderSidebarHabitWidget } from '../habit/habit-widget';
import { renderSidebarExpenseWidget } from '../expense/expense-widget';
import { getRecentDocs, renderRecentDocs } from '../ui/recent';
import { renderQuickActions } from '../notes/quick-actions';
import { showConfirmDialog } from '../ui/confirm-dialog';
import { renderSidebarLunarWidget } from '../widgets/lunar-widget';
import { t } from '../../shared/i18n';

export function renderMobileActions(this: DashboardView, bannerEl: HTMLElement): void {
	const actions = bannerEl.createDiv({ cls: 'dashboard-mobile-actions' });

	const linksBtn = actions.createEl('button', {
		cls: 'dashboard-mobile-action-btn',
		attr: { 'aria-label': t('mobile.quickActions') },
	});
	setIcon(linksBtn, 'zap');
	linksBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		this.openMobileDrawer('quickActions');
	});

	const recentBtn = actions.createEl('button', {
		cls: 'dashboard-mobile-action-btn',
		attr: { 'aria-label': t('mobile.recent') },
	});
	setIcon(recentBtn, 'clock');
	recentBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		this.openMobileDrawer('recent');
	});

	// On mobile, tapping right half of banner reveals the edit button
	const overlay = bannerEl.querySelector('.dashboard-banner-overlay') as HTMLElement;
	if (overlay) {
		overlay.addEventListener('click', (e) => {
			const rect = overlay.getBoundingClientRect();
			const tapX = e.clientX - rect.left;
			if (tapX > rect.width * 0.5) {
				const editBtn = overlay.querySelector('.dashboard-banner-edit-btn') as HTMLElement;
				if (editBtn) {
					editBtn.addClass('dashboard-banner-edit-btn--mobile-visible');
				}
			}
		});
	}
}

export function renderMobileWidgetBar(this: DashboardView, container: HTMLElement): void {
	this.mobileWidgetTabsOpen = false;
	this.mobileWidgetExpanded = null;

	const bar = container.createDiv({ cls: 'dashboard-mobile-widget-bar' });

	// Thin strip: collapsed state, tap to expand tabs
	const strip = bar.createDiv({ cls: 'dashboard-mobile-widget-strip' });
	strip.createDiv({ cls: 'dashboard-mobile-widget-strip-hint' });
	strip.addEventListener('click', (e) => {
		e.stopPropagation();
		this.mobileWidgetTabsOpen = !this.mobileWidgetTabsOpen;
		if (!this.mobileWidgetTabsOpen) {
			this.mobileWidgetExpanded = null;
		}
		this.refreshMobileWidgetPanel(bar);
	});

	// Tab row: hidden by default, revealed by tapping strip
	const tabs = bar.createDiv({ cls: 'dashboard-mobile-widget-tabs' });

	const widgets: Array<{
		key: 'pomodoro' | 'reading' | 'lunar' | 'calendar' | 'habit' | 'expense';
		label: string;
		icon: string;
	}> = [
		{ key: 'lunar', label: t('mobile.lunar'), icon: 'moon' },
		...(this.plugin.settings.widgetCalendarEnabled
			? [{ key: 'calendar' as const, label: t('mobile.calendar'), icon: 'calendar' }]
			: []),
		{ key: 'pomodoro', label: t('mobile.pomodoro'), icon: 'hourglass' },
		...(this.plugin.settings.widgetHabitEnabled
			? [{ key: 'habit' as const, label: t('mobile.habit'), icon: 'check-circle-2' }]
			: []),
		...(this.plugin.settings.widgetExpenseEnabled
			? [{ key: 'expense' as const, label: t('mobile.expense'), icon: 'wallet' }]
			: []),
		{ key: 'reading', label: t('mobile.reading'), icon: 'book-open' },
	];

	bar.createDiv({ cls: 'dashboard-mobile-widget-panel' });

	for (const w of widgets) {
		const btn = tabs.createEl('button', {
			cls: 'dashboard-mobile-widget-btn',
			attr: { 'aria-label': w.label },
		});
		setIcon(btn, w.icon);

		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (this.mobileWidgetExpanded === w.key) {
				this.mobileWidgetExpanded = null;
			} else {
				this.mobileWidgetExpanded = w.key;
			}
			this.refreshMobileWidgetPanel(bar);
		});

		btn.dataset.widgetKey = w.key;
	}

	this.refreshMobileWidgetPanel(bar);
}

export function refreshMobileWidgetPanel(this: DashboardView, bar: HTMLElement): void {
	const strip = bar.querySelector('.dashboard-mobile-widget-strip');
	const tabs = bar.querySelector('.dashboard-mobile-widget-tabs');
	const panel = bar.querySelector<HTMLElement>('.dashboard-mobile-widget-panel');
	if (!strip || !tabs || !panel) return;

	// Toggle strip active state
	strip.classList.toggle('dashboard-mobile-widget-strip--active', this.mobileWidgetTabsOpen);

	// Toggle tabs visibility
	tabs.classList.toggle('dashboard-mobile-widget-tabs--open', this.mobileWidgetTabsOpen);

	// Update button active states
	tabs.querySelectorAll('.dashboard-mobile-widget-btn').forEach((btn) => {
		const el = btn as HTMLElement;
		el.classList.toggle('active', el.dataset.widgetKey === this.mobileWidgetExpanded);
	});

	// Render panel content
	panel.empty();

	if (!this.mobileWidgetExpanded) {
		panel.removeClass('dashboard-mobile-widget-panel--open');
		return;
	}

	panel.addClass('dashboard-mobile-widget-panel--open');

	if (this.mobileWidgetExpanded === 'pomodoro' && this.pomodoroService) {
		renderSidebarPomodoro(panel, this.pomodoroService, this.plugin.settings, this.app);
	} else if (this.mobileWidgetExpanded === 'reading' && this.readingService) {
		renderSidebarReading(panel, this.readingService);
	} else if (this.mobileWidgetExpanded === 'lunar') {
		renderSidebarLunarWidget(panel, this.holidayData, this.app);
	} else if (this.mobileWidgetExpanded === 'calendar') {
		// The tab tap is explicit intent: autoLoad skips the phone deferred-scan
		// placeholder so the grid (and its dots) appear without a second tap.
		renderSidebarCalendar(
			panel,
			this.plugin.settings,
			this.app,
			(file, line) => this.openNote(file, undefined, line),
			{ autoLoad: true },
		);
	} else if (this.mobileWidgetExpanded === 'habit') {
		renderSidebarHabitWidget(panel, this.app);
	} else if (this.mobileWidgetExpanded === 'expense') {
		renderSidebarExpenseWidget(panel, this.app);
	}
}

export function openMobileDrawer(this: DashboardView, type: 'quickActions' | 'recent'): void {
	this.closeMobileDrawer();

	const root = this.containerEl.children[1] as HTMLElement;
	if (!root) return;

	const firstSection = root.querySelector('.dashboard-section-row') as HTMLElement;
	const drawerTop = firstSection ? firstSection.getBoundingClientRect().top : 0;

	const drawer = root.createDiv({ cls: 'dashboard-mobile-drawer' });
	drawer.style.top = `${drawerTop}px`;

	const content = drawer.createDiv({ cls: 'dashboard-mobile-drawer-content' });

	if (type === 'quickActions') {
		content.createEl('h4', { text: t('mobile.quickActions'), cls: 'dashboard-mobile-drawer-title' });
		if (this.data) {
			renderQuickActions(
				content,
				this.data.quickActions,
				(action) => {
					void this.executeAction(action);
					this.closeMobileDrawer();
				},
				(index) => {
					void (async () => {
						const confirmed = await showConfirmDialog(this.app, {
							title: t('common.confirmDelete'),
							message: t('common.confirmDeleteMessage'),
						});
						if (!confirmed) return;
						void this.sync.removeQuickAction(index);
					})();
				},
				() => this.openAddActionModal(),
				this.data.quickActionOrder,
				(order) => {
					void this.sync.reorderQuickActions(order);
				},
				(key) => {
					void (async () => {
						const confirmed = await showConfirmDialog(this.app, {
							title: t('common.confirmDelete'),
							message: t('common.confirmDeleteMessage'),
						});
						if (!confirmed) return;
						void this.sync.removeQuickActionByKey(key);
					})();
				},
				this.data.hiddenPresets,
				undefined,
			);
		}
	} else {
		content.createEl('h4', { text: t('mobile.recent'), cls: 'dashboard-mobile-drawer-title' });
		const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
		renderRecentDocs(content, docs, (path) => {
			void this.navigateToPath(path);
		});
	}

	const backdrop = drawer.createDiv({ cls: 'dashboard-mobile-drawer-backdrop' });
	backdrop.addEventListener('click', () => this.closeMobileDrawer());

	window.requestAnimationFrame(() => {
		content.addClass('dashboard-mobile-drawer-content--open');
	});
}

export function closeMobileDrawer(this: DashboardView): void {
	const root = this.containerEl.children[1] as HTMLElement;
	if (!root) return;
	const existing = root.querySelector('.dashboard-mobile-drawer');
	if (existing) existing.remove();
}
