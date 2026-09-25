import { DashboardView } from './dashboard-view';
import { Notice } from 'obsidian';
import { refreshSidebarWeatherWidget, refreshWeatherCards } from '../renderer';
import { parseAnniversaryDate, anniversaryDateThisYear } from '../widgets/anniversary-widget';
import { clearWeatherCache } from '../widgets/weather-service';
import { ReminderNoticeModal } from '../ui/reminder-notice';
import { t } from '../../shared/i18n';

export function startReminderChecker(this: DashboardView): void {
	this.checkReminders();
	this.reminderTimer = window.setInterval(() => this.checkReminders(), DashboardView.REMINDER_CHECK_MS);
}

export function stopReminderChecker(this: DashboardView): void {
	if (this.reminderTimer) {
		window.clearInterval(this.reminderTimer);
		this.reminderTimer = null;
	}
}

export function startWeatherRefresh(this: DashboardView): void {
	this.weatherRefreshTimer = window.setInterval(() => {
		if (!this.data) return;
		const hasWeather = this.data.columns.some((col) => col.cards.some((c) => c.type === 'weather'));
		// The sidebar weather widget DOM is preserved across re-renders, so it
		// no longer refreshes as a side effect of re-renders - pull it into the
		// same periodic refresh. The widget renders through the weather cache,
		// so this only refetches once the TTL has lapsed.
		const hasSidebarWeather = this.plugin.settings.widgetWeatherEnabled;
		if (!hasWeather && !hasSidebarWeather) return;
		// Refresh in place instead of rebuilding the whole dashboard. Full
		// render() here was the main source of periodic jank on mobile - it
		// emptied and rebuilt every card/section.
		clearWeatherCache();
		const root = this.containerEl.children[1] as HTMLElement | undefined;
		if (!root) return;
		if (hasWeather) refreshWeatherCards(root, this.data);
		if (hasSidebarWeather) refreshSidebarWeatherWidget(root, this.plugin.settings, this.app);
	}, DashboardView.WEATHER_REFRESH_MS);
}

export function stopWeatherRefresh(this: DashboardView): void {
	if (this.weatherRefreshTimer) {
		window.clearInterval(this.weatherRefreshTimer);
		this.weatherRefreshTimer = null;
	}
	clearWeatherCache();
}

export function startDayRolloverChecker(this: DashboardView): void {
	this.dayRolloverTimer = window.setInterval(() => this.checkDayRollover(), DashboardView.DAY_ROLLOVER_CHECK_MS);
}

export function stopDayRolloverChecker(this: DashboardView): void {
	if (this.dayRolloverTimer) {
		window.clearInterval(this.dayRolloverTimer);
		this.dayRolloverTimer = null;
	}
}

export function checkDayRollover(this: DashboardView): void {
	if (!this.data) return;
	const todayKey = new Date().toDateString();
	if (todayKey === this.lastRenderedDay) return;

	this.lastRenderedDay = todayKey;
	// Invalidate the widget signature so the preserved widgets DOM is rebuilt:
	// date-dependent widgets (lunar, year progress, countdown values, task
	// calendar) must recompute for the new day.
	this.sidebarWidgetsSig = null;
	this.render(this.data);
}

export function checkReminders(this: DashboardView): void {
	if (!this.data) return;
	const now = new Date();

	for (const col of this.data.columns) {
		for (const card of col.cards) {
			for (let i = 0; i < card.tasks.length; i++) {
				const task = card.tasks[i]!;
				if (!task.reminder || task.checked) continue;

				const key = `${card.id}-${JSON.stringify([i])}`;
				if (this.firedReminders.has(key)) continue;

				const parts = task.reminder.trim().split(/\s+/);
				if (parts.length < 2) continue;
				const [dateStr, timeStr] = parts;
				const [year, month, day] = dateStr!.split('-').map(Number);
				const [hour, min] = timeStr!.split(':').map(Number);
				if (!year || !month || !day) continue;
				const due = new Date(year, month - 1, day, hour ?? 0, min ?? 0);

				if (now >= due) {
					this.firedReminders.add(key);
					const cleanText = task.text.replace(/\[\[[^\]]+\]\]/g, (match) => {
						const inner = match.slice(2, -2);
						return inner.split('|').pop()?.split('/').pop()?.replace(/\.md$/, '') ?? inner;
					});
					this.showReminderModal(cleanText, card.id, [i]);
				}
			}
		}

		// Countdown reminders (one per configured countdown)
		if (this.plugin.settings.countdownEnabled) {
			for (const cd of this.plugin.settings.countdowns ?? []) {
				if (!cd.targetDate || cd.reminderDays <= 0) continue;
				const ckKey = `countdown-remind-${cd.id}`;
				if (this.firedReminders.has(ckKey)) continue;
				const raw = cd.targetDate;
				const target = raw.includes('T') ? new Date(raw) : new Date(raw + 'T00:00:00');
				const diffMs = target.getTime() - now.getTime();
				const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
				if (daysLeft >= 0 && daysLeft <= cd.reminderDays) {
					this.firedReminders.add(ckKey);
					const label = cd.label || cd.targetDate;
					new Notice(t('countdown.reminderNotice', { label, days: String(daysLeft) }));
				}
			}
		}
	}

	// Anniversary reminders: fire once a year on the entry's month/day
	// (outside the columns loop — a per-column placement would just repeat
	// the same guarded check). Feb 29 entries roll to Mar 1 in common
	// years via the Date overflow in anniversaryDateThisYear.
	if (this.plugin.settings.anniversaryEnabled) {
		for (const av of this.plugin.settings.anniversaries ?? []) {
			if (!av.annualReminder || !av.startDate) continue;
			const avKey = `anniversary-remind-${av.id}`;
			if (this.firedReminders.has(avKey)) continue;
			const start = parseAnniversaryDate(av.startDate);
			if (!start) continue;
			const today = anniversaryDateThisYear(start, now);
			if (
				now.getFullYear() === today.getFullYear() &&
				now.getMonth() === today.getMonth() &&
				now.getDate() === today.getDate()
			) {
				this.firedReminders.add(avKey);
				const label = av.label || av.startDate;
				const years = String(now.getFullYear() - start.getFullYear());
				new Notice(t('anniversary.reminderNotice', { label, years }));
			}
		}
	}
}

export function showReminderModal(this: DashboardView, taskText: string, cardId: string, taskPath: number[]): void {
	const modal = new ReminderNoticeModal(
		this.app,
		taskText,
		() => {
			void this.sync.editTaskReminder(cardId, taskPath, undefined);
		},
		() => {
			const snoozed = new Date(Date.now() + 60 * 60 * 1000);
			const pad = (n: number) => String(n).padStart(2, '0');
			const newReminder = `${snoozed.getFullYear()}-${pad(snoozed.getMonth() + 1)}-${pad(snoozed.getDate())} ${pad(snoozed.getHours())}:${pad(snoozed.getMinutes())}`;
			this.firedReminders.delete(`${cardId}-${JSON.stringify(taskPath)}`);
			void this.sync.editTaskReminder(cardId, taskPath, newReminder);
		},
	);
	modal.open();
}
