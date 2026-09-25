import { App, setIcon } from 'obsidian';
import type { DashboardSettings } from '../types';
import { t } from '../../shared/i18n';
import { applyModalTheme } from '../appearance/modal-theme';
import type { PomodoroService } from '../pomodoro/pomodoro-service';
import { showPomodoroStats as openWidePomodoroStats } from '../pomodoro/pomodoro-stats-modal';
import type { ReadingService } from '../reading/reading-service';
import { resolveCoverAsObjectUrl } from '../reading/book-service';
import { applyWidgetBackground } from '../widgets/widget-background';
import { CountdownSettingsModal } from '../widgets/countdown-modal';
import { countdownTimers } from './destroy-all-charts';
import { openBookSearch, openEditBookInfo, showReadingStats } from './render-dashboard';

export function renderSidebarCountdown(container: HTMLElement, cd: import('../types').CountdownConfig, app: App): void {
	const widget = container.createDiv({ cls: 'dashboard-sidebar-widget dashboard-sidebar-countdown' });
	applyWidgetBackground(widget, cd.background, app);

	// Settings button (absolute positioned)
	const settingsBtn = widget.createEl('button', {
		cls: 'dashboard-sidebar-countdown-settings-btn',
		attr: { 'aria-label': t('countdown.settingsTitle') },
	});
	setIcon(settingsBtn, 'settings');

	settingsBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const modal = new CountdownSettingsModal(app, cd, (updated) => {
			const plugin = (
				app as unknown as {
					plugins: {
						plugins: Record<
							string,
							{
								settings?: import('../types').DashboardSettings;
								saveSettings?: () => Promise<void>;
								refreshAllDashboards?: () => void;
							}
						>;
					};
				}
			).plugins?.plugins?.['apex-dashboard'];
			if (plugin?.settings) {
				plugin.settings = {
					...plugin.settings,
					countdowns: (plugin.settings.countdowns ?? []).map((c) => (c.id === updated.id ? updated : c)),
				};
				void plugin.saveSettings?.();
				plugin.refreshAllDashboards?.();
			}
		});
		modal.open();
	});

	// Content
	const content = widget.createDiv({ cls: 'dashboard-sidebar-countdown-content' });

	const targetDate = cd.targetDate;
	if (!targetDate) {
		content.createDiv({ cls: 'dashboard-sidebar-countdown-placeholder', text: t('countdown.setTarget') });
		return;
	}

	const target = targetDate.includes('T') ? new Date(targetDate) : new Date(targetDate + 'T00:00:00');
	const now = new Date();

	if (now >= target) {
		if (cd.label) {
			content.createDiv({
				cls: 'dashboard-sidebar-countdown-until',
				text: t('countdown.untilLabel', { label: cd.label }),
			});
		}
		content.createDiv({ cls: 'dashboard-sidebar-countdown-expired', text: t('countdown.expired') });
		return;
	}

	const diffMs = target.getTime() - now.getTime();
	const remainDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
	const remainHours = Math.ceil(diffMs / (1000 * 60 * 60));
	const displayMode = cd.displayMode;
	const remainMinutes = Math.ceil(diffMs / (1000 * 60));
	const currentVal = displayMode === 'minutes' ? remainMinutes : displayMode === 'hours' ? remainHours : remainDays;

	// "距离xx还有" label above the number
	if (cd.label) {
		content.createDiv({
			cls: 'dashboard-sidebar-countdown-until',
			text: t('countdown.untilLabel', { label: cd.label }),
		});
	}

	// Value display with flip
	const flipWrap = content.createDiv({ cls: 'dashboard-sidebar-countdown-flip' });
	const valueEl = flipWrap.createDiv({ cls: 'dashboard-sidebar-countdown-value', text: String(currentVal) });
	flipWrap.createDiv({
		cls: 'dashboard-sidebar-countdown-unit',
		text:
			displayMode === 'minutes'
				? t('countdown.minutes')
				: displayMode === 'hours'
					? t('countdown.hours')
					: t('countdown.days'),
	});

	// Auto-refresh with flip animation
	let prevVal = currentVal;
	const timer = window.setInterval(() => {
		if (!content.isConnected) {
			window.clearInterval(timer);
			countdownTimers.delete(timer);
			return;
		}
		const now2 = new Date();
		if (now2 >= target) {
			window.clearInterval(timer);
			countdownTimers.delete(timer);
			content.empty();
			content.createDiv({ cls: 'dashboard-sidebar-countdown-expired', text: t('countdown.expired') });
			return;
		}
		const diff = target.getTime() - now2.getTime();
		const newVal =
			displayMode === 'minutes'
				? Math.ceil(diff / (1000 * 60))
				: displayMode === 'hours'
					? Math.ceil(diff / (1000 * 60 * 60))
					: Math.ceil(diff / (1000 * 60 * 60 * 24));
		if (newVal !== prevVal) {
			prevVal = newVal;
			valueEl.textContent = String(newVal);
			valueEl.addClass('dashboard-sidebar-countdown-value--flip');
			window.setTimeout(() => valueEl.removeClass('dashboard-sidebar-countdown-value--flip'), 400);
		}
	}, 60000);
	countdownTimers.set(timer, content);
}
export function showPomodoroStats(doc: Document, service: PomodoroService): void {
	// Landscape stats modal lives in its own module (KPIs, donut, trend,
	// ranking, heatmap, recent records + tag management entry).
	openWidePomodoroStats(doc, service);
}
export function formatTime(seconds: number): string {
	if (seconds >= 3600) {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function formatReadingDuration(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const mins = Math.floor((totalSeconds % 3600) / 60);
	if (hours > 0 && mins > 0) return t('reading.timeHM', { h: hours, m: mins });
	if (hours > 0) return t('reading.hours', { count: hours });
	return t('reading.minutes', { count: Math.max(1, mins) });
}
function formatShortDuration(totalSeconds: number): string {
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	if (h > 0) return `${h}h${m > 0 ? m + 'm' : ''}`;
	return `${Math.max(1, m)}m`;
}
export function renderSidebarReading(container: HTMLElement, service: ReadingService): void {
	const widget = container.createDiv({ cls: 'dashboard-sidebar-widget dashboard-sidebar-reading' });

	// Title row
	const titleRow = widget.createDiv({ cls: 'dashboard-reading-title-row' });
	titleRow.createDiv({ cls: 'dashboard-reading-title', text: t('reading.title') });
	titleRow.createDiv({ cls: 'dashboard-reading-title-spacer' });
	const addBtn = titleRow.createDiv({ cls: 'dashboard-reading-add-btn' });
	setIcon(addBtn, 'plus');
	const statsBtn = titleRow.createDiv({ cls: 'dashboard-reading-stats-btn' });
	setIcon(statsBtn, 'bar-chart-2');

	// Book cards scroll area
	const scrollArea = widget.createDiv({ cls: 'dashboard-reading-scroll' });

	const state = service.getState();
	const activeBooks = service.getActiveBooks();

	for (const book of activeBooks) {
		const isActive = state.status !== 'idle' && state.currentBook?.title === book.title;
		const isRunning = isActive && state.status === 'running';
		const card = scrollArea.createDiv({
			cls: 'dashboard-reading-book-card' + (isActive ? ' dashboard-reading-book-card--active' : ''),
		});

		// Cover - always show title fallback, async load real cover
		const coverWrap = card.createDiv({ cls: 'dashboard-reading-book-card-cover-wrap' });
		const placeholder = coverWrap.createDiv({ cls: 'dashboard-reading-book-card-cover-placeholder' });
		placeholder.textContent = book.title.length > 8 ? book.title.slice(0, 8) + '..' : book.title;
		if (book.coverUrl) {
			void resolveCoverAsObjectUrl(book.coverUrl, service.getApp()).then((blobUrl) => {
				if (blobUrl) {
					placeholder.setCssProps({ display: 'none' });
					coverWrap.style.backgroundImage = `url(${blobUrl})`;
				}
			});
		}

		// Info area
		const info = card.createDiv({ cls: 'dashboard-reading-book-card-info' });
		info.createDiv({ cls: 'dashboard-reading-book-card-title', text: book.title });
		if (book.author) {
			info.createDiv({ cls: 'dashboard-reading-book-card-author', text: book.author });
		}

		// Timer row
		const timerRow = info.createDiv({ cls: 'dashboard-reading-book-card-timer' });

		if (isActive) {
			timerRow.createDiv({
				cls: 'dashboard-reading-book-card-time dashboard-reading-book-card-time--active',
				text: formatTime(state.elapsedSeconds),
			});
		} else {
			const todaySec = service.getTodaySecondsForBook(book.title);
			timerRow.createDiv({
				cls: 'dashboard-reading-book-card-time',
				text: todaySec > 0 ? formatShortDuration(todaySec) : '--',
			});
		}

		// Play/pause/stop buttons
		const actions = timerRow.createDiv({ cls: 'dashboard-reading-book-card-actions' });

		if (isRunning) {
			const pauseBtn = actions.createDiv({
				cls: 'dashboard-reading-book-card-btn dashboard-reading-book-card-btn--pause',
			});
			setIcon(pauseBtn, 'pause');
			pauseBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				service.pause();
				refreshCards();
			});
			const stopBtn = actions.createDiv({
				cls: 'dashboard-reading-book-card-btn dashboard-reading-book-card-btn--stop',
			});
			setIcon(stopBtn, 'square');
			stopBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				service.pause();
				showEndModal(book);
			});
		} else if (isActive && state.status === 'paused') {
			const resumeBtn = actions.createDiv({
				cls: 'dashboard-reading-book-card-btn dashboard-reading-book-card-btn--play',
			});
			setIcon(resumeBtn, 'play');
			resumeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				service.resume();
				refreshCards();
			});
			const stopBtn = actions.createDiv({
				cls: 'dashboard-reading-book-card-btn dashboard-reading-book-card-btn--stop',
			});
			setIcon(stopBtn, 'square');
			stopBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				showEndModal(book);
			});
		} else {
			const playBtn = actions.createDiv({
				cls: 'dashboard-reading-book-card-btn dashboard-reading-book-card-btn--play',
			});
			setIcon(playBtn, 'play');
			playBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				service.startReading(book);
				refreshCards();
			});
		}

		// Progress bar
		if (book.totalPages > 0) {
			const progressWrap = info.createDiv({ cls: 'dashboard-reading-book-card-progress' });
			const pct = book.finished ? 100 : Math.min(100, Math.round((book.currentPage / book.totalPages) * 100));
			const progressBar = progressWrap.createDiv({ cls: 'dashboard-reading-book-card-progress-bar' });
			progressBar.createDiv({
				cls:
					'dashboard-reading-book-card-progress-fill' +
					(book.finished ? ' dashboard-reading-book-card-progress-fill--done' : ''),
				attr: { style: `width:${pct}%` },
			});
			progressWrap.createDiv({
				cls: 'dashboard-reading-book-card-progress-text',
				text: book.finished ? '100%' : `${book.currentPage}/${book.totalPages}`,
			});
		}

		// Action buttons (edit / remove)
		const editBtn = card.createDiv({ cls: 'dashboard-reading-book-card-action dashboard-reading-book-card-edit' });
		setIcon(editBtn, 'pencil');
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			openEditBookInfo(widget.ownerDocument, service, book, () => refreshCards());
		});

		const removeBtn = card.createDiv({
			cls: 'dashboard-reading-book-card-action dashboard-reading-book-card-remove',
		});
		setIcon(removeBtn, 'x');
		removeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			void service.removeActiveBook(book.title).then(() => refreshCards());
		});
	}

	// Timer tick - update active timer display
	service.setOnTick(() => {
		const s = service.getState();
		if (s.status === 'running') {
			const activeTime = scrollArea.querySelector('.dashboard-reading-book-card-time--active');
			if (activeTime) activeTime.textContent = formatTime(s.elapsedSeconds);
		}
	});

	addBtn.addEventListener('click', () => {
		openBookSearch(widget.ownerDocument, service, (book) => {
			if (book) void service.addActiveBook(book).then(() => refreshCards());
		});
	});

	statsBtn.addEventListener('click', () => {
		showReadingStats(widget.ownerDocument, service);
	});

	function showEndModal(book: import('../reading/reading-service').BookInfo): void {
		const elapsed = service.getElapsedSeconds();
		openEndReadingModal(widget.ownerDocument, service, book, elapsed, () => refreshCards());
	}

	function refreshCards(): void {
		refreshSidebarReadingWidget(widget.ownerDocument, service);
	}
}
export function refreshSidebarReadingWidget(doc: Document, service: ReadingService): void {
	const widgets = Array.from(doc.querySelectorAll<HTMLElement>('.dashboard-sidebar-reading'));
	if (widgets.length === 0) return;
	service.setOnTick(null);
	for (const w of widgets) {
		const parent = w.parentElement;
		if (!parent) continue;
		w.remove();
		renderSidebarReading(parent, service);
	}
}
export function openEndReadingModal(
	doc: Document,
	service: ReadingService,
	book: import('../reading/reading-service').BookInfo,
	elapsedSeconds: number,
	onDone: () => void,
): void {
	const overlay = doc.body.createDiv({ cls: 'dashboard-reading-end-overlay' });
	const modal = overlay.createDiv({ cls: 'dashboard-reading-end-modal' });
	applyModalTheme(modal);

	function close() {
		doc.removeEventListener('keydown', onKey);
		overlay.remove();
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
	doc.addEventListener('keydown', onKey);
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) close();
	});

	// Header
	const header = modal.createDiv({ cls: 'dashboard-reading-end-header' });
	header.createDiv({ cls: 'dashboard-reading-end-title', text: t('reading.endTitle') });
	const closeBtn = header.createDiv({ cls: 'dashboard-reading-end-close' });
	setIcon(closeBtn, 'x');
	closeBtn.addEventListener('click', close);

	// Body
	const body = modal.createDiv({ cls: 'dashboard-reading-end-body' });

	// Date row
	const dateRow = body.createDiv({ cls: 'dashboard-reading-end-row' });
	dateRow.createDiv({ cls: 'dashboard-reading-end-label', text: t('reading.endDate') });
	const now = new Date();
	dateRow.createDiv({
		cls: 'dashboard-reading-end-value',
		text: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
	});

	// Duration row
	const durRow = body.createDiv({ cls: 'dashboard-reading-end-row' });
	durRow.createDiv({ cls: 'dashboard-reading-end-label', text: t('reading.endDuration') });
	durRow.createDiv({ cls: 'dashboard-reading-end-value', text: formatReadingDuration(elapsedSeconds) });

	// Progress section
	const progressSection = body.createDiv({ cls: 'dashboard-reading-end-section' });
	progressSection.createDiv({ cls: 'dashboard-reading-end-section-title', text: t('reading.endProgress') });

	// Mode toggle: page / percentage
	let progressMode: 'page' | 'pct' = book.totalPages > 0 ? 'page' : 'pct';
	const modeToggle = progressSection.createDiv({ cls: 'dashboard-reading-end-mode-toggle' });
	const pageModeBtn = modeToggle.createDiv({
		cls:
			'dashboard-reading-end-mode-btn' +
			(progressMode === 'page' ? ' dashboard-reading-end-mode-btn--active' : ''),
		text: t('reading.endModePage'),
	});
	const pctModeBtn = modeToggle.createDiv({
		cls:
			'dashboard-reading-end-mode-btn' +
			(progressMode === 'pct' ? ' dashboard-reading-end-mode-btn--active' : ''),
		text: t('reading.endModePct'),
	});

	// Inputs container
	const inputsContainer = progressSection.createDiv({ cls: 'dashboard-reading-end-inputs' });

	function renderInputs(): void {
		inputsContainer.empty();
		const pageRow = inputsContainer.createDiv({ cls: 'dashboard-reading-end-page-row' });

		// Start value (readonly)
		const startCol = pageRow.createDiv({ cls: 'dashboard-reading-end-page-col' });
		startCol.createDiv({ cls: 'dashboard-reading-end-page-label', text: t('reading.endStartPage') });
		const startVal =
			progressMode === 'pct'
				? book.totalPages > 0
					? Math.round((book.currentPage / book.totalPages) * 100)
					: 0
				: book.currentPage;
		const suffix = progressMode === 'pct' ? '%' : '';
		startCol.createDiv({ cls: 'dashboard-reading-end-page-readonly', text: `${startVal}${suffix}` });

		pageRow.createDiv({ cls: 'dashboard-reading-end-page-arrow' });

		// End value (input)
		const endCol = pageRow.createDiv({ cls: 'dashboard-reading-end-page-col' });
		endCol.createDiv({ cls: 'dashboard-reading-end-page-label', text: t('reading.endEndPage') });
		const endInput = endCol.createEl('input', {
			cls: 'dashboard-reading-end-page-input',
			attr: {
				type: 'number',
				min: '0',
				max: progressMode === 'pct' ? '100' : '',
				placeholder: progressMode === 'pct' ? '0%' : '0',
			},
		});
		endInput.focus();

		// Total pages row (page mode, unknown total)
		if (progressMode === 'page' && !book.totalPages) {
			const totalRow = inputsContainer.createDiv({ cls: 'dashboard-reading-end-total-row' });
			totalRow.createDiv({ cls: 'dashboard-reading-end-page-label', text: t('reading.endTotalPages') });
			totalRow.createEl('input', {
				cls: 'dashboard-reading-end-page-input dashboard-reading-end-page-input--total',
				attr: { type: 'number', min: '0', placeholder: '?' },
			});
		}
	}
	renderInputs();

	pageModeBtn.addEventListener('click', () => {
		progressMode = 'page';
		pageModeBtn.addClass('dashboard-reading-end-mode-btn--active');
		pctModeBtn.removeClass('dashboard-reading-end-mode-btn--active');
		renderInputs();
	});
	pctModeBtn.addEventListener('click', () => {
		progressMode = 'pct';
		pctModeBtn.addClass('dashboard-reading-end-mode-btn--active');
		pageModeBtn.removeClass('dashboard-reading-end-mode-btn--active');
		renderInputs();
	});

	// Finished checkbox
	const finishedRow = body.createDiv({ cls: 'dashboard-reading-end-finished' });
	const checkbox = finishedRow.createEl('input', {
		cls: 'dashboard-reading-end-checkbox',
		attr: { type: 'checkbox', id: 'reading-finished' },
	});
	const checkLabel = finishedRow.createEl('label', {
		cls: 'dashboard-reading-end-checkbox-label',
		attr: { for: 'reading-finished' },
	});
	checkLabel.textContent = t('reading.endMarkFinished');

	// Footer
	const footer = modal.createDiv({ cls: 'dashboard-reading-end-footer' });

	footer
		.createEl('button', {
			cls: 'dashboard-reading-end-btn dashboard-reading-end-btn--cancel',
			text: t('reading.endCancel'),
		})
		.addEventListener('click', close);

	footer
		.createEl('button', {
			cls: 'dashboard-reading-end-btn dashboard-reading-end-btn--discard',
			text: t('reading.endDiscard'),
		})
		.addEventListener('click', () => {
			service.discardSession();
			close();
			onDone();
		});

	footer
		.createEl('button', {
			cls: 'dashboard-reading-end-btn dashboard-reading-end-btn--confirm',
			text: t('reading.endConfirm'),
		})
		.addEventListener('click', () => {
			void (async () => {
				const endInput = inputsContainer.querySelector<HTMLInputElement>(
					'.dashboard-reading-end-page-input:not(.dashboard-reading-end-page-input--total)',
				);
				const totalInput = inputsContainer.querySelector<HTMLInputElement>(
					'.dashboard-reading-end-page-input--total',
				);
				const endVal = parseInt(endInput?.value || '0') || 0;
				const finished = checkbox.checked;

				let endPage: number;
				let totalPages = book.totalPages;

				if (progressMode === 'pct') {
					if (totalPages > 0) {
						endPage = Math.round((Math.min(endVal, 100) / 100) * totalPages);
					} else {
						endPage = Math.min(endVal, 100);
						totalPages = 100;
					}
				} else {
					endPage = endVal;
					if (totalInput) {
						totalPages = parseInt(totalInput.value) || 0;
					}
				}

				await service.finishSession(endPage, totalPages, finished);
				close();
				onDone();
			})();
		});
}
