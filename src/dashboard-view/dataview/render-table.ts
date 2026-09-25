import { App, TFile, setIcon } from 'obsidian';
import type { DataviewConfig, TrackerDataPoint } from '../types';
import type { QueryResult, ResultRow } from '../dql/types';
import { t } from '../../shared/i18n';
import { toggleTaskInFile } from '../calendar/alltasks-scan';
import { invalidatePath } from '../dql/page-builder';
import { coerceNumber, formatValue, kindOf } from '../dql/values';
import {
	TableLayout,
	ViewState,
	displayColumns,
	dvOpener,
	nextSortState,
	renderEmptyState,
	sourceInfoOf,
	tableLayout,
} from './render-dataview-section';
import {
	appRef,
	attachRowOpen,
	renderDataviewYearGrid,
	renderDvInline,
	renderValueCell,
	ymdKey,
} from './set-dataview-app';

export function renderTable(
	container: HTMLElement,
	result: QueryResult,
	rows: readonly ResultRow[],
	view?: ViewState,
	config?: DataviewConfig,
	onSortChange?: (next: ViewState) => void,
	rowOffset = 0,
	rerender?: () => void,
): void {
	const table = container.createEl('table', { cls: 'dashboard-library-table dashboard-dataview-table' });
	if (config?.striped) table.addClass('is-striped');
	if (config?.density === 'compact') table.addClass('is-compact');
	const showRowNumbers = config?.rowNumbers === true;
	const layout = tableLayout(result, config, showRowNumbers);
	const dc = displayColumns(result);
	const valueStart = dc.hasImplicitFileCol ? 1 : 0;

	/* ----- fixed column widths (colgroup must precede thead) ----- */
	const colgroup = table.createEl('colgroup');
	for (const w of layout.colWidths) {
		const col = colgroup.createEl('col');
		if (w) col.style.width = w;
	}

	/* ----- header ----- */
	const thead = table.createEl('thead');
	const headRow = thead.createEl('tr');
	const sortCol = view?.sortCol ?? null;
	const sortDir = view?.sortDir ?? 'asc';
	const activeHeaderIdx = sortCol === null ? -1 : layout.sortValueIdx.indexOf(sortCol);
	for (let ci = 0; ci < layout.labels.length; ci++) {
		const th = headRow.createEl('th', { text: layout.labels[ci]! });
		const sortSlot = layout.sortableIdx.indexOf(ci);
		if (sortSlot === -1) {
			th.addClass('is-source-col');
			if (layout.checkboxCol && layout.labels[ci] === '') th.addClass('dashboard-dataview-check-head');
			if (layout.showSource && ci === layout.labels.length - 1) th.addClass('is-datetime');
			continue;
		}
		th.addClass('is-sortable');
		const active = ci === activeHeaderIdx;
		if (active) th.addClass(sortDir === 'desc' ? 'is-sorted-desc' : 'is-sorted-asc');
		const indicator = th.createSpan({ cls: 'dashboard-dataview-sort-ind' });
		setIcon(indicator, active ? (sortDir === 'desc' ? 'chevron-down' : 'chevron-up') : 'chevrons-up-down');
		const valueIdx = layout.sortValueIdx[sortSlot]!;
		th.addEventListener('click', () => {
			if (!onSortChange || !view) return;
			onSortChange(nextSortState({ ...view }, valueIdx));
		});
		th.title = active
			? sortDir === 'asc'
				? t('dataview.sortDesc')
				: t('dataview.sortClear')
			: t('dataview.sortAsc');
	}

	/* ----- body: cells rendered strictly in header order ----- */
	const tbody = table.createEl('tbody');
	for (let ri = 0; ri < rows.length; ri++) {
		const row = rows[ri]!;
		const tr = tbody.createEl('tr');
		attachRowOpen(tr, row);
		if (showRowNumbers) {
			tr.createEl('td', { cls: 'dashboard-dataview-rownum', text: String(rowOffset + ri + 1) });
		}
		if (result.grouped) {
			renderGroupedRow(tr, row, result, layout);
			continue;
		}

		const src = sourceInfoOf(row);
		if (layout.checkboxCol) {
			const td = tr.createEl('td', { cls: 'dashboard-dataview-check-col' });
			if (row.task) {
				renderTaskCell(td, row.task, appRef, () => rerender?.());
			}
		}
		for (let vi = valueStart; vi < row.values.length; vi++) {
			const value = row.values[vi]!;
			const td = tr.createEl('td');
			if (value !== null && value !== undefined && kindOf(value) === 'number') td.addClass('is-numeric');
			// Inner wrapper carries the 2-line clamp; td must stay table-cell
			// (changing its display breaks the fixed table column layout).
			renderValueCell(td.createDiv({ cls: 'dashboard-dataview-cell' }), value);
		}
		if (layout.noteFrom !== 'none') {
			const noteTd = tr.createEl('td', { cls: 'dashboard-dataview-src-note' });
			if (layout.noteFrom === 'values0') {
				renderValueCell(noteTd.createDiv({ cls: 'dashboard-dataview-cell' }), row.values[0] ?? null);
			} else {
				noteTd.setText(src?.title ?? '—');
			}
		}
		if (layout.showSource) {
			const pathTd = tr.createEl('td', { cls: 'dashboard-dataview-src-path', text: src?.path ?? '—' });
			pathTd.title = src?.path ?? '';
			tr.createEl('td', { cls: 'dashboard-dataview-src-created', text: src?.created ?? '—' });
		}
	}
	container.appendChild(table);
}
function renderTaskCell(td: HTMLElement, task: NonNullable<ResultRow['task']>, app: App, onToggled: () => void): void {
	const checkbox = td.createEl('input', { cls: 'dashboard-dataview-task-checkbox', attr: { type: 'checkbox' } });
	checkbox.checked = task.checked;
	if (task.line >= 0) {
		checkbox.addEventListener('change', () => {
			void (async (): Promise<void> => {
				const next = checkbox.checked;
				checkbox.disabled = true;
				const file = app.vault.getAbstractFileByPath(task.path);
				if (file instanceof TFile) {
					const wrote = await toggleTaskInFile(
						app,
						{ ...task, file, mtime: file.stat.mtime, ctime: file.stat.ctime },
						next,
					);
					if (wrote) invalidatePath(task.path);
				}
				checkbox.disabled = false;
				onToggled();
			})();
		});
	} else {
		checkbox.disabled = true; // no source line to toggle (synthetic row).
	}
}
function renderGroupedRow(tr: HTMLElement, row: ResultRow, result: QueryResult, layout: TableLayout): void {
	const keyCell = tr.createEl('td', { cls: 'dashboard-dataview-group-key' });
	renderValueCell(keyCell, row.groupKey ?? null);
	const memberCell = tr.createEl('td', { cls: 'dashboard-dataview-group-members-cell' });
	if (row.rows && row.rows.length > 0) {
		for (const member of row.rows) {
			const item = memberCell.createDiv({ cls: 'dashboard-dataview-group-member' });
			const linkValue = member.values[0] ?? null;
			renderValueCell(item, linkValue);
		}
	} else {
		// No nested rows pre-projected: fall back to the raw value columns.
		for (let i = 1; i < row.values.length; i++) {
			renderValueCell(memberCell, row.values[i]!);
		}
	}
	// Pad trailing cells so colspan alignment holds when sources are shown.
	for (let i = 2; i < layout.labels.length; i++) tr.createEl('td');
	void result;
}
export function renderList(
	container: HTMLElement,
	result: QueryResult,
	rows: readonly ResultRow[],
	config?: DataviewConfig,
	rerender?: () => void,
): void {
	const list = container.createDiv({ cls: 'dashboard-library-list dashboard-dataview-list' });
	if (config?.striped) list.addClass('is-striped');
	if (config?.density === 'compact') list.addClass('is-compact');
	const showSource = config?.showSource !== false;
	const dc = displayColumns(result);
	for (const row of rows) {
		const item = list.createDiv({ cls: 'dashboard-library-list-item dashboard-dataview-list-item' });
		attachRowOpen(item, row);

		if (result.grouped && row.groupKey !== undefined) {
			const group = item.createDiv({ cls: 'dashboard-dataview-list-group' });
			renderValueCell(group, row.groupKey);
			const members = item.createDiv({ cls: 'dashboard-dataview-list-members' });
			if (row.rows)
				for (const member of row.rows) {
					const m = members.createDiv({ cls: 'dashboard-dataview-list-member' });
					renderValueCell(m, member.values[0] ?? null);
				}
			continue;
		}

		const main = item.createDiv({ cls: 'dashboard-dataview-list-main' });
		if (result.queryType === 'TASK' && row.task) {
			main.addClass('dashboard-dataview-task-row');
			renderTaskCell(main, row.task, appRef, () => rerender?.());
			const label = main.createSpan({
				cls: 'dashboard-dataview-task-text' + (row.task.checked ? ' is-done' : ''),
			});
			renderDvInline(label, formatValue(row.values[0] ?? null));
		} else {
			// First projected value as the primary line. For a bare LIST (or
			// TABLE's implicit file column) values[0] IS the note link — render it
			// as the main line; otherwise start at the first projected value.
			const valueStart = dc.hasImplicitFileCol ? 1 : 0;
			renderValueCell(main, row.values[valueStart] ?? row.values[0] ?? null, true);
			// TABLE queries in list mode: append the remaining value columns,
			// separated by a muted dot.
			if (result.queryType === 'TABLE' || dc.hasImplicitFileCol) {
				for (let i = valueStart + 1; i < row.values.length; i++) {
					main.createSpan({ cls: 'dashboard-dataview-list-sep', text: '·' });
					renderValueCell(main, row.values[i]!, true);
				}
			}
		}
		if (showSource) {
			const src = sourceInfoOf(row);
			if (src) {
				item.createDiv({
					cls: 'dashboard-dataview-list-source',
					text: `${src.path} · ${src.created}`,
				});
			}
		}
	}
	container.appendChild(list);
}
export function renderFreeList(
	container: HTMLElement,
	result: QueryResult,
	rows: readonly ResultRow[],
	rerender?: () => void,
): void {
	const list = container.createEl('ul', { cls: 'dashboard-dataview-free-list' });
	const dc = displayColumns(result);

	const renderFreeItem = (host: HTMLElement, row: ResultRow): void => {
		const li = host.createEl('li', { cls: 'dashboard-dataview-free-item' });
		const main = li.createDiv({ cls: 'dashboard-dataview-free-main' });

		if (result.queryType === 'TASK' && row.task) {
			main.addClass('dashboard-dataview-task-row');
			renderTaskCell(main, row.task, appRef, () => rerender?.());
			const label = main.createSpan({
				cls: 'dashboard-dataview-task-text' + (row.task.checked ? ' is-done' : ''),
			});
			renderDvInline(label, row.task.text);
			return;
		}

		// Bare LIST: values[0] IS the file link - the link alone is the bullet
		// line, remaining values follow after an en-dash. LIST with a projection:
		// Dataview renders `- [[Note]] - value`, so re-attach the source link
		// unless the query explicitly asked `WITHOUT ID`.
		if (result.queryType === 'TASK') {
			// Synthetic TASK row with no payload: plain text fallback.
			renderDvInline(main, formatValue(row.values[0] ?? null));
			return;
		}
		const bareList = dc.hasImplicitFileCol;
		const withoutId = result.withoutId === true;
		if (!bareList && !withoutId) {
			const src = sourceInfoOf(row);
			if (src) renderValueCell(main, { kind: 'link', path: src.path });
		}
		if (bareList) renderValueCell(main, row.values[0] ?? null, true);
		const from = bareList ? 1 : 0;
		for (let i = from; i < row.values.length; i++) {
			// Separator only between items (a leading dash before the very first
			// value would look like a stray bullet marker).
			if (main.childElementCount > 0) main.createSpan({ cls: 'dashboard-dataview-free-sep', text: '–' });
			renderValueCell(main, row.values[i]!, true);
		}
	};

	for (const row of rows) {
		if (result.grouped && row.groupKey !== undefined) {
			const li = list.createEl('li', { cls: 'dashboard-dataview-free-group' });
			const title = li.createDiv({ cls: 'dashboard-dataview-free-group-title' });
			renderValueCell(title, row.groupKey);
			const nested = li.createEl('ul', { cls: 'dashboard-dataview-free-list is-nested' });
			if (row.rows && row.rows.length > 0) {
				for (const member of row.rows) renderFreeItem(nested, member);
			} else {
				renderFreeItem(nested, row);
			}
			continue;
		}
		renderFreeItem(list, row);
	}
	container.appendChild(list);
}
export function renderCalendar(
	container: HTMLElement,
	result: QueryResult,
	rows: readonly ResultRow[],
	app: App,
): void {
	void app;
	const wrap = container.createDiv({ cls: 'dashboard-dataview-calendar' });

	// Resolve each row's date from its calendar field (default file.cday).
	const dated: Array<{ ts: number; row: ResultRow }> = [];
	for (const row of rows) {
		const ts = rowDateTs(row, result);
		if (ts !== null) dated.push({ ts, row });
	}
	if (dated.length === 0) {
		renderEmptyState(wrap, 'dataview.calendarNoDates');
		return;
	}

	// Default view = the month of the most-recent dated row.
	let cursor = monthStart(dated.reduce((a, b) => (a.ts > b.ts ? a : b)).ts);
	const byDay = new Map<string, ResultRow[]>();
	const reindex = (): void => {
		byDay.clear();
		for (const d of dated) {
			const key = dayKey(d.ts);
			const arr = byDay.get(key) ?? [];
			arr.push(d.row);
			byDay.set(key, arr);
		}
	};
	reindex();

	const grid = wrap.createDiv({ cls: 'dashboard-dataview-calendar-grid' });
	const draw = (): void => {
		grid.empty();
		const titleRow = grid.createDiv({ cls: 'dashboard-dataview-calendar-header' });
		const prev = titleRow.createEl('button', { cls: 'dashboard-dataview-calendar-nav' });
		setIcon(prev, 'chevron-left');
		prev.addEventListener('click', () => {
			cursor = shiftMonth(cursor, -1);
			draw();
		});
		titleRow.createDiv({ cls: 'dashboard-dataview-calendar-title', text: monthLabel(cursor) });
		const next = titleRow.createEl('button', { cls: 'dashboard-dataview-calendar-nav' });
		setIcon(next, 'chevron-right');
		next.addEventListener('click', () => {
			cursor = shiftMonth(cursor, 1);
			draw();
		});

		const weekdayRow = grid.createDiv({ cls: 'dashboard-dataview-calendar-weekdays' });
		for (const wd of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) {
			weekdayRow.createDiv({ cls: 'dashboard-dataview-calendar-wd', text: wd });
		}

		const cells = grid.createDiv({ cls: 'dashboard-dataview-calendar-cells' });
		const start = new Date(cursor);
		const lead = start.getDay(); // 0=Sun
		const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
		for (let i = 0; i < lead; i++) cells.createDiv({ cls: 'dashboard-dataview-calendar-cell is-blank' });
		for (let day = 1; day <= daysInMonth; day++) {
			const ts = new Date(start.getFullYear(), start.getMonth(), day).getTime();
			const dayRows = byDay.get(dayKey(ts)) ?? [];
			const cell = cells.createDiv({
				cls: 'dashboard-dataview-calendar-cell' + (dayRows.length ? ' has-dots' : ''),
			});
			cell.createDiv({ cls: 'dashboard-dataview-calendar-day', text: String(day) });
			if (dayRows.length) {
				const dots = cell.createDiv({ cls: 'dashboard-dataview-calendar-dots' });
				for (let d = 0; d < Math.min(dayRows.length, 3); d++) {
					dots.createDiv({ cls: 'dashboard-dataview-calendar-dot' });
				}
				if (dayRows.length > 3)
					dots.createDiv({ cls: 'dashboard-dataview-calendar-more', text: '+' + (dayRows.length - 3) });
				// Click opens the first matching note.
				const first = dayRows[0]!;
				cell.addEventListener('click', () => {
					if (first.page?.file && dvOpener) dvOpener(first.page.file);
				});
			}
		}
	};
	draw();
	container.appendChild(wrap);
}
function rowDateTs(row: ResultRow, result: QueryResult): number | null {
	if (result.calendarField && row.values.length > 1) {
		const v = row.values[1];
		if (v && kindOf(v) === 'date') return (v as { ts: number }).ts;
		return null;
	}
	const page = row.page;
	if (!page) return null;
	for (const key of ['file.day', 'file.cday', 'file.ctime']) {
		const v = page.fields[key];
		if (v && kindOf(v) === 'date') return (v as { ts: number }).ts;
	}
	return null;
}
function monthStart(ts: number): number {
	const d = new Date(ts);
	return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function shiftMonth(ts: number, delta: number): number {
	const d = new Date(ts);
	return new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
}
function dayKey(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function monthLabel(ts: number): string {
	const d = new Date(ts);
	const names = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	];
	return `${names[d.getMonth()]} ${d.getFullYear()}`;
}
export function renderHeatmap(container: HTMLElement, rows: readonly ResultRow[]): void {
	const totals = new Map<string, number>();
	for (const row of rows) {
		const value = coerceNumber(row.values[0] ?? null);
		const dateValue = row.values[1] ?? null;
		if (value === null || !dateValue || kindOf(dateValue) !== 'date') continue;
		const date = ymdKey((dateValue as { ts: number }).ts);
		totals.set(date, (totals.get(date) ?? 0) + value);
	}
	if (totals.size === 0) {
		renderEmptyState(container, 'dataview.heatmapNoData');
		return;
	}

	const dates = [...totals.keys()].sort();
	const latestYear = Number(dates[dates.length - 1]!.slice(0, 4));
	const year = Number.isFinite(latestYear) ? latestYear : new Date().getFullYear();
	const data = fillYearHeatmapData(totals, year);
	const validPoints = data.filter((p): p is TrackerDataPoint & { value: number } => p.value !== null);
	if (validPoints.length === 0) {
		renderEmptyState(container, 'dataview.heatmapNoData');
		return;
	}

	const values = validPoints.map((p) => p.value);
	const minVal = Math.min(...values);
	const maxVal = Math.max(...values);
	const valueRange = maxVal - minVal || 1;
	const accent = dvCssVar('--db-accent') || dvCssVar('--interactive-accent') || '#6366f1';
	const body = container.createDiv({ cls: 'dashboard-heatmap-section-body dashboard-dataview-heatmap-body' });
	renderDataviewYearGrid(body, buildDataviewWeekColumns(data), minVal, valueRange, accent);
}
function fillYearHeatmapData(totals: Map<string, number>, year: number): TrackerDataPoint[] {
	const points: TrackerDataPoint[] = [];
	const cursor = new Date(year, 0, 1);
	while (cursor.getFullYear() === year) {
		const date = ymdKey(cursor.getTime());
		points.push({ date, value: totals.get(date) ?? null });
		cursor.setDate(cursor.getDate() + 1);
	}
	return points;
}
function dvCssVar(name: string): string {
	const root = activeDocument.querySelector('.apex-dashboard-root');
	const el = root instanceof HTMLElement ? root : activeDocument.body;
	return getComputedStyle(el).getPropertyValue(name).trim();
}
function buildDataviewWeekColumns(data: TrackerDataPoint[]): Array<Array<TrackerDataPoint | null>> {
	const cols: Array<Array<TrackerDataPoint | null>> = [];
	if (data.length === 0) return cols;
	const first = new Date(data[0]!.date + 'T00:00:00');
	const firstDow = first.getDay();
	const mondayOffset = firstDow === 0 ? 6 : firstDow - 1;
	let col: Array<TrackerDataPoint | null> = [];
	for (let i = 0; i < mondayOffset; i++) col.push(null);
	for (const p of data) {
		col.push(p);
		if (col.length === 7) {
			cols.push(col);
			col = [];
		}
	}
	if (col.length > 0) cols.push(col);
	return cols;
}
