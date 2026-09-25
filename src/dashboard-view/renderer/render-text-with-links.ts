import { App, Platform, setIcon } from 'obsidian';
import type {
	DashboardData,
	DashboardColumn,
	DashboardCard,
	RenderCallbacks,
	TaskItem,
	DashboardSettings,
	CardSize,
	TrackerStyle,
} from '../types';
import { t, getLanguage } from '../../shared/i18n';
import { attachNoteHover } from '../ui/hover-preview';
import { fetchWeather, getCachedWeather, getWeatherEmoji, getWeatherDescription } from '../widgets/weather-service';
import { readTrackerData, computeStreak } from '../widgets/tracker-service';
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
import { activeHoverParent, activeNoteOpener, destroyChart, getCSSVar, resolveNoteFile } from './destroy-all-charts';
import { renderTrackerBarChart, renderTrackerHeatmap, renderTrackerLineChart } from './render-tracker-line-chart';

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

export function getSectionType(column: DashboardColumn): string {
	if (column.sectionType) return column.sectionType;
	const lower = column.name.toLowerCase();
	if (lower === 'memo') return 'memo';
	if (lower === 'todo') return 'todo';
	if (lower === 'sticky') return 'sticky';
	if (lower === 'projects') return 'projects';
	if (lower === 'notes') return 'notes';
	if (lower === 'dashboard') return 'dashboard';
	if (lower === 'library') return 'library';
	if (lower === 'folder') return 'folder';
	if (lower === 'images') return 'images';
	if (lower === 'videos') return 'videos';
	if (lower === 'alltasks') return 'alltasks';
	if (lower === 'calendar') return 'calendar';
	if (lower === 'dataview') return 'dataview';
	if (lower === 'weread') return 'weread';
	if (lower === 'web') return 'web';
	if (column.cards.length > 0) {
		const types = new Set(column.cards.map((c) => c.type));
		const dashboardTypes = new Set(['chart', 'weather', 'tracker']);
		if ([...types].every((t) => dashboardTypes.has(t)) && types.size > 0) return 'dashboard';
		if (types.has('task') && types.size === 1) return 'todo';
		if (types.has('task') && !types.has('project')) return 'todo';
		if (types.has('project') && types.size === 1) return 'projects';
		if (types.has('generic') && !types.has('project') && !types.has('task')) return 'memo';
	}
	return 'projects';
}
export function renderTextWithLinks(container: HTMLElement, text: string, app: App): void {
	const parts = text.split(/(\[\[[^\]]+?\]\]|\[[^\]]+\]\([^)]+\))/g);
	for (const part of parts) {
		const wikiMatch = part.match(/^\[\[([^\]]+)\]\]$/);
		if (wikiMatch) {
			renderWikilink(container, wikiMatch[1]!, app);
			continue;
		}
		const extMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
		if (extMatch) {
			renderExternalLink(container, extMatch[1]!, extMatch[2]!);
			continue;
		}
		if (part) {
			container.appendText(part);
		}
	}
}
function renderWikilink(container: HTMLElement, content: string, app: App): void {
	let alias: string | undefined;
	let linkPart = content;

	const pipeIdx = content.indexOf('|');
	if (pipeIdx !== -1) {
		alias = content.slice(pipeIdx + 1);
		linkPart = content.slice(0, pipeIdx);
	}

	let path = linkPart;
	let fragment: string | undefined;

	const hashIdx = linkPart.indexOf('#');
	if (hashIdx !== -1) {
		path = linkPart.slice(0, hashIdx);
		fragment = linkPart.slice(hashIdx + 1);
	}

	const noteName = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
	let displayName: string;
	if (alias) {
		displayName = alias;
	} else if (fragment) {
		displayName = `${noteName} > ${fragment}`;
	} else {
		displayName = noteName;
	}

	const link = container.createSpan({
		cls: 'dashboard-wikilink',
		text: displayName,
	});

	const file = resolveNoteFile(app, path);

	if (file && !Platform.isMobile && activeHoverParent.current) {
		attachNoteHover(app, link, file, activeHoverParent.current, fragment ? `#${fragment}` : undefined);
	}

	link.addEventListener('click', (e) => {
		e.stopPropagation();
		if (!file) return;
		activeNoteOpener.current?.(file, fragment ? `#${fragment}` : undefined);
	});
}
function renderExternalLink(container: HTMLElement, text: string, url: string): void {
	const link = container.createSpan({
		cls: 'dashboard-external-link',
		text: text,
	});
	link.addEventListener('click', (e) => {
		e.stopPropagation();
		window.open(url, '_blank');
	});
}
function isReminderOverdue(reminder: string): boolean {
	const now = new Date();
	const parts = reminder.trim().split(/\s+/);
	if (parts.length < 2) return false;
	const dateStr = parts[0]!;
	const timeStr = parts[1]!;
	const [year, month, day] = dateStr.split('-').map(Number);
	const [hour, min] = timeStr.split(':').map(Number);
	if (!year || !month || !day) return false;
	const due = new Date(year, month - 1, day, hour ?? 0, min ?? 0);
	return now >= due;
}
export function createReminderButton(
	taskItem: HTMLElement,
	cardId: string,
	taskPath: number[],
	task: TaskItem,
	callbacks: RenderCallbacks,
): HTMLElement {
	const btn = createEl('button');
	btn.setAttribute('draggable', 'false');
	btn.addClass('dashboard-task-reminder-btn');

	if (task.reminder) {
		btn.addClass('dashboard-task-reminder-btn--active');
		setIcon(btn, 'bell-ring');
		btn.setAttribute('aria-label', t('reminder.editReminder'));
		if (!task.checked && isReminderOverdue(task.reminder)) {
			btn.addClass('dashboard-task-reminder-btn--overdue');
		}
	} else {
		setIcon(btn, 'bell');
		btn.setAttribute('aria-label', t('reminder.setReminder'));
	}

	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		e.preventDefault();
		showReminderPopup(btn, cardId, taskPath, task, callbacks);
	});

	return btn;
}
function showReminderPopup(
	anchorBtn: HTMLElement,
	cardId: string,
	taskPath: number[],
	task: TaskItem,
	callbacks: RenderCallbacks,
): void {
	closeAllReminderPopups();

	const popup = activeDocument.body.createDiv({ cls: 'dashboard-task-reminder-popup' });

	// Inherit theme variables from dashboard root (popup is on body, outside theme scope)
	const dashboardRoot = anchorBtn.closest('.apex-dashboard-root') as HTMLElement;
	if (dashboardRoot) {
		const rs = getComputedStyle(dashboardRoot);
		const themeVars = [
			'--db-bg',
			'--db-bg-card',
			'--db-bg-card-hover',
			'--db-border-card',
			'--db-text',
			'--db-text-muted',
			'--db-accent',
			'--db-radius-md',
			'--db-radius-sm',
			'--db-font',
		];
		themeVars.forEach((v) => {
			const val = rs.getPropertyValue(v).trim();
			if (val) popup.style.setProperty(v, val);
		});
	}

	const rect = anchorBtn.getBoundingClientRect();
	popup.setCssProps({
		position: 'fixed',
		top: `${rect.bottom + 4}px`,
	});

	const popupWidth = 240;
	if (rect.left + popupWidth > window.innerWidth) {
		popup.style.right = `${window.innerWidth - rect.right}px`;
	} else {
		popup.style.left = `${rect.left}px`;
	}

	// Scroll & resize tracking — reposition popup when content moves
	const updatePopupPosition = () => {
		const r = anchorBtn.getBoundingClientRect();
		if (r.height === 0 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
			closeAllReminderPopups();
			return;
		}
		popup.style.top = `${r.bottom + 4}px`;
		if (r.left + popupWidth > window.innerWidth) {
			popup.setCssProps({
				right: `${window.innerWidth - r.right}px`,
				left: 'auto',
			});
		} else {
			popup.setCssProps({
				left: `${r.left}px`,
				right: 'auto',
			});
		}
	};
	activeDocument.addEventListener('scroll', updatePopupPosition, { passive: true, capture: true });
	window.addEventListener('resize', updatePopupPosition);
	(popup as HTMLElement & { __reminderCleanup?: () => void }).__reminderCleanup = () => {
		activeDocument.removeEventListener('scroll', updatePopupPosition, { capture: true });
		window.removeEventListener('resize', updatePopupPosition);
	};

	// Parse initial values
	let selectedYear: number;
	let selectedMonth: number;
	let selectedDay: number;
	let selectedHour = 9;
	let selectedMin = 0;

	const now = new Date();
	if (task.reminder) {
		const parts = task.reminder.trim().split(/\s+/);
		const dp = parts[0]?.split('-').map(Number) ?? [];
		const tp = parts[1]?.split(':').map(Number) ?? [];
		selectedYear = dp[0] ?? now.getFullYear();
		selectedMonth = (dp[1] ?? now.getMonth() + 1) - 1;
		selectedDay = dp[2] ?? now.getDate();
		selectedHour = tp[0] ?? 9;
		selectedMin = tp[1] ?? 0;
	} else {
		selectedYear = now.getFullYear();
		selectedMonth = now.getMonth();
		selectedDay = now.getDate();
	}

	const viewYear = { value: selectedYear };
	const viewMonth = { value: selectedMonth };

	const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

	// Calendar nav
	const calNav = popup.createDiv({ cls: 'dashboard-task-reminder-calendar-nav' });
	const prevBtn = calNav.createEl('button', { text: '<' });
	const monthLabel = calNav.createSpan();
	const nextBtn = calNav.createEl('button', { text: '>' });

	// Calendar grid
	const calGrid = popup.createDiv({ cls: 'dashboard-task-reminder-calendar' });

	// Time picker
	const timeRow = popup.createDiv({ cls: 'dashboard-task-reminder-time' });
	const hourSelect = timeRow.createEl('select');
	for (let h = 0; h < 24; h++) {
		const opt = hourSelect.createEl('option', { text: String(h).padStart(2, '0'), attr: { value: String(h) } });
		if (h === selectedHour) opt.selected = true;
	}
	timeRow.createSpan({ text: ':' });
	const minSelect = timeRow.createEl('select');
	for (let m = 0; m < 60; m++) {
		const opt = minSelect.createEl('option', { text: String(m).padStart(2, '0'), attr: { value: String(m) } });
		if (m === selectedMin) opt.selected = true;
	}

	// Action buttons
	const btnRow = popup.createDiv({ cls: 'dashboard-task-reminder-popup-btns' });
	const saveBtn = btnRow.createEl('button', { cls: 'mod-cta', text: t('common.save') });
	if (task.reminder) {
		btnRow.createEl('button', { cls: 'dashboard-task-reminder-clear', text: t('reminder.clearReminder') });
	}

	const renderCalendar = () => {
		calGrid.empty();
		const y = viewYear.value;
		const m = viewMonth.value;
		monthLabel.setText(`${y}-${String(m + 1).padStart(2, '0')}`);

		for (const d of dayNames) {
			calGrid.createDiv({ cls: 'dashboard-task-reminder-calendar-header', text: d });
		}

		const firstDay = new Date(y, m, 1).getDay();
		const daysInMonth = new Date(y, m + 1, 0).getDate();
		const daysInPrev = new Date(y, m, 0).getDate();

		const today = new Date();
		const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m;

		for (let i = firstDay - 1; i >= 0; i--) {
			const d = daysInPrev - i;
			calGrid.createEl('button', {
				cls: 'dashboard-task-reminder-calendar-day dashboard-task-reminder-calendar-day--other-month',
				text: String(d),
			});
		}

		for (let d = 1; d <= daysInMonth; d++) {
			const cls = ['dashboard-task-reminder-calendar-day'];
			if (isCurrentMonth && d === today.getDate()) cls.push('dashboard-task-reminder-calendar-day--today');
			if (y === selectedYear && m === selectedMonth && d === selectedDay)
				cls.push('dashboard-task-reminder-calendar-day--selected');

			const dayBtn = calGrid.createEl('button', { cls: cls.join(' '), text: String(d) });
			dayBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				selectedYear = y;
				selectedMonth = m;
				selectedDay = d;
				renderCalendar();
			});
		}

		const totalCells = firstDay + daysInMonth;
		const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
		for (let d = 1; d <= remaining; d++) {
			calGrid.createEl('button', {
				cls: 'dashboard-task-reminder-calendar-day dashboard-task-reminder-calendar-day--other-month',
				text: String(d),
			});
		}
	};

	prevBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		viewMonth.value--;
		if (viewMonth.value < 0) {
			viewMonth.value = 11;
			viewYear.value--;
		}
		renderCalendar();
	});

	nextBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		viewMonth.value++;
		if (viewMonth.value > 11) {
			viewMonth.value = 0;
			viewYear.value++;
		}
		renderCalendar();
	});

	saveBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const h = parseInt(hourSelect.value, 10);
		const m = parseInt(minSelect.value, 10);
		const reminder = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
		callbacks.onTaskReminderEdit(cardId, taskPath, reminder);
		closeAllReminderPopups();
	});

	btnRow.querySelector('.dashboard-task-reminder-clear')?.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.onTaskReminderEdit(cardId, taskPath, undefined);
		closeAllReminderPopups();
	});

	const outsideClick = (ev: MouseEvent) => {
		if (!popup.contains(ev.target as Node)) {
			closeAllReminderPopups();
			activeDocument.removeEventListener('mousedown', outsideClick);
		}
	};
	window.setTimeout(() => activeDocument.addEventListener('mousedown', outsideClick), 0);

	renderCalendar();
}
function closeAllReminderPopups(): void {
	activeDocument.querySelectorAll('.dashboard-task-reminder-popup').forEach((el) => {
		const popup = el as HTMLElement & { __reminderCleanup?: () => void };
		popup.__reminderCleanup?.();
		popup.remove();
	});
}
function renderWeatherInto(el: HTMLElement, card: DashboardCard): void {
	if (!card.weatherConfig) return;

	const cached = getCachedWeather(card.weatherConfig);
	if (cached) {
		renderWeatherContent(el, cached, card.weatherConfig.cityName);
	} else {
		el.createDiv({ cls: 'dashboard-weather-loading', text: '...' });
		fetchWeather(card.weatherConfig)
			.then((data) => {
				el.empty();
				renderWeatherContent(el, data, card.weatherConfig!.cityName);
			})
			.catch(() => {
				el.empty();
				el.createDiv({ cls: 'dashboard-weather-error', text: t('weather.fetchError') });
			});
	}
}
export function renderWeatherBody(container: HTMLElement, card: DashboardCard, app: App): void {
	if (!card.weatherConfig) return;

	const el = container.createDiv({ cls: 'dashboard-weather' });
	renderWeatherInto(el, card);
}
export function refreshWeatherCards(root: HTMLElement, data: DashboardData): void {
	for (const column of data.columns) {
		for (const card of column.cards) {
			if (card.type !== 'weather' || !card.weatherConfig) continue;
			const cardEl = root.querySelector(`[data-card-id="${CSS.escape(card.id)}"]`);
			if (!(cardEl instanceof HTMLElement)) continue;
			const weatherEl = cardEl.querySelector('.dashboard-weather');
			if (!(weatherEl instanceof HTMLElement)) continue;
			weatherEl.empty();
			renderWeatherInto(weatherEl, card);
		}
	}
}
function renderWeatherContent(el: HTMLElement, data: import('../types').WeatherData, cityName: string): void {
	const current = el.createDiv({ cls: 'dashboard-weather-current' });
	const tempWrap = current.createDiv({ cls: 'dashboard-weather-temp-wrap' });
	tempWrap.createDiv({ cls: 'dashboard-weather-temp', text: `${Math.round(data.temperature)}\u00B0` });
	tempWrap.createDiv({ cls: 'dashboard-weather-icon', text: getWeatherEmoji(data.weatherCode) });

	const details = current.createDiv({ cls: 'dashboard-weather-details' });
	details.createDiv({ cls: 'dashboard-weather-city', text: cityName });
	details.createDiv({ cls: 'dashboard-weather-desc', text: getWeatherDescription(data.weatherCode) });
	const metaLine = details.createDiv({ cls: 'dashboard-weather-wind' });
	metaLine.createSpan({
		text: `${t('weather.feelsLike')} ${Math.round(data.feelsLike)}\u00B0  ${t('weather.humidity')} ${Math.round(data.humidity)}%  ${t('weather.wind')} ${Math.round(data.windSpeed)} km/h`,
	});

	if (data.dailyDates.length > 0) {
		const forecast = el.createDiv({ cls: 'dashboard-weather-forecast' });
		const count = Math.min(data.dailyDates.length, 5);
		for (let i = 0; i < count; i++) {
			const day = forecast.createDiv({ cls: 'dashboard-weather-day' });
			const d = new Date(data.dailyDates[i]! + 'T00:00:00');
			const dayName = d.toLocaleDateString(getLanguage() === 'zh' ? 'zh-CN' : 'en', { weekday: 'short' });
			day.createDiv({ cls: 'dashboard-weather-day-name', text: dayName });
			day.createDiv({ cls: 'dashboard-weather-day-icon', text: getWeatherEmoji(data.dailyCodes[i]!) });
			day.createDiv({
				cls: 'dashboard-weather-day-temps',
				text: `${Math.round(data.dailyMax[i]!)}\u00B0 / ${Math.round(data.dailyMin[i]!)}\u00B0`,
			});
		}
	}
}
export function renderTrackerBody(
	container: HTMLElement,
	card: DashboardCard,
	app: App,
	settings?: import('../types').DashboardSettings,
): void {
	if (!card.trackerConfig) return;

	const config = card.trackerConfig;
	const size: CardSize = card.size || 'M';
	const style: TrackerStyle = config.style || 'line';
	destroyChart(card.id);

	const el = container.createDiv({ cls: `dashboard-tracker dashboard-tracker--${size}` });

	const data = readTrackerData(app, '', config.key, config.days);
	const validPoints = data.filter((p) => p.value !== null);

	if (validPoints.length === 0) {
		el.createDiv({ cls: 'dashboard-tracker-empty', text: t('tracker.noData') + ': ' + config.key });
		return;
	}

	const values = data.map((p) => p.value);
	const minVal = Math.min(...values.filter((v): v is number => v !== null));
	const maxVal = Math.max(...values.filter((v): v is number => v !== null));
	const sum = validPoints.reduce((s, p) => s + p.value!, 0);
	const avg = (sum / validPoints.length).toFixed(1);
	const latest = validPoints[validPoints.length - 1]!.value as number;
	const prev = validPoints.length > 1 ? (validPoints[validPoints.length - 2]!.value as number) : latest;
	const trendDir = latest > prev ? 'up' : latest < prev ? 'down' : 'flat';
	const trendPct = prev !== 0 ? (((latest - prev) / Math.abs(prev)) * 100).toFixed(1) : '0';

	// Streak: consecutive days with data (from latest backward, today optional)
	const streak = computeStreak(data);

	if (size === 'S') {
		const row = el.createDiv({ cls: 'dashboard-tracker-compact' });
		row.createDiv({ cls: 'dashboard-tracker-compact-value', text: String(latest) });
		const arrow = row.createDiv({ cls: `dashboard-tracker-trend dashboard-tracker-trend--${trendDir}` });
		arrow.setText(trendDir === 'up' ? '↑' : trendDir === 'down' ? '↓' : '→');
		if (config.key) {
			row.createDiv({ cls: 'dashboard-tracker-compact-label', text: config.key });
		}
		return;
	}

	const accentColor = getCSSVar('--db-accent') || '#6366f1';

	// Dispatch by style
	if (style === 'heatmap') {
		renderTrackerHeatmap(el, data, minVal, maxVal, size, accentColor);
	} else if (style === 'bar') {
		renderTrackerBarChart(el, data, size, accentColor, card.id);
	} else {
		renderTrackerLineChart(el, data, size, accentColor, card.id);
	}

	// Stats
	const stats = el.createDiv({ cls: 'dashboard-tracker-stats' });
	const addStat = (label: string, value: string | number) => {
		const stat = stats.createDiv({ cls: 'dashboard-tracker-stat' });
		stat.createSpan({ cls: 'dashboard-tracker-stat-label', text: label });
		stat.createSpan({ cls: 'dashboard-tracker-stat-value', text: String(value) });
	};
	addStat(t('tracker.current'), latest);
	addStat(t('tracker.avg'), avg);

	if (size === 'M') {
		addStat(t('tracker.trend'), `${trendDir === 'up' ? '+' : ''}${trendPct}%`);
	}

	if (size === 'L') {
		addStat(t('tracker.trend'), `${trendDir === 'up' ? '+' : ''}${trendPct}%`);
		addStat(t('tracker.streak'), `${streak}d`);
		addStat(t('tracker.min'), minVal);
		addStat(t('tracker.max'), maxVal);
	}
}
