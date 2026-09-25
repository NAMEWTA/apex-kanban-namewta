import { App, TFile } from 'obsidian';
import type { HoverParent } from 'obsidian';
import type { LibraryConfig, PropertyFilter } from '../types';
import { t, getLanguage } from '../../shared/i18n';
import { normalizeExcludeFolders, isUnderExcludedFolder } from '../../shared/exclude-folders';
import { applyModalTheme } from '../appearance/modal-theme';
import { renderLibrarySection } from './render-library-section';

// Set once per render by renderLibrarySection so the grid/list/table/kanban
// renderers can route opens through the note popover and attach hover previews
// without threading these through every function signature. Mirrors the
// renderer.ts module-level idiom.
export const libHoverParent = { current: null as HoverParent | null };
export const libOpener = { current: null as ((file: TFile) => void) | null };
export interface LibraryFileResult {
	file: TFile;
	basename: string;
	mtime: number;
	ctime: number;
	frontmatter: Record<string, unknown>;
	preview: string;
	tags: string[];
}
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export function extractFrontmatterProperties(app: App): Map<string, Set<string>> {
	const props = new Map<string, Set<string>>();
	props.set('tags', new Set());
	props.set('modified', new Set());
	props.set('created', new Set());
	props.set('path', new Set());

	for (const file of app.vault.getMarkdownFiles()) {
		if (file.path.startsWith('.')) continue;
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) continue;

		const fm = cache.frontmatter;
		for (const [key, value] of Object.entries(fm)) {
			if (key === 'position') continue;
			if (!props.has(key)) props.set(key, new Set());
			const set = props.get(key)!;
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item != null) set.add(String(item));
				}
			} else if (value != null) {
				set.add(String(value));
			}
		}

		// Tags from frontmatter and inline
		const tagsSet = props.get('tags')!;
		if (fm.tags) {
			if (Array.isArray(fm.tags)) {
				for (const tag of fm.tags) tagsSet.add(String(tag));
			} else {
				tagsSet.add(String(fm.tags));
			}
		}
		if (cache.tags) {
			for (const tag of cache.tags) tagsSet.add(tag.tag);
		}
	}

	return props;
}
export function getAllTags(app: App): string[] {
	return [...(extractFrontmatterProperties(app).get('tags') ?? [])].sort();
}
export function renderTagsSelector(
	container: HTMLElement,
	allTags: string[],
	selectedTags: string[],
	onToggle: (tag: string) => void,
): void {
	container.empty();
	if (allTags.length === 0) {
		container.createDiv({ cls: 'dashboard-library-filter-empty', text: t('library.noTags') });
		return;
	}
	for (const tag of allTags) {
		const chip = container.createDiv({
			cls: 'dashboard-library-filter-chip' + (selectedTags.includes(tag) ? ' active' : ''),
			text: tag,
		});
		chip.addEventListener('click', () => onToggle(tag));
	}
}
export function queryVaultFiles(app: App, config: LibraryConfig): LibraryFileResult[] {
	const files = app.vault.getMarkdownFiles();
	const results: LibraryFileResult[] = [];

	// Folder section: restrict to files under any configured folder (recursive, OR).
	const scanFolders = (config.folders ?? [])
		.map((f) => f.trim().replace(/^\/+|\/+$/g, ''))
		.filter((f) => f.length > 0);

	// Excluded folders: files inside them never reach the section (library scans
	// and folder sections alike).
	const excluded = normalizeExcludeFolders(config.excludeFolders ?? []);

	for (const file of files) {
		if (file.path.startsWith('.')) continue;
		if (isUnderExcludedFolder(file.path, excluded)) continue;

		if (scanFolders.length > 0) {
			const lp = file.path.toLowerCase();
			if (!scanFolders.some((f) => lp.startsWith(f.toLowerCase() + '/'))) continue;
		}

		const cache = app.metadataCache.getFileCache(file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

		// Apply filters (AND logic)
		let matches = true;
		for (const filter of config.filters) {
			if (!evaluateFilter(file, fm, filter, cache)) {
				matches = false;
				break;
			}
		}
		if (!matches) continue;

		const tags: string[] = [];
		if (cache?.tags) {
			for (const tag of cache.tags) tags.push(tag.tag);
		}

		results.push({
			file,
			basename: file.basename,
			mtime: file.stat.mtime,
			ctime: file.stat.ctime,
			frontmatter: fm,
			preview: '',
			tags,
		});
	}

	// Sort
	sortResults(results, config.sortBy, config.sortDesc);

	return results;
}
function evaluateFilter(
	file: TFile,
	fm: Record<string, unknown>,
	filter: PropertyFilter,
	cache: ReturnType<typeof import('obsidian').App.prototype.metadataCache.getFileCache>,
): boolean {
	if (filter.values.length === 0 && !filter.dateRange) return true;

	const prop = filter.property;
	const operator = filter.operator ?? 'equals';

	if (prop === 'tags') {
		const fileTags: string[] = [];
		if (fm.tags) {
			if (Array.isArray(fm.tags)) {
				fileTags.push(...fm.tags.map(String));
			} else {
				fileTags.push(str(fm.tags));
			}
		}
		if (cache?.tags) {
			for (const tag of cache.tags) fileTags.push(tag.tag);
		}
		if (operator === 'notEquals') return !fileTags.some((tag) => filter.values.includes(tag));
		if (operator === 'contains') return matchContains(fileTags, filter.values);
		return fileTags.some((tag) => filter.values.includes(tag));
	}

	if (prop === 'modified' || prop === 'created') {
		const ts = prop === 'modified' ? file.stat.mtime : file.stat.ctime;
		const dateStr = new Date(ts).toISOString().slice(0, 10);
		if (filter.dateRange) {
			if (filter.dateRange.start && dateStr < filter.dateRange.start) return false;
			if (filter.dateRange.end && dateStr > filter.dateRange.end) return false;
			return true;
		}
		return filter.values.includes(dateStr);
	}

	if (prop === 'path') {
		return filter.values.some((v) => file.path.toLowerCase().includes(v.toLowerCase()));
	}

	// Frontmatter property. A file without the property never matches, under
	// every operator — same convention as Dataview, where a missing field
	// satisfies no comparison.
	const value = fm[prop];
	if (value == null) return false;

	if (operator === 'notEquals') {
		if (Array.isArray(value)) return !value.some((item) => filter.values.includes(String(item)));
		return !filter.values.includes(str(value));
	}
	if (operator === 'contains') {
		const items = Array.isArray(value) ? value.map((item) => str(item)) : [str(value)];
		return matchContains(items, filter.values);
	}
	if (Array.isArray(value)) {
		return value.some((item) => filter.values.includes(String(item)));
	}

	return filter.values.includes(str(value));
}
function matchContains(items: string[], patterns: string[]): boolean {
	const lower = patterns.filter((p) => p.length > 0).map((p) => p.toLowerCase());
	if (lower.length === 0) return false;
	return items.some((s) => s.length > 0 && lower.some((p) => s.toLowerCase().includes(p)));
}
export function str(v: unknown): string {
	if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
	return '';
}
export function localDateKey(ts: number): string {
	const d = new Date(ts);
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${m}-${day}`;
}
export async function loadPreview(app: App, file: TFile): Promise<string> {
	const cache = app.metadataCache.getFileCache(file);
	const position = cache?.frontmatter?.position as { end: { line: number } } | undefined;
	if (!position) return '';
	const startLine = position.end.line + 1;
	const raw = await app.vault.cachedRead(file);
	const lines = raw.split('\n');
	const previewLines: string[] = [];
	for (let i = startLine; i < lines.length && previewLines.length < 3; i++) {
		const line = lines[i]!.replace(/^#+\s*/, '').trim();
		if (line && !line.startsWith('---') && !line.startsWith('```')) previewLines.push(line);
	}
	return previewLines.join(' ').slice(0, 120);
}
function sortResults(results: LibraryFileResult[], sortBy: string, desc: boolean): void {
	results.sort((a, b) => {
		let cmp = 0;
		if (sortBy === 'name') {
			cmp = a.basename.localeCompare(b.basename);
		} else if (sortBy === 'modified') {
			cmp = a.mtime - b.mtime;
		} else if (sortBy === 'created') {
			cmp = a.ctime - b.ctime;
		} else {
			const aVal = a.frontmatter[sortBy];
			const bVal = b.frontmatter[sortBy];
			cmp = comparePropertyValues(aVal, bVal);
		}
		return desc ? -cmp : cmp;
	});
}
function comparePropertyValues(a: unknown, b: unknown): number {
	if (a == null && b == null) return 0;
	if (a == null) return 1;
	if (b == null) return -1;
	const sa = str(a);
	const sb = str(b);
	const na = Number(sa);
	const nb = Number(sb);
	if (!isNaN(na) && !isNaN(nb)) return na - nb;
	return sa.localeCompare(sb);
}
export function formatDate(ts: number): string {
	const d = new Date(ts);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) {
		const diffH = Math.floor(diffMs / (1000 * 60 * 60));
		if (diffH === 0) {
			const diffM = Math.floor(diffMs / (1000 * 60));
			return diffM <= 1 ? t('recent.justNow') : t('recent.minutesAgo', { count: diffM });
		}
		return t('recent.hoursAgo', { count: diffH });
	}
	if (diffDays < 30) return t('recent.daysAgo', { count: diffDays });
	const lang = getLanguage() === 'zh' ? 'zh-CN' : 'en';
	return d.toLocaleDateString(lang, { month: 'short', day: 'numeric' });
}
let activeCalendarPopup: HTMLElement | null = null;
function closeCalendarPopup(): void {
	if (activeCalendarPopup) {
		activeCalendarPopup.remove();
		activeCalendarPopup = null;
	}
}
export function showCalendarPopup(
	anchor: HTMLElement,
	initialStart: string,
	initialEnd: string,
	onSelect: (start: string, end: string) => void,
): void {
	closeCalendarPopup();

	const popup = activeDocument.body.createDiv({
		cls: 'dashboard-task-reminder-popup dashboard-library-calendar-popup',
	});

	// Mirror the active dashboard's full --db-* token set (theme + light/dark
	// + user overrides) onto the popup — it lives on <body>, outside the root.
	applyModalTheme(popup);

	// Opaque surface: the old glass card token let the page bleed through and
	// made the dates unreadable. Prefer the dedicated modal surfaces (dark
	// themes define them); fall back to the always-opaque --db-bg and finally
	// Obsidian's own background — never a hardcoded color.
	popup.setCssProps({
		background: 'var(--db-bg-modal, var(--db-bg, var(--background-primary)))',
		color: 'var(--db-text, var(--text-normal))',
		borderColor: 'var(--db-border-card, var(--background-modifier-border))',
	});

	const rect = anchor.getBoundingClientRect();
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

	let rangeStart = initialStart;
	let rangeEnd = initialEnd;
	// First click of an in-progress pair, waiting for the end-date click.
	let pendingStart: string | null = null;

	const now = new Date();
	const anchorDate = initialStart || initialEnd;
	const dp = anchorDate.split('-').map(Number);
	const viewYear = { value: dp[0] && Number.isFinite(dp[0]) ? dp[0] : now.getFullYear() };
	const viewMonth = { value: dp[1] && Number.isFinite(dp[1]) ? dp[1] - 1 : now.getMonth() };
	const lang = getLanguage();
	const dayNames =
		lang === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

	const calNav = popup.createDiv({ cls: 'dashboard-task-reminder-calendar-nav' });
	const prevBtn = calNav.createEl('button', { text: '<' });
	const monthLabel = calNav.createSpan();
	const nextBtn = calNav.createEl('button', { text: '>' });

	const calGrid = popup.createDiv({ cls: 'dashboard-task-reminder-calendar' });
	const statusLine = popup.createDiv({ cls: 'dashboard-library-calendar-status' });

	const btnRow = popup.createDiv({ cls: 'dashboard-task-reminder-popup-btns' });
	btnRow.createEl('button', { cls: 'mod-cta', text: t('common.save') });
	btnRow.createEl('button', { text: t('common.cancel') });

	const fmt = (y: number, m: number, d: number) =>
		`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

	const renderStatus = () => {
		if (pendingStart) statusLine.setText(`${pendingStart} ~ …`);
		else if (rangeStart || rangeEnd) statusLine.setText(`${rangeStart || '…'} ~ ${rangeEnd || '…'}`);
		else statusLine.setText(t('library.pickRangeHint'));
	};

	const renderCalendar = () => {
		calGrid.empty();
		renderStatus();
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

		const hasRange = !!(rangeStart && rangeEnd);
		for (let d = 1; d <= daysInMonth; d++) {
			const ds = fmt(y, m, d);
			const cls = ['dashboard-task-reminder-calendar-day'];
			if (isCurrentMonth && d === today.getDate()) cls.push('dashboard-task-reminder-calendar-day--today');
			if (ds === rangeStart || ds === rangeEnd || ds === pendingStart)
				cls.push('dashboard-task-reminder-calendar-day--selected');
			else if (hasRange && ds > rangeStart && ds < rangeEnd)
				cls.push('dashboard-task-reminder-calendar-day--in-range');
			const dayBtn = calGrid.createEl('button', { cls: cls.join(' '), text: String(d) });
			dayBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (pendingStart === null) {
					pendingStart = ds;
					renderCalendar();
					return;
				}
				// Second click completes the pair; earlier/later auto-swaps and a
				// same-day double click is a single-day range.
				const s = pendingStart < ds ? pendingStart : ds;
				const en = pendingStart < ds ? ds : pendingStart;
				pendingStart = null;
				rangeStart = s;
				rangeEnd = en;
				onSelect(s, en);
				closeCalendarPopup();
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

	btnRow.querySelector('.mod-cta')!.addEventListener('click', (e) => {
		e.stopPropagation();
		// A lone first click commits as an open-ended range.
		onSelect(pendingStart ?? rangeStart, rangeEnd);
		closeCalendarPopup();
	});

	btnRow.querySelectorAll('button')[1]!.addEventListener('click', (e) => {
		e.stopPropagation();
		closeCalendarPopup();
	});

	const outsideClick = (ev: MouseEvent) => {
		if (!popup.contains(ev.target as Node) && !anchor.contains(ev.target as Node)) {
			closeCalendarPopup();
			activeDocument.removeEventListener('mousedown', outsideClick);
		}
	};
	window.setTimeout(() => activeDocument.addEventListener('mousedown', outsideClick), 0);

	activeCalendarPopup = popup;
	renderCalendar();
}
