import { App, Platform, TFile } from 'obsidian';
import type { TrackerDataPoint } from '../types';
import type { DqlLink, DqlValue, ResultRow } from '../dql/types';
import { getLanguage, t } from '../../shared/i18n';
import { attachNoteHover } from '../ui/hover-preview';
import { formatValue, kindOf } from '../dql/values';
import {
	HEATMAP_CELL_GAP,
	HEATMAP_MAX_CELL,
	HEATMAP_MIN_CELL,
	dvHoverParent,
	dvOpener,
} from './render-dataview-section';

function chooseDataviewCellSize(containerWidth: number, weekCount: number): number {
	if (weekCount <= 0 || containerWidth <= 0) return HEATMAP_MIN_CELL;
	const available = containerWidth - (weekCount - 1) * HEATMAP_CELL_GAP;
	const ideal = Math.floor(available / weekCount);
	return Math.max(HEATMAP_MIN_CELL, Math.min(HEATMAP_MAX_CELL, ideal));
}
export function renderDataviewYearGrid(
	host: HTMLElement,
	weekCols: Array<Array<TrackerDataPoint | null>>,
	minVal: number,
	valueRange: number,
	accent: string,
): void {
	const wrap = host.createDiv({ cls: 'dashboard-heatmap-year' });
	const width = wrap.parentElement?.clientWidth ?? 800;
	const cell = chooseDataviewCellSize(width, weekCols.length);
	wrap.style.setProperty('--hm-cell', `${cell}px`);

	const monthRow = wrap.createDiv({ cls: 'dashboard-heatmap-months-top' });
	const grid = wrap.createDiv({ cls: 'dashboard-heatmap-grid' });

	const monthLabels = computeDataviewMonthLabels(weekCols);
	monthRow.style.gridTemplateColumns = `repeat(${weekCols.length}, ${cell}px)`;
	for (let i = 0; i < weekCols.length; i++) {
		const slot = monthRow.createDiv({ cls: 'dashboard-heatmap-month-label-top' });
		const label = monthLabels[i];
		if (label) slot.setText(label);
	}

	for (const col of weekCols) {
		for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
			const point = col[dayIdx] ?? null;
			const cellEl = grid.createDiv({ cls: 'dashboard-sidebar-heatmap-cell' });
			if (point === null || point.value === null) {
				cellEl.addClass('dashboard-sidebar-heatmap-cell--empty');
			} else {
				const intensity = valueRange > 0 ? (point.value - minVal) / valueRange : 1;
				const clamped = Math.max(0, Math.min(1, intensity));
				cellEl.style.backgroundColor = accent;
				cellEl.style.opacity = String(0.35 + clamped * 0.65);
				cellEl.style.filter = `brightness(${1 + clamped * 0.5}) saturate(1.4)`;
				cellEl.title = `${point.date}: ${point.value}`;
			}
		}
	}
}
function computeDataviewMonthLabels(weekCols: Array<Array<TrackerDataPoint | null>>): Array<string | null> {
	const labels: Array<string | null> = [];
	let lastMonth = '';
	const locale = getLanguage() === 'zh' ? 'zh-CN' : 'en-US';
	for (const col of weekCols) {
		const firstPoint = col.find((p): p is TrackerDataPoint => p !== null);
		const monthKey = firstPoint ? firstPoint.date.slice(0, 7) : '';
		if (monthKey && monthKey !== lastMonth) {
			const d = new Date(`${monthKey}-01T00:00:00`);
			labels.push(Number.isNaN(d.getTime()) ? monthKey : d.toLocaleDateString(locale, { month: 'short' }));
			lastMonth = monthKey;
		} else {
			labels.push(null);
		}
	}
	return labels;
}
export function ymdKey(ts: number): string {
	const d = new Date(ts);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}
export function renderValueCell(container: HTMLElement, value: DqlValue, asLink = false): void {
	if (value === null || value === undefined) {
		container.createSpan({ cls: 'dashboard-dataview-null', text: '—' });
		return;
	}
	if (kindOf(value) === 'link') {
		renderLinkValue(container, value as DqlLink);
		return;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) {
			container.createSpan({ cls: 'dashboard-dataview-null', text: '—' });
			return;
		}
		for (let i = 0; i < value.length; i++) {
			if (i > 0) container.append(', ');
			renderValueCell(container, value[i]!);
		}
		return;
	}
	const text = formatValue(value);
	// Strings render as inline markdown (links, emphasis, code, highlight) -
	// the same shape Dataview itself produces for field values.
	renderDvInline(container.createSpan({ cls: 'dashboard-dataview-text' }), text);
	void asLink;
}
const INLINE_TOKEN_RE =
	/(\[\[[^\]]+?\]\]|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*?\*|`[^`]+`|==[^=]+==|~~[^~]+~~)/g;
export function renderDvInline(container: HTMLElement, text: string): void {
	const parts = text.split(INLINE_TOKEN_RE);
	for (const part of parts) {
		if (!part) continue;
		if (part.startsWith('[[') && part.endsWith(']]')) {
			renderDvLink(container, part.slice(2, -2));
			continue;
		}
		if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
			renderDvInline(container.createEl('strong'), part.slice(2, -2));
			continue;
		}
		if (part.startsWith('__') && part.endsWith('__') && part.length > 4) {
			renderDvInline(container.createEl('strong'), part.slice(2, -2));
			continue;
		}
		if (part.startsWith('==') && part.endsWith('==') && part.length > 4) {
			renderDvInline(container.createEl('mark', { cls: 'dashboard-dataview-mark' }), part.slice(2, -2));
			continue;
		}
		if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
			renderDvInline(container.createEl('s'), part.slice(2, -2));
			continue;
		}
		if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
			renderDvInline(container.createEl('em'), part.slice(1, -1));
			continue;
		}
		if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
			container.createEl('code', { cls: 'dashboard-dataview-code', text: part.slice(1, -1) });
			continue;
		}
		const ext = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
		if (ext) {
			const a = container.createEl('a', { cls: 'dashboard-dataview-extlink', text: ext[1]! });
			a.href = ext[2]!;
			a.target = '_blank';
			a.rel = 'noopener';
			continue;
		}
		container.appendText(part);
	}
}
function renderLinkValue(container: HTMLElement, link: DqlLink): void {
	renderDvLink(container, `${link.path}${link.display ? `|${link.display}` : ''}`);
}
function renderDvLink(container: HTMLElement, content: string): void {
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
	const displayName = alias ?? (fragment ? `${noteName} > ${fragment}` : noteName);

	const file = resolveDvFile(path);
	const span = container.createSpan({ cls: 'dashboard-wikilink', text: displayName });
	if (file && dvHoverParent && !Platform.isMobile) {
		attachNoteHover(appRef, span, file, dvHoverParent, fragment ? `#${fragment}` : undefined);
	}
	span.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (file && dvOpener) dvOpener(file, fragment ? `#${fragment}` : undefined);
	});
}
export let appRef: App = null as never;
export function setDataviewApp(app: App): void {
	appRef = app;
}
function resolveDvFile(path: string): TFile | null {
	const cleaned = path.replace(/\.md$/i, '');
	// Direct path lookup first.
	const direct = appRef.vault.getAbstractFileByPath(path) ?? appRef.vault.getAbstractFileByPath(cleaned + '.md');
	if (direct instanceof TFile) return direct;
	// Fall back to a basename match across markdown files (O(n) but rare).
	const files = appRef.vault.getMarkdownFiles();
	for (const f of files) {
		if (f.basename.toLowerCase() === cleaned.split('/').pop()!.toLowerCase()) return f;
	}
	return null;
}
export function attachRowOpen(el: HTMLElement, row: ResultRow): void {
	const file = row.page?.file ?? null;
	if (!file) return;
	el.addClass('is-clickable');
	if (dvHoverParent && !Platform.isMobile) {
		attachNoteHover(appRef, el, file, dvHoverParent);
	}
	el.addEventListener('click', (e) => {
		const target = e.target as HTMLElement;
		// Don't hijack clicks on inner links/chips — let those resolve on their own.
		if (target.closest('a, .dashboard-wikilink, .dashboard-dataview-task-checkbox')) return;
		if (dvOpener) dvOpener(file);
	});
}
