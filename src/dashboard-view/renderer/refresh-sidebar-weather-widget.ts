import { App, setIcon } from 'obsidian';
import type { DashboardSettings } from '../types';
import { t, getLanguage } from '../../shared/i18n';
import { fetchWeather, getCachedWeather, getWeatherEmoji, getWeatherDescription } from '../widgets/weather-service';
import type { PomodoroService } from '../pomodoro/pomodoro-service';
import { activityColor } from '../pomodoro/pomodoro-service';
import { applyWidgetBackground, appendInlineBackgroundButton } from '../widgets/widget-background';
import { formatTime, showPomodoroStats } from './render-sidebar-countdown';

export type WidgetEntry = { key: string; render: (host: HTMLElement) => void };
export function sortByOrder(items: WidgetEntry[], order: string[]): WidgetEntry[] {
	const orderMap = new Map(order.map((k, i) => [k, i]));
	const sorted = [...items].sort((a, b) => {
		// quickActions predates the widget system; a saved order without it
		// keeps it first (its historical spot above the widgets).
		const ai = orderMap.get(a.key) ?? (a.key === 'quickActions' ? -1 : order.length);
		const bi = orderMap.get(b.key) ?? (b.key === 'quickActions' ? -1 : order.length);
		return ai - bi;
	});
	return sorted;
}
export function setupWidgetDnD(
	widgetArea: HTMLElement,
	currentKeys: string[],
	onReorder: (order: string[]) => void,
	stacked: boolean,
): void {
	let draggedKey: string | null = null;

	/** All drag-order cards: keyed by [data-widget-key], which sits on the
	 *  widget itself OR on the bare mount wrapper refreshDataWidget re-renders
	 *  lunar/pomodoro/reading into (the wrapper inherits the key). */
	const widgets = () => widgetArea.querySelectorAll('[data-widget-key]');

	/** Clear every drag-over indicator class (both axes swept as defense). */
	const clearDragOver = (el: HTMLElement): void => {
		el.removeClass('dashboard-sidebar-widget--drag-over-top');
		el.removeClass('dashboard-sidebar-widget--drag-over-bottom');
		el.removeClass('dashboard-sidebar-widget--drag-over-left');
		el.removeClass('dashboard-sidebar-widget--drag-over-right');
	};

	/** Insertion side for a pointer position over `wEl`: against the vertical
	 *  midpoint. Both layouts read the Y axis — the side rail stacks widgets
	 *  vertically, and the stacked deck is a column-major grid where "above
	 *  the target" is exactly "earlier in the flat order". */
	const isBefore = (wEl: HTMLElement, e: DragEvent): boolean => {
		const rect = wEl.getBoundingClientRect();
		return e.clientY < rect.top + rect.height / 2;
	};

	/** Controls whose own pointer gesture must not be hijacked by the widget's
	 *  drag-to-reorder: the music volume slider, text inputs, selects, buttons
	 *  and links. A native HTML5 drag starts on ANY mousedown inside a
	 *  `draggable` ancestor, so `draggable` is armed per gesture instead of
	 *  once at setup: pressing a control leaves it off (the control keeps its
	 *  drag/select behaviour), pressing plain widget surface turns it on.
	 *  `[data-no-drag]` is the opt-out hook for clickable non-form elements
	 *  (playlist rows and similar) that want the same protection. */
	const DRAG_BLOCKED = 'input, textarea, select, button, a[href], [contenteditable], [data-no-drag]';

	// Stacked mode pins the quick-actions card to the leftmost slot, so
	// dropping onto it (or dragging it) could never move anything on screen.
	// It exits the reorder system there entirely: no insertion indicators, no
	// persisted no-op order writes that would read as a broken drag.
	const isPinned = (keyEl: HTMLElement): boolean => stacked && keyEl.dataset.widgetKey === 'quickActions';

	widgets().forEach((el) => {
		const wEl = el as HTMLElement;
		if (isPinned(wEl)) return;
		wEl.setAttribute('draggable', 'false');
	});

	// Delegation on the widget AREA, not per-widget listeners: the in-place
	// data refresh (view.refreshDataWidget) re-mounts lunar/pomodoro/reading
	// inside a new wrapper mid-session, and drag events bubble — delegated
	// handlers keep working across those swaps without re-wiring.
	const keyElOf = (e: Event): HTMLElement | null => {
		const target = e.target as HTMLElement | null;
		const hit = target?.closest('[data-widget-key]') as HTMLElement | null;
		if (!hit || !widgetArea.contains(hit)) return null;
		return hit;
	};

	widgetArea.addEventListener('mousedown', (e) => {
		const keyEl = keyElOf(e);
		if (!keyEl || isPinned(keyEl)) return;
		const blocked = e.button !== 0 || !!(e.target as HTMLElement | null)?.closest(DRAG_BLOCKED);
		keyEl.setAttribute('draggable', blocked ? 'false' : 'true');
	});

	widgetArea.addEventListener('dragstart', (e) => {
		const keyEl = keyElOf(e);
		if (!keyEl || isPinned(keyEl)) return;
		draggedKey = keyEl.dataset.widgetKey ?? null;
		keyEl.addClass('dashboard-sidebar-widget--dragging');
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', draggedKey ?? '');
		}
	});

	widgetArea.addEventListener('dragend', (e) => {
		const keyEl = keyElOf(e);
		if (keyEl) {
			keyEl.setAttribute('draggable', 'false');
			keyEl.removeClass('dashboard-sidebar-widget--dragging');
		}
		widgets().forEach((el2) => clearDragOver(el2 as HTMLElement));
		draggedKey = null;
	});

	widgetArea.addEventListener('dragover', (e) => {
		const keyEl = keyElOf(e);
		if (!keyEl || isPinned(keyEl)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		if (!draggedKey || keyEl.dataset.widgetKey === draggedKey) return;
		widgets().forEach((el2) => clearDragOver(el2 as HTMLElement));
		keyEl.addClass(
			isBefore(keyEl, e)
				? 'dashboard-sidebar-widget--drag-over-top'
				: 'dashboard-sidebar-widget--drag-over-bottom',
		);
	});

	widgetArea.addEventListener('dragleave', (e) => {
		const keyEl = keyElOf(e);
		if (keyEl) clearDragOver(keyEl);
	});

	widgetArea.addEventListener('drop', (e) => {
		const keyEl = keyElOf(e);
		if (!keyEl || isPinned(keyEl)) return;
		e.preventDefault();
		clearDragOver(keyEl);
		if (!draggedKey || keyEl.dataset.widgetKey === draggedKey) return;

		const targetKey = keyEl.dataset.widgetKey ?? '';
		const insertBefore = isBefore(keyEl, e);

		const keys = [...currentKeys];
		const fromIdx = keys.indexOf(draggedKey);
		if (fromIdx === -1) return;
		keys.splice(fromIdx, 1);
		let toIdx = keys.indexOf(targetKey);
		if (toIdx === -1) return;
		if (!insertBefore) toIdx += 1;
		keys.splice(toIdx, 0, draggedKey);
		onReorder(keys);
	});
}
export function renderSidebarWeather(
	container: HTMLElement,
	settings: import('../types').DashboardSettings,
	app: App,
): void {
	const widget = container.createDiv({ cls: 'dashboard-sidebar-widget dashboard-sidebar-weather' });
	renderSidebarWeatherInto(widget, settings, app);
}
function renderSidebarWeatherInto(widget: HTMLElement, settings: import('../types').DashboardSettings, app: App): void {
	const cityName = settings.widgetWeatherCity || '';

	widget.createDiv({ cls: 'dashboard-sidebar-weather-loading', text: '...' });

	const config = {
		latitude: settings.widgetWeatherLat || 31.23,
		longitude: settings.widgetWeatherLon || 121.47,
		cityName: cityName || 'Shanghai',
	};

	const cached = getCachedWeather(config);
	if (cached) {
		widget.empty();
		renderSidebarWeatherContent(widget, cached, config.cityName);
		return;
	}

	fetchWeather(config)
		.then((data) => {
			widget.empty();
			renderSidebarWeatherContent(widget, data, config.cityName);
		})
		.catch(() => {
			widget.empty();
			widget.createDiv({ cls: 'dashboard-sidebar-weather-error', text: '--' });
		});
}
export function refreshSidebarWeatherWidget(
	root: HTMLElement,
	settings: import('../types').DashboardSettings,
	app: App,
): void {
	const el = root.querySelector<HTMLElement>('.dashboard-sidebar-weather');
	if (!el) return;
	el.empty();
	renderSidebarWeatherInto(el, settings, app);
}
function renderSidebarWeatherContent(el: HTMLElement, data: import('../types').WeatherData, cityName: string): void {
	const top = el.createDiv({ cls: 'dashboard-sidebar-weather-top' });
	top.createDiv({ cls: 'dashboard-sidebar-weather-icon', text: getWeatherEmoji(data.weatherCode) });
	const tempWrap = top.createDiv({ cls: 'dashboard-sidebar-weather-temp-wrap' });
	tempWrap.createDiv({ cls: 'dashboard-sidebar-weather-temp', text: `${Math.round(data.temperature)}°` });

	const info = el.createDiv({ cls: 'dashboard-sidebar-weather-info' });
	info.createDiv({ cls: 'dashboard-sidebar-weather-city', text: cityName });
	const descLine = info.createDiv({ cls: 'dashboard-sidebar-weather-desc-line' });
	descLine.createSpan({ cls: 'dashboard-sidebar-weather-desc', text: getWeatherDescription(data.weatherCode) });

	const details = el.createDiv({ cls: 'dashboard-sidebar-weather-details' });
	details.createDiv({
		cls: 'dashboard-sidebar-weather-detail',
		text: `${t('weather.feelsLike') ?? 'Feels like'} ${Math.round(data.feelsLike)}°`,
	});
	details.createDiv({
		cls: 'dashboard-sidebar-weather-detail',
		text: `${t('weather.humidity') ?? 'Humidity'} ${Math.round(data.humidity)}%`,
	});
	details.createDiv({ cls: 'dashboard-sidebar-weather-detail', text: `${Math.round(data.windSpeed)} km/h` });

	if (data.dailyDates.length > 1) {
		const forecast = el.createDiv({ cls: 'dashboard-sidebar-weather-forecast' });
		const count = Math.min(data.dailyDates.length, 5);
		for (let i = 0; i < count; i++) {
			const day = forecast.createDiv({ cls: 'dashboard-sidebar-weather-fday' });
			const d = new Date(data.dailyDates[i]! + 'T00:00:00');
			const dayName = d.toLocaleDateString(getLanguage() === 'zh' ? 'zh-CN' : 'en', { weekday: 'short' });
			day.createDiv({
				cls: 'dashboard-sidebar-weather-fday-name',
				text: i === 0 ? (t('weather.today') ?? 'Today') : dayName,
			});
			day.createDiv({ cls: 'dashboard-sidebar-weather-fday-icon', text: getWeatherEmoji(data.dailyCodes[i]!) });
			const temps = day.createDiv({ cls: 'dashboard-sidebar-weather-fday-temps' });
			temps.createSpan({ cls: 'dashboard-sidebar-weather-fday-high', text: `${Math.round(data.dailyMax[i]!)}°` });
			temps.createSpan({ cls: 'dashboard-sidebar-weather-fday-low', text: `${Math.round(data.dailyMin[i]!)}°` });
		}
	}
}
export function renderSidebarPomodoro(
	container: HTMLElement,
	service: PomodoroService,
	settings: import('../types').DashboardSettings,
	app?: App,
	onBgChange?: (bg: import('../types').WidgetBackground | undefined) => void,
): void {
	const widget = container.createDiv({ cls: 'dashboard-sidebar-widget dashboard-sidebar-pomodoro' });
	if (app) applyWidgetBackground(widget, settings.pomodoroBackground, app);

	const state = service.getState();
	const isRunning = state.status === 'running';

	// Top row: today count left + activity selector centered + stats button right
	const topRow = widget.createDiv({ cls: 'dashboard-sidebar-pomodoro-top' });

	const todayCount = service.getTodayCount();
	const statsHint = topRow.createDiv({
		cls: 'dashboard-sidebar-pomodoro-stats-hint',
		text: '🍅 ' + t('pomodoro.today') + ' ' + todayCount,
	});

	topRow.createDiv({ cls: 'dashboard-sidebar-pomodoro-top-spacer' });

	// Activity selector (in title position)
	const currentActivity = service.getActivity();
	createActivitySelector(topRow, service, currentActivity);

	const statsBtn = topRow.createDiv({ cls: 'dashboard-sidebar-pomodoro-stats-btn' });
	setIcon(statsBtn, 'bar-chart-2');

	// Background gear rides the top row's right cluster (before stats), the
	// inline pattern shared with habit/music/quick-actions.
	if (app && onBgChange) {
		const gear = appendInlineBackgroundButton(topRow, app, settings.pomodoroBackground, onBgChange);
		topRow.insertBefore(gear, statsBtn);
	}

	// Ring
	const ringWrap = widget.createDiv({ cls: 'dashboard-sidebar-pomodoro-ring-wrap' });
	const svgSize = 72;
	const strokeWidth = 6;
	const radius = (svgSize - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;

	const svg = ringWrap.createSvg('svg', {
		cls: 'dashboard-sidebar-pomodoro-ring',
		attr: { viewBox: `0 0 ${svgSize} ${svgSize}`, width: String(svgSize), height: String(svgSize) },
	});
	svg.createSvg('circle', {
		cls: 'dashboard-sidebar-pomodoro-ring-bg',
		attr: { cx: svgSize / 2, cy: svgSize / 2, r: radius, 'stroke-width': strokeWidth, fill: 'none' },
	});
	const progressCircle = svg.createSvg('circle', {
		cls: 'dashboard-sidebar-pomodoro-ring-progress',
		attr: {
			cx: svgSize / 2,
			cy: svgSize / 2,
			r: radius,
			'stroke-width': strokeWidth,
			fill: 'none',
			'stroke-linecap': 'round',
			'stroke-dasharray': circumference,
			'stroke-dashoffset': '0',
			transform: `rotate(-90 ${svgSize / 2} ${svgSize / 2})`,
		},
	});
	const timeText = ringWrap.createDiv({
		cls: 'dashboard-sidebar-pomodoro-time',
		text: formatTime(state.remainingSeconds),
	});

	// Dots inside ring, below time
	const dotsWrap = ringWrap.createDiv({ cls: 'dashboard-sidebar-pomodoro-dots' });
	const interval = settings.pomodoroLongBreakInterval;
	for (let i = 0; i < interval; i++) {
		dotsWrap.createDiv({
			cls:
				'dashboard-sidebar-pomodoro-dot' +
				(i < state.completedWorkSessions ? ' dashboard-sidebar-pomodoro-dot--filled' : ''),
		});
	}

	// Start/stop button. When AutoStartBreak is off and a phase completed, the
	// service parks in paused-ready — label the button with the next action
	// instead of a generic start.
	const state2 = service.getState();
	const isStandby = state2.status === 'paused' && state2.remainingSeconds === state2.totalSeconds;
	const mainLabel = isRunning
		? t('pomodoro.stop')
		: isStandby
			? state2.phase === 'work'
				? t('pomodoro.resumeFocus')
				: t('pomodoro.startBreak')
			: t('pomodoro.startFocus');
	const mainBtn = widget.createEl('button', {
		cls: 'dashboard-sidebar-pomodoro-main-btn',
		text: mainLabel,
	});
	if (isRunning) {
		mainBtn.addClass('dashboard-sidebar-pomodoro-main-btn--running');
	}

	// --- Helpers ---
	function updateRing(remaining: number, total: number): void {
		const progress = total > 0 ? remaining / total : 1;
		progressCircle.setAttribute('stroke-dashoffset', String(circumference * (1 - progress)));
		timeText.textContent = formatTime(remaining);
	}
	updateRing(state.remainingSeconds, state.totalSeconds);

	function updateUI(): void {
		const s = service.getState();
		updateRing(s.remainingSeconds, s.totalSeconds);
		const running = s.status === 'running';
		const standby = s.status === 'paused' && s.remainingSeconds === s.totalSeconds;
		mainBtn.textContent = running
			? t('pomodoro.stop')
			: standby
				? s.phase === 'work'
					? t('pomodoro.resumeFocus')
					: t('pomodoro.startBreak')
				: t('pomodoro.startFocus');
		mainBtn.toggleClass('dashboard-sidebar-pomodoro-main-btn--running', running);
		const dots = dotsWrap.querySelectorAll('.dashboard-sidebar-pomodoro-dot');
		dots.forEach((dot, i) =>
			dot.toggleClass('dashboard-sidebar-pomodoro-dot--filled', i < s.completedWorkSessions),
		);
		const tc = service.getTodayCount();
		statsHint.textContent = t('pomodoro.today') + ' ' + tc;
	}

	service.setOnTick(() => {
		const s = service.getState();
		updateRing(s.remainingSeconds, s.totalSeconds);
	});

	service.setOnComplete(() => updateUI());

	mainBtn.addEventListener('click', () => {
		if (service.getState().status === 'running') {
			service.reset();
			updateUI();
		} else {
			service.start();
			updateUI();
		}
	});

	statsBtn.addEventListener('click', () => {
		showPomodoroStats(widget.ownerDocument, service);
	});
}
function createActivitySelector(
	parent: HTMLElement,
	service: PomodoroService,
	initialActivity: string,
): { activityTrigger: HTMLElement; updateActivityDisplay: (name: string) => void } {
	const wrap = parent.createDiv({ cls: 'dashboard-pomodoro-activity-selector' });

	const trigger = wrap.createDiv({
		cls:
			'dashboard-pomodoro-activity-trigger' +
			(initialActivity ? ' dashboard-pomodoro-activity-trigger--set' : ''),
	});

	let colorDot: HTMLElement | null = null;

	if (initialActivity) {
		colorDot = trigger.createDiv({ cls: 'dashboard-pomodoro-activity-color-dot' });
		colorDot.style.backgroundColor = activityColor(initialActivity);
		trigger.createSpan({ text: initialActivity });
	} else {
		trigger.createSpan({ text: t('pomodoro.tapToSetActivity'), cls: 'dashboard-pomodoro-activity-placeholder' });
	}

	let panel: HTMLElement | null = null;

	function updateActivityDisplay(name: string): void {
		trigger.empty();
		trigger.toggleClass('dashboard-pomodoro-activity-trigger--set', name.length > 0);
		if (name) {
			const dot = trigger.createDiv({ cls: 'dashboard-pomodoro-activity-color-dot' });
			dot.style.backgroundColor = activityColor(name);
			trigger.createSpan({ text: name });
		} else {
			trigger.createSpan({
				text: t('pomodoro.tapToSetActivity'),
				cls: 'dashboard-pomodoro-activity-placeholder',
			});
		}
	}

	function closePanel(): void {
		if (panel) {
			panel.remove();
			panel = null;
		}
	}

	function openPanel(): void {
		closePanel();

		panel = wrap.createDiv({ cls: 'dashboard-pomodoro-activity-panel' });

		const input = panel.createEl('input', {
			cls: 'dashboard-pomodoro-activity-panel-input',
			attr: { type: 'text', placeholder: t('pomodoro.inputActivity') },
		});

		const recentActivities = service.getRecentActivities(6);
		if (recentActivities.length > 0) {
			const chipsWrap = panel.createDiv({ cls: 'dashboard-pomodoro-activity-chips' });
			for (const act of recentActivities) {
				const chip = chipsWrap.createDiv({ cls: 'dashboard-pomodoro-activity-chip' });
				const dot = chip.createDiv({ cls: 'dashboard-pomodoro-activity-color-dot' });
				dot.style.backgroundColor = activityColor(act);
				chip.createSpan({ text: act });
				chip.addEventListener('click', (e) => {
					e.stopPropagation();
					service.setActivity(act);
					updateActivityDisplay(act);
					closePanel();
				});
			}
		}

		input.focus();

		const finish = (save: boolean) => {
			const val = input.value.trim();
			if (save && val) {
				service.setActivity(val);
				updateActivityDisplay(val);
			}
			closePanel();
		};

		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				finish(true);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				finish(false);
			}
		});
	}

	trigger.addEventListener('click', (e) => {
		e.stopPropagation();
		if (panel) {
			closePanel();
		} else {
			openPanel();
		}
	});

	// Close panel when clicking outside
	const doc = parent.ownerDocument;
	const onDocClick = (e: MouseEvent) => {
		if (panel && !panel.contains(e.target as Node) && !trigger.contains(e.target as Node)) {
			closePanel();
		}
	};
	doc.addEventListener('click', onDocClick);

	return { activityTrigger: trigger, updateActivityDisplay };
}
