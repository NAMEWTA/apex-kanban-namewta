import { App, Platform, TFile, setIcon } from 'obsidian';
import type { HoverParent } from 'obsidian';
import type { DashboardColumn, DataviewConfig } from '../types';
import type { QueryResult, ResultRow } from '../dql/types';
import { t } from '../../shared/i18n';
import { buildPages } from '../dql/page-builder';
import { executeDql } from '../dql';
import { dqlCompare, formatDate, formatValue, kindOf } from '../dql/values';
import { normalizeExcludeFolders, isUnderExcludedFolder } from '../../shared/exclude-folders';
import { renderCalendar, renderFreeList, renderHeatmap, renderList, renderTable } from './render-table';

// Module-level singletons mirroring library-section.ts:13-14 — set once per
// render so the inner renderers can route opens + hover previews without
// threading callbacks through every signature.
export let dvHoverParent: HoverParent | null = null;
export let dvOpener: ((file: TFile, subpath?: string) => void) | null = null;
const MAX_ROWS = 500;
const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export const HEATMAP_CELL_GAP = 3;
export const HEATMAP_MIN_CELL = 10;
export const HEATMAP_MAX_CELL = 20;
export function renderDataviewSection(
	el: HTMLElement,
	column: DashboardColumn,
	app: App,
	hoverParent: HoverParent | null,
	onOpenNote: ((file: TFile, subpath?: string) => void) | null,
	reloadRegister: (fn: () => void) => void,
	onConfigChange: ((config: DataviewConfig) => void) | null = null,
): void {
	dvHoverParent = hoverParent;
	dvOpener = onOpenNote;

	const config = column.dataviewConfig ?? { query: '' };
	const content = el.createDiv({ cls: 'dashboard-dataview-content' });
	let hasRun = false;

	const render = async (): Promise<void> => {
		content.empty();
		hasRun = true;

		if (config.query.trim().length === 0) {
			renderEmptyState(content, 'dataview.emptyQuery', true);
			return;
		}

		// Scanning placeholder: replaced (not appended to) once the query finishes.
		renderScanningState(content);

		try {
			const pages = await buildPages(app);
			// Excluded folders: drop their pages before the query runs, so FROM /
			// WHERE / GROUP BY never see them.
			const excluded = normalizeExcludeFolders(config.excludeFolders ?? []);
			const visiblePages =
				excluded.length > 0 ? pages.filter((p) => !isUnderExcludedFolder(p.file.path, excluded)) : pages;
			const outcome = executeDql(config.query, visiblePages);
			// Drop the spinner before rendering the outcome — every render* below
			// appends into `content`, so without this reset it would spin forever.
			content.empty();
			if (!outcome.ok) {
				renderErrorState(content, outcome.error.message);
				return;
			}
			if (outcome.empty) {
				renderEmptyState(content, 'dataview.emptyQuery', true);
				return;
			}
			renderResult(
				content,
				outcome.result,
				app,
				() => {
					void render();
				},
				config,
				onConfigChange,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			content.empty();
			renderErrorState(content, message);
		}
	};

	reloadRegister(() => {
		void render();
	});
	if (Platform.isMobile) {
		renderEmptyState(content, 'dataview.mobileManualRun', 'dataview.mobileManualRunHint');
	} else if (!hasRun) {
		void render();
	}
}
export function renderEmptyState(container: HTMLElement, key: string, hint: boolean | string = false): void {
	const wrap = container.createDiv({ cls: 'dashboard-dataview-empty' });
	wrap.createDiv({ cls: 'dashboard-dataview-empty-icon' });
	wrap.createDiv({ cls: 'dashboard-dataview-empty-text', text: t(key) });
	if (hint) {
		wrap.createDiv({
			cls: 'dashboard-dataview-empty-hint',
			text: t(typeof hint === 'string' ? hint : 'dataview.configureHint'),
		});
	}
}
function renderScanningState(container: HTMLElement): void {
	const wrap = container.createDiv({ cls: 'dashboard-dataview-scanning' });
	const spinner = wrap.createDiv({ cls: 'dashboard-dataview-spinner' });
	setIcon(spinner, 'loader-circle');
	wrap.createSpan({ text: t('dataview.scanning') });
}
function renderErrorState(container: HTMLElement, message: string): void {
	const wrap = container.createDiv({ cls: 'dashboard-dataview-error' });
	const icon = wrap.createDiv({ cls: 'dashboard-dataview-error-icon' });
	setIcon(icon, 'alert-triangle');
	wrap.createDiv({ cls: 'dashboard-dataview-error-text', text: t('dataview.parseError', { message }) });
}
const PAGINATED_TYPES = new Set<QueryResult['queryType']>(['TABLE', 'LIST', 'TASK']);
export interface ViewState {
	filter: string;
	/** Column index + direction for TABLE header sort; null = query order. */
	sortCol: number | null;
	sortDir: 'asc' | 'desc';
}
interface DisplayColumns {
	/** Header labels for the value columns (projection, no source). */
	valueColumns: string[];
	/** True when the query has an implicit leading file-link column (TABLE
	 *  without WITHOUT ID) that should merge with the source "Note" column. */
	hasImplicitFileCol: boolean;
}
export function displayColumns(result: QueryResult): DisplayColumns {
	if (result.queryType === 'TABLE') {
		const valueColumns = result.columns.map((c) => c.alias);
		const hasImplicitFileCol = !valueColumns.includes('file') ? false : result.columns[0]?.alias === 'file';
		return { valueColumns, hasImplicitFileCol };
	}
	if (result.queryType === 'LIST') {
		// LIST with no projection: the evaluator's values[0] IS the file link,
		// so it doubles as the implicit note column. LIST with a projection:
		// values[0] is the projected value — label the value column with the
		// query's own alias/expression label (auto-adapts, like TABLE).
		const nonFile = result.columns.filter((c) => c.alias !== 'file');
		if (nonFile.length === 0) {
			return { valueColumns: ['file'], hasImplicitFileCol: true };
		}
		return { valueColumns: nonFile.map((c) => c.alias), hasImplicitFileCol: false };
	}
	// TASK: values[0] is the task text — the note column is always synthesized.
	return {
		valueColumns: [t('dataview.taskCol')],
		hasImplicitFileCol: false,
	};
}
interface SourceInfo {
	readonly title: string;
	readonly path: string;
	readonly created: string;
}
export function sourceInfoOf(row: ResultRow): SourceInfo | null {
	const page = row.page;
	if (!page) return null;
	const path = page.file.path;
	const title = page.file.basename;
	const createdField = page.fields['file.cday'] ?? page.fields['file.ctime'];
	const created =
		createdField && kindOf(createdField) === 'date'
			? formatDate(createdField as import('../dql/types').DqlDate)
			: '';
	return { title, path, created };
}
function rowSearchText(row: ResultRow): string {
	const parts = row.values.map((v) => formatValue(v));
	if (row.task) parts.push(row.task.text);
	const src = sourceInfoOf(row);
	if (src) parts.push(src.title, src.path, src.created);
	return parts.join(' ').toLowerCase();
}
function compareRowsForSort(a: ResultRow, b: ResultRow, col: number, dir: 'asc' | 'desc'): number {
	const va = a.values[col] ?? null;
	const vb = b.values[col] ?? null;
	const aNull = va === null || va === undefined;
	const bNull = vb === null || vb === undefined;
	if (aNull && bNull) return 0;
	if (aNull) return 1; // nulls last, both directions
	if (bNull) return -1;
	const cmp = dqlCompare(va, vb) ?? 0;
	return dir === 'asc' ? cmp : -cmp;
}
function renderResult(
	container: HTMLElement,
	result: QueryResult,
	app: App,
	rerender: () => void,
	config: DataviewConfig,
	onConfigChange: ((config: DataviewConfig) => void) | null,
): void {
	if (result.rows.length === 0) {
		renderEmptyState(container, 'dataview.empty');
		return;
	}
	const capped = result.rows.slice(0, MAX_ROWS);

	if (!PAGINATED_TYPES.has(result.queryType)) {
		const header = container.createDiv({ cls: 'dashboard-dataview-count' });
		header.createSpan({ text: t('dataview.resultCount', { count: result.rows.length }) });
		if (result.rows.length > MAX_ROWS) {
			header.createSpan({ cls: 'dashboard-dataview-capped', text: t('dataview.capped', { count: MAX_ROWS }) });
		}
		const body = container.createDiv({ cls: 'dashboard-dataview-body' });
		renderResultBody(body, result, capped, app, rerender);
		return;
	}

	/* ----- view state + the row pipeline: filter → sort → paginate ----- */
	const view: ViewState = { filter: '', sortCol: null, sortDir: 'asc' };
	const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
	let currentPage = 1;

	const applyPipeline = (): ResultRow[] => {
		let rows = capped;
		const needle = view.filter.trim().toLowerCase();
		if (needle.length > 0) rows = rows.filter((r) => rowSearchText(r).includes(needle));
		if (view.sortCol !== null) {
			const col = view.sortCol;
			const dir = view.sortDir;
			rows = [...rows].sort((a, b) => compareRowsForSort(a, b, col, dir));
		}
		return rows;
	};

	/* ----- toolbar: filter | count | spacer | page-size | view toggle ----- */
	const toolbar = container.createDiv({ cls: 'dashboard-dataview-toolbar' });

	const searchInput = toolbar.createEl('input', {
		cls: 'dashboard-dataview-search',
		attr: { type: 'text', placeholder: t('dataview.filterPlaceholder'), spellcheck: 'false' },
	});
	searchInput.addEventListener('input', () => {
		view.filter = searchInput.value;
		currentPage = 1;
		drawPage();
	});

	const countEl = toolbar.createSpan({ cls: 'dashboard-dataview-count' });
	toolbar.createDiv({ cls: 'dashboard-dataview-toolbar-spacer' });

	const pageSizeSelect = toolbar.createEl('select', { cls: 'dashboard-library-page-size' });
	for (const size of PAGE_SIZE_OPTIONS) {
		const opt = pageSizeSelect.createEl('option', {
			text: t('dataview.pageSize', { count: size }),
			attr: { value: String(size) },
		});
		if (size === pageSize) opt.selected = true;
	}
	pageSizeSelect.addEventListener('change', () => {
		const newSize = parseInt(pageSizeSelect.value) || DEFAULT_PAGE_SIZE;
		if (onConfigChange) onConfigChange({ ...config, pageSize: newSize });
		// Optimistic: redraw with the new size immediately (the persisted config
		// catches up via refreshSectionInPlace without losing this state's query).
		currentPage = 1;
		drawPage(newSize);
	});

	// View-mode toggle: table / list / auto presentation (persisted preference).
	// Mirrors the library section's segmented view toggle. `config` is treated
	// read-only; the current mode is held in a local override merged on draw.
	const currentViewMode = config.viewMode ?? 'auto';
	let viewModeOverride: 'table' | 'list' | 'auto' | null = null;
	const effectiveConfig = (): DataviewConfig =>
		viewModeOverride ? { ...config, viewMode: viewModeOverride } : config;
	const viewToggle = toolbar.createDiv({ cls: 'dashboard-library-view-toggle dashboard-dataview-view-toggle' });
	const setViewMode = (mode: 'table' | 'list' | 'auto'): void => {
		viewModeOverride = mode;
		if (onConfigChange) onConfigChange({ ...config, viewMode: mode });
		viewToggle.querySelectorAll('.dashboard-library-view-btn').forEach((b) => b.removeClass('active'));
		const activeBtn = viewToggle.querySelector(`[data-view="${mode}"]`);
		activeBtn?.addClass('active');
		currentPage = 1;
		drawPage();
	};
	const VIEW_MODE_ICONS: Record<'table' | 'list' | 'auto', string> = {
		table: 'table',
		list: 'list',
		auto: 'sparkles',
	};
	for (const mode of ['table', 'list', 'auto'] as const) {
		const btn = viewToggle.createDiv({
			cls: 'dashboard-library-view-btn' + (mode === currentViewMode ? ' active' : ''),
		});
		btn.dataset.view = mode;
		setIcon(btn, VIEW_MODE_ICONS[mode]);
		btn.title =
			mode === 'table'
				? t('dataview.viewTable')
				: mode === 'list'
					? t('dataview.viewList')
					: t('dataview.viewAuto');
		btn.addEventListener('click', () => setViewMode(mode));
	}

	/* ----- layout: scrolling body + footer pagination ----- */
	const paginated = container.createDiv({ cls: 'dashboard-dataview-pages' });
	const body = paginated.createDiv({ cls: 'dashboard-dataview-body' });

	const drawPage = (pageSz: number = pageSize): void => {
		const rows = applyPipeline();
		const totalPages = Math.max(1, Math.ceil(rows.length / pageSz));
		if (currentPage > totalPages) currentPage = totalPages;

		countEl.empty();
		if (view.filter.trim().length > 0) {
			countEl.createSpan({ text: t('dataview.filteredCount', { shown: rows.length, total: capped.length }) });
		} else {
			countEl.createSpan({ text: t('dataview.resultCount', { count: capped.length }) });
			if (result.rows.length > MAX_ROWS) {
				countEl.createSpan({
					cls: 'dashboard-dataview-capped',
					text: t('dataview.capped', { count: MAX_ROWS }),
				});
			}
		}

		body.empty();
		const start = (currentPage - 1) * pageSz;
		const pageRows = rows.slice(start, start + pageSz);
		if (pageRows.length === 0) {
			renderEmptyState(body, 'dataview.noMatch');
		} else {
			renderResultBody(
				body,
				result,
				pageRows,
				app,
				rerender,
				view,
				effectiveConfig(),
				(nextView) => {
					view.sortCol = nextView.sortCol;
					view.sortDir = nextView.sortDir;
					currentPage = 1;
					drawPage();
				},
				start,
			);
		}

		paginated.querySelector('.dashboard-dataview-pagination')?.remove();
		const footer = paginated.createDiv({ cls: 'dashboard-dataview-pagination' });
		renderDvPagination(footer, currentPage, totalPages, (page) => {
			currentPage = page;
			drawPage();
		});
	};
	drawPage();
}
function renderResultBody(
	container: HTMLElement,
	result: QueryResult,
	rows: readonly ResultRow[],
	app: App,
	rerender: () => void,
	view?: ViewState,
	config?: DataviewConfig,
	onSortChange?: (next: ViewState) => void,
	rowOffset = 0,
): void {
	if (rows.length === 0) {
		renderEmptyState(container, 'dataview.empty');
		return;
	}
	switch (result.queryType) {
		case 'TABLE':
		case 'LIST':
		case 'TASK': {
			const mode = config?.viewMode ?? 'auto';
			if (mode === 'list') {
				renderList(container, result, rows, config, rerender);
			} else if (mode === 'auto' && result.queryType !== 'TABLE') {
				// Native LIST/TASK shape: bullet list with bold group headers.
				renderFreeList(container, result, rows, rerender);
			} else if (mode === 'auto') {
				// Native TABLE look: keep the sortable header, drop the database
				// furniture (source columns) - the query's implicit file column
				// becomes the "File" column, exactly like Dataview's own tables.
				renderTable(
					container,
					result,
					rows,
					view,
					{ ...(config ?? { query: '' }), showSource: false },
					onSortChange,
					rowOffset,
					rerender,
				);
			} else {
				renderTable(container, result, rows, view, config, onSortChange, rowOffset, rerender);
			}
			break;
		}
		case 'CALENDAR':
			renderCalendar(container, result, rows, app);
			break;
		case 'HEATMAP':
			renderHeatmap(container, rows);
			break;
	}
}
function renderDvPagination(
	container: HTMLElement,
	currentPage: number,
	totalPages: number,
	onPageChange: (page: number) => void,
): void {
	if (totalPages <= 1) return;
	const nav = container.createDiv({ cls: 'dashboard-library-pagination-nav' });

	const prev = nav.createDiv({
		cls: 'dashboard-library-pagination-btn' + (currentPage <= 1 ? ' disabled' : ''),
		text: '<',
	});
	if (currentPage > 1) prev.addEventListener('click', () => onPageChange(currentPage - 1));

	const maxVisible = 5;
	let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
	const endPage = Math.min(totalPages, startPage + maxVisible - 1);
	startPage = Math.max(1, endPage - maxVisible + 1);

	if (startPage > 1) {
		const first = nav.createDiv({ cls: 'dashboard-library-pagination-page', text: '1' });
		first.addEventListener('click', () => onPageChange(1));
		if (startPage > 2) nav.createDiv({ cls: 'dashboard-library-pagination-ellipsis', text: '...' });
	}
	for (let i = startPage; i <= endPage; i++) {
		const page = nav.createDiv({
			cls: 'dashboard-library-pagination-page' + (i === currentPage ? ' active' : ''),
			text: String(i),
		});
		if (i !== currentPage) page.addEventListener('click', () => onPageChange(i));
	}
	if (endPage < totalPages) {
		if (endPage < totalPages - 1) nav.createDiv({ cls: 'dashboard-library-pagination-ellipsis', text: '...' });
		const last = nav.createDiv({ cls: 'dashboard-library-pagination-page', text: String(totalPages) });
		last.addEventListener('click', () => onPageChange(totalPages));
	}

	const next = nav.createDiv({
		cls: 'dashboard-library-pagination-btn' + (currentPage >= totalPages ? ' disabled' : ''),
		text: '>',
	});
	if (currentPage < totalPages) next.addEventListener('click', () => onPageChange(currentPage + 1));
}
export function nextSortState(current: ViewState, clickedCol: number): ViewState {
	if (current.sortCol !== clickedCol) return { ...current, sortCol: clickedCol, sortDir: 'asc' };
	if (current.sortDir === 'asc') return { ...current, sortDir: 'desc' };
	return { ...current, sortCol: null, sortDir: 'asc' };
}
export interface TableLayout {
	/** Header labels in render order (empty string = icon-only checkbox col). */
	readonly labels: string[];
	/** Header indices that are sortable, in order. */
	readonly sortableIdx: readonly number[];
	/** For each sortable header index, the row.values index it maps to. */
	readonly sortValueIdx: readonly number[];
	/** TASK queries: leading checkbox column. */
	readonly checkboxCol: boolean;
	/** Where the source "Note" cell content comes from. */
	readonly noteFrom: 'values0' | 'synth' | 'none';
	readonly showSource: boolean;
	/** Width hints per column, same length as `labels`. `undefined` = share the
	 *  remaining space; strings are CSS widths for <col>. Fixed table layout
	 *  keeps long content from squeezing other columns. */
	readonly colWidths: readonly (string | undefined)[];
}
export function tableLayout(
	result: QueryResult,
	config: DataviewConfig | undefined,
	showRowNumbers: boolean,
): TableLayout {
	const dc = displayColumns(result);
	const showSource = config?.showSource !== false;
	const isTask = result.queryType === 'TASK';
	const labels: string[] = [];
	const colWidths: (string | undefined)[] = [];
	const sortableIdx: number[] = [];
	const sortValueIdx: number[] = [];
	if (showRowNumbers) {
		labels.push('#');
		colWidths.push('34px');
	}
	if (isTask) {
		labels.push('');
		colWidths.push('30px');
	} // checkbox column

	const valueLabels = dc.hasImplicitFileCol ? dc.valueColumns.slice(1) : dc.valueColumns;
	let valueIdx = dc.hasImplicitFileCol ? 1 : 0;
	valueLabels.forEach((label, i) => {
		labels.push(label);
		// First value column (the task text / primary value) caps at 30% so it
		// cannot swallow the table; other value columns share the remainder.
		colWidths.push(i === 0 ? '30%' : undefined);
		sortableIdx.push(labels.length - 1);
		sortValueIdx.push(valueIdx++);
	});

	let noteFrom: TableLayout['noteFrom'] = 'none';
	if (showSource) {
		noteFrom = dc.hasImplicitFileCol ? 'values0' : 'synth';
		labels.push(t('dataview.colFile'));
		colWidths.push('22%');
		labels.push(t('dataview.colPath'));
		colWidths.push('28%');
		labels.push(t('dataview.colCreated'));
		colWidths.push('96px');
	} else if (dc.hasImplicitFileCol) {
		// Source hidden, but the query's own file column still deserves a spot.
		noteFrom = 'values0';
		labels.push(dc.valueColumns[0]!);
		colWidths.push(undefined);
	}
	return { labels, sortableIdx, sortValueIdx, checkboxCol: isTask, noteFrom, showSource, colWidths };
}
