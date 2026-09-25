import { App, Component, setIcon } from 'obsidian';
import type { HoverParent } from 'obsidian';
import type { DashboardData, DashboardColumn, RenderCallbacks, DashboardSettings } from '../types';
import { t } from '../../shared/i18n';
import { renderQuickNoteRegion } from '../notes/quick-note-section';
import { captureScrollStates, restoreScrollStates } from '../ui/scroll-preserve';
import { applyModalTheme } from '../appearance/modal-theme';
import { normalizeExcludeFolders, isUnderExcludedFolder } from '../../shared/exclude-folders';
import type { ReadingService } from '../reading/reading-service';
import { searchBooks, resolveCoverAsObjectUrl } from '../reading/book-service';
import { activeHoverParent, activeMarkdownComponent, activeNoteOpener } from './destroy-all-charts';
import { renderSection } from './refresh-media-sections';
import { formatReadingDuration } from './render-sidebar-countdown';
import { getSectionType } from './render-text-with-links';

export function openEditBookInfo(
	doc: Document,
	service: ReadingService,
	book: import('../reading/reading-service').BookInfo,
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

	const header = modal.createDiv({ cls: 'dashboard-reading-end-header' });
	header.createDiv({ cls: 'dashboard-reading-end-title', text: t('reading.editTitle') });
	const closeBtn = header.createDiv({ cls: 'dashboard-reading-end-close' });
	setIcon(closeBtn, 'x');
	closeBtn.addEventListener('click', close);

	const body = modal.createDiv({ cls: 'dashboard-reading-end-body' });

	body.createDiv({ cls: 'dashboard-reading-end-label', text: t('reading.editBookName') });
	const titleInput = body.createEl('input', {
		cls: 'dashboard-reading-end-input',
		attr: { type: 'text' },
	});
	titleInput.value = book.title;

	body.createDiv({ cls: 'dashboard-reading-end-label', text: t('reading.editAuthorName') });
	const authorInput = body.createEl('input', {
		cls: 'dashboard-reading-end-input',
		attr: { type: 'text' },
	});
	authorInput.value = book.author;

	body.createDiv({ cls: 'dashboard-reading-end-label', text: t('reading.editTotalPages') });
	const pagesInput = body.createEl('input', {
		cls: 'dashboard-reading-end-input',
		attr: { type: 'number', min: '0' },
	});
	pagesInput.value = String(book.totalPages || '');

	body.createDiv({ cls: 'dashboard-reading-end-label', text: t('reading.editCoverUrl') });
	const coverInput = body.createEl('input', {
		cls: 'dashboard-reading-end-input',
		attr: { type: 'text', placeholder: t('reading.editCoverPlaceholder') },
	});
	coverInput.value = book.coverUrl;

	const footer = modal.createDiv({ cls: 'dashboard-reading-end-footer' });
	const saveBtn = footer.createEl('button', {
		cls: 'dashboard-reading-end-btn dashboard-reading-end-btn--confirm',
		text: t('reading.editConfirm'),
	});
	footer
		.createEl('button', {
			cls: 'dashboard-reading-end-btn dashboard-reading-end-btn--cancel',
			text: t('reading.endCancel'),
		})
		.addEventListener('click', close);

	const deleteBtn = footer.createEl('button', {
		cls: 'dashboard-reading-end-btn dashboard-reading-end-btn--delete',
		text: t('reading.editDeleteBook'),
	});
	deleteBtn.addEventListener('click', () => {
		void (async () => {
			await service.removeActiveBook(book.title);
			close();
			onDone();
		})();
	});

	saveBtn.addEventListener('click', () => {
		void (async () => {
			const newTitle = titleInput.value.trim();
			if (!newTitle) return;

			await service.updateBookInfo(book.title, {
				title: newTitle,
				author: authorInput.value.trim(),
				coverUrl: coverInput.value.trim(),
				totalPages: parseInt(pagesInput.value) || 0,
			});
			close();
			onDone();
		})();
	});

	titleInput.focus();
}
export function openBookSearch(
	doc: Document,
	service: ReadingService,
	onSelect: (book: import('../reading/reading-service').BookInfo | null) => void,
): void {
	const overlay = doc.body.createDiv({ cls: 'dashboard-reading-book-overlay' });
	const modal = overlay.createDiv({ cls: 'dashboard-reading-book-modal' });
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

	const header = modal.createDiv({ cls: 'dashboard-reading-book-header' });
	header.createDiv({ cls: 'dashboard-reading-book-header-title', text: t('reading.selectBook') });
	const closeBtn = header.createDiv({ cls: 'dashboard-reading-book-close' });
	setIcon(closeBtn, 'x');
	closeBtn.addEventListener('click', close);

	const inputArea = modal.createDiv({ cls: 'dashboard-reading-book-input-area' });
	const input = inputArea.createEl('input', {
		cls: 'dashboard-reading-book-input',
		attr: { type: 'text', placeholder: t('reading.searchBook') },
	});
	input.focus();

	const resultsArea = modal.createDiv({ cls: 'dashboard-reading-book-results' });

	// Manual input row (always at bottom)
	const manualRow = resultsArea.createDiv({ cls: 'dashboard-reading-book-manual' });
	manualRow.createDiv({ cls: 'dashboard-reading-book-manual-label', text: t('reading.manualInput') });
	const manualInput = manualRow.createEl('input', {
		cls: 'dashboard-reading-book-manual-input',
		attr: { type: 'text', placeholder: t('reading.manualPlaceholder') },
	});
	const manualBtn = manualRow.createEl('button', {
		cls: 'dashboard-reading-book-manual-btn',
		text: 'OK',
	});
	manualBtn.addEventListener('click', () => {
		const val = manualInput.value.trim();
		if (val) {
			onSelect({
				title: val,
				author: '',
				coverUrl: '',
				isbn: '',
				source: 'manual',
				currentPage: 0,
				totalPages: 0,
				finished: false,
			});
			close();
		}
	});

	let searchTimer: number | null = null;
	let searching = false;

	input.addEventListener('input', () => {
		if (searchTimer) window.clearTimeout(searchTimer);
		const query = input.value.trim();

		// Remove previous search results (keep manual row)
		while (resultsArea.firstChild && resultsArea.firstChild !== manualRow) {
			resultsArea.removeChild(resultsArea.firstChild);
		}

		if (!query) return;

		const indicator = resultsArea.createDiv({
			cls: 'dashboard-reading-book-searching',
			text: t('reading.searching'),
		});
		resultsArea.insertBefore(indicator, manualRow);

		searchTimer = window.setTimeout(() => {
			void (async () => {
				if (searching) return;
				searching = true;

				let results: import('../reading/book-service').BookSearchResult[] = [];
				try {
					results = await searchBooks(query);
				} catch {
					results = [];
				}
				searching = false;

				// Remove previous results
				while (resultsArea.firstChild && resultsArea.firstChild !== manualRow) {
					resultsArea.removeChild(resultsArea.firstChild);
				}

				if (results.length === 0) {
					const noResult = resultsArea.createDiv({
						cls: 'dashboard-reading-book-no-results',
						text: t('reading.noResults'),
					});
					resultsArea.insertBefore(noResult, manualRow);
					return;
				}

				for (const book of results) {
					const item = resultsArea.createDiv({ cls: 'dashboard-reading-book-item' });
					if (book.coverUrl) {
						const c = item.createDiv({ cls: 'dashboard-reading-book-item-cover' });
						void resolveCoverAsObjectUrl(book.coverUrl, service.getApp()).then((url) => {
							if (url) c.style.backgroundImage = `url(${url})`;
						});
					} else {
						item.createDiv({ cls: 'dashboard-reading-book-item-nocover' });
					}
					const info = item.createDiv({ cls: 'dashboard-reading-book-item-info' });
					info.createDiv({ cls: 'dashboard-reading-book-item-title', text: book.title });
					if (book.author) {
						info.createDiv({ cls: 'dashboard-reading-book-item-author', text: book.author });
					}
					item.addEventListener('click', () => {
						onSelect({
							title: book.title,
							author: book.author,
							coverUrl: book.coverUrl,
							isbn: book.isbn,
							source: 'google',
							currentPage: 0,
							totalPages: 0,
							finished: false,
						});
						close();
					});
					resultsArea.insertBefore(item, manualRow);
				}
			})();
		}, 500);
	});
}
export function showReadingStats(doc: Document, service: ReadingService): void {
	const overlay = doc.body.createDiv({ cls: 'dashboard-pomodoro-stats-overlay' });
	const modal = overlay.createDiv({ cls: 'dashboard-pomodoro-stats-modal' });
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

	const header = modal.createDiv({ cls: 'dashboard-pomodoro-stats-header' });
	header.createDiv({ cls: 'dashboard-pomodoro-stats-header-title', text: t('reading.statsTitle') });
	const closeBtn = header.createDiv({ cls: 'dashboard-pomodoro-stats-close' });
	setIcon(closeBtn, 'x');
	closeBtn.addEventListener('click', close);

	const content = modal.createDiv({ cls: 'dashboard-reading-stats-content' });

	function renderContent(): void {
		content.empty();

		// Summary card
		const summaryCard = content.createDiv({ cls: 'dashboard-reading-stats-card' });
		const summaryGrid = summaryCard.createDiv({ cls: 'dashboard-reading-stats-summary' });
		const totalItem = summaryGrid.createDiv({ cls: 'dashboard-reading-stats-summary-item' });
		totalItem.createDiv({
			cls: 'dashboard-reading-stats-summary-value',
			text: formatReadingDuration(service.getTotalSeconds()),
		});
		totalItem.createDiv({ cls: 'dashboard-reading-stats-summary-label', text: t('reading.totalReading') });
		const todayItem = summaryGrid.createDiv({ cls: 'dashboard-reading-stats-summary-item' });
		todayItem.createDiv({
			cls: 'dashboard-reading-stats-summary-value',
			text: formatReadingDuration(service.getTodaySeconds()),
		});
		todayItem.createDiv({ cls: 'dashboard-reading-stats-summary-label', text: t('reading.todayReading') });
		const bookItem = summaryGrid.createDiv({ cls: 'dashboard-reading-stats-summary-item' });
		bookItem.createDiv({
			cls: 'dashboard-reading-stats-summary-value',
			text: String(service.getBookCountInRange(365)),
		});
		bookItem.createDiv({ cls: 'dashboard-reading-stats-summary-label', text: t('reading.bookCount') });
		const streakItem = summaryGrid.createDiv({ cls: 'dashboard-reading-stats-summary-item' });
		streakItem.createDiv({ cls: 'dashboard-reading-stats-summary-value', text: String(service.getStreak()) });
		streakItem.createDiv({ cls: 'dashboard-reading-stats-summary-label', text: t('reading.streakDays') });

		// Book list card
		const bookCard = content.createDiv({ cls: 'dashboard-reading-stats-card' });
		bookCard.createDiv({ cls: 'dashboard-reading-stats-card-title', text: t('reading.bookList') });
		const rangeToggle = bookCard.createDiv({ cls: 'dashboard-reading-stats-range' });
		const ranges: { key: string; label: string; days: number }[] = [
			{ key: 'week', label: t('reading.rangeWeek'), days: 7 },
			{ key: 'month', label: t('reading.rangeMonth'), days: 30 },
			{ key: 'year', label: t('reading.rangeYear'), days: 365 },
		];
		let activeRange = 'month';
		const toggleButtons = ranges.map((r) =>
			rangeToggle.createDiv({
				cls:
					'dashboard-reading-stats-range-btn' +
					(r.key === activeRange ? ' dashboard-reading-stats-range-btn--active' : ''),
				text: r.label,
			}),
		);
		const bookListContainer = bookCard.createDiv({ cls: 'dashboard-reading-book-list' });

		function renderBookList(rangeKey: string): void {
			bookListContainer.empty();
			const rangeInfo = ranges.find((r) => r.key === rangeKey);
			if (!rangeInfo) return;
			const books = service.getBookBreakdownInRange(rangeInfo.days);
			if (books.length === 0) {
				bookListContainer.createDiv({ cls: 'dashboard-reading-stats-empty', text: t('reading.noRecords') });
				return;
			}
			for (const book of books) {
				const row = bookListContainer.createDiv({ cls: 'dashboard-reading-book-list-row' });
				if (book.coverUrl) {
					const c = row.createDiv({ cls: 'dashboard-reading-book-list-cover' });
					void resolveCoverAsObjectUrl(book.coverUrl, service.getApp()).then((url) => {
						if (url) c.style.backgroundImage = `url(${url})`;
					});
				} else {
					row.createDiv({ cls: 'dashboard-reading-book-list-nocover' });
				}
				const info = row.createDiv({ cls: 'dashboard-reading-book-list-info' });
				info.createDiv({ cls: 'dashboard-reading-book-list-title', text: book.title });
				if (book.author) info.createDiv({ cls: 'dashboard-reading-book-list-author', text: book.author });
				const meta = row.createDiv({ cls: 'dashboard-reading-book-list-meta' });
				meta.createDiv({
					cls: 'dashboard-reading-book-list-duration',
					text: formatReadingDuration(book.totalSeconds),
				});
				meta.createDiv({
					cls: 'dashboard-reading-book-list-sessions',
					text: t('reading.times', { count: book.sessions }),
				});
				const del = meta.createDiv({ cls: 'dashboard-reading-stats-record-del' });
				setIcon(del, 'trash-2');
				del.addEventListener('click', (e) => {
					e.stopPropagation();
					void (async () => {
						await service.deleteBookRecords(book.title);
						renderBookList(rangeKey);
					})();
				});
			}
		}
		toggleButtons.forEach((btn, i) => {
			btn.addEventListener('click', () => {
				activeRange = ranges[i]!.key;
				toggleButtons.forEach((b, j) => b.toggleClass('dashboard-reading-stats-range-btn--active', j === i));
				renderBookList(activeRange);
			});
		});
		renderBookList(activeRange);

		// Recent records card
		const recentRecords = service.getRecentRecords(10);
		if (recentRecords.length > 0) {
			const recentCard = content.createDiv({ cls: 'dashboard-reading-stats-card' });
			recentCard.createDiv({ cls: 'dashboard-reading-stats-card-title', text: t('reading.recentRecords') });
			for (const rec of recentRecords) {
				const row = recentCard.createDiv({ cls: 'dashboard-reading-stats-record' });
				const ts = new Date(rec.timestamp);
				const dateText = `${ts.getMonth() + 1}/${ts.getDate()} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;
				row.createDiv({ cls: 'dashboard-reading-stats-record-date', text: dateText });
				row.createDiv({ cls: 'dashboard-reading-stats-record-book', text: rec.bookTitle });
				row.createDiv({
					cls: 'dashboard-reading-stats-record-dur',
					text: formatReadingDuration(rec.durationSeconds),
				});
				const del = row.createDiv({ cls: 'dashboard-reading-stats-record-del' });
				setIcon(del, 'trash-2');
				del.addEventListener('click', (e) => {
					e.stopPropagation();
					void (async () => {
						await service.deleteRecord(rec.timestamp);
						renderContent();
					})();
				});
			}
		}
	}

	renderContent();
}
export function renderDashboard(
	container: HTMLElement,
	data: DashboardData,
	callbacks: RenderCallbacks,
	app: App,
	settings?: DashboardSettings,
	hoverParent: HoverParent | null = null,
	opts?: { skipQuickNotes?: boolean },
): void {
	activeHoverParent.current = hoverParent;
	activeNoteOpener.current = callbacks.onOpenNoteInPopover ?? null;
	// The dashboard view doubles as the markdown Component (ItemView extends
	// Component); other hover-parent callers fall back to plain memo lines.
	activeMarkdownComponent.current = hoverParent instanceof Component ? hoverParent : null;

	container.empty();
	container.addClass('dashboard-kanban');

	// Quick Notes region: pinned at the top, above all sections (non-reorderable).
	// Stacked layout hoists it out of the kanban entirely — the view renders it
	// above the widget strip instead (skipQuickNotes), because the kanban sits
	// below the strip there and the bar must stay directly under the banner.
	if (settings?.quickNotesEnabled && !opts?.skipQuickNotes) {
		renderQuickNoteRegion(container, settings, callbacks);
	}

	for (const column of data.columns) {
		const section = renderSection(column, callbacks, app, data, settings);
		container.appendChild(section);
	}

	const addColBtn = container.createDiv({ cls: 'dashboard-add-section' });
	addColBtn.setText(t('renderer.addSection'));
	addColBtn.setAttribute('role', 'button');
	addColBtn.addEventListener('click', () => {
		callbacks.onRequestAddSection();
	});
}
const SCANNING_SECTION_TYPES = new Set(['library', 'folder']);
export const MEDIA_SECTION_TYPES = new Set(['images', 'videos']);
const scanningSectionSignatures = new Map<string, string>();
export function invalidateScanningSectionSignatures(): void {
	scanningSectionSignatures.clear();
}
function scanningSectionSignature(column: DashboardColumn, app: App): string {
	const cfg = column.libraryConfig;
	const folders = (cfg?.folders ?? []).map((f) => f.trim().replace(/^\/+|\/+$/g, '')).filter((f) => f.length > 0);
	const excluded = normalizeExcludeFolders(cfg?.excludeFolders ?? []);
	const parts: string[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (folders.length > 0) {
			const lp = file.path.toLowerCase();
			if (!folders.some((f) => lp.startsWith(f.toLowerCase() + '/'))) continue;
		}
		if (isUnderExcludedFolder(file.path, excluded)) continue;
		parts.push(`${file.path}|${file.stat.mtime}|${file.stat.ctime}`);
	}
	// Vault iteration order is not contractual; sort for a stable signature.
	parts.sort();
	return JSON.stringify([column.name, cfg ?? null, parts]);
}
export function refreshScanningSections(
	kanban: HTMLElement,
	data: DashboardData,
	callbacks: RenderCallbacks,
	app: App,
	settings: DashboardSettings | undefined,
	hoverParent: HoverParent | null,
	shouldRefresh?: (column: DashboardColumn) => boolean,
	signatureScope?: string,
): number {
	activeHoverParent.current = hoverParent;
	let refreshed = 0;
	for (const column of data.columns) {
		if (!SCANNING_SECTION_TYPES.has(getSectionType(column))) continue;
		if (shouldRefresh && !shouldRefresh(column)) continue;
		const oldEl = kanban.querySelector(`:scope > [data-column="${CSS.escape(column.name)}"]`);
		if (!oldEl) continue;
		// Skip the swap when the section's render inputs are unchanged since the
		// last one (out-of-scope edit, write inside an excluded folder, non-md
		// churn under a scan folder): rebuilding would flash identical content.
		const key = `${signatureScope ?? ''}|${data.columns.indexOf(column)}:${column.name}`;
		const signature = scanningSectionSignature(column, app);
		if (scanningSectionSignatures.get(key) === signature) continue;
		scanningSectionSignatures.set(key, signature);
		const newEl = renderSection(column, callbacks, app, data, settings);
		// Carry the old row's scroll positions over the swap (file lists,
		// library kanban) so a vault-event refresh doesn't yank the viewport.
		const scrollStates = captureScrollStates(oldEl);
		oldEl.replaceWith(newEl);
		restoreScrollStates(newEl, scrollStates);
		refreshed++;
	}
	return refreshed;
}
