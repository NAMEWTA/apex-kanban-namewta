import {
	COLLAPSED_REGEX,
	DOC_LINE_REGEX,
	KNOWN_METADATA_KEYS,
	REMINDER_REGEX,
	SECTION_TYPES,
	normalizeHexColor,
	parse,
	serialize,
} from './parse';
import { appendChild, getTaskByPath } from '../persist/task-tree';
import type {
	CardType,
	CardSize,
	DashboardCard,
	TaskItem,
	DocNode,
	WeatherConfig,
	TrackerConfig,
	LibraryConfig,
	WereadConfig,
	DataviewConfig,
	WebEmbedConfig,
} from '../types';
import { t } from '../../shared/i18n';

export function resolveSectionType(name: string, cards: DashboardCard[], fallback?: string): string {
	if (fallback && SECTION_TYPES.has(fallback)) return fallback;

	const lower = name.toLowerCase();
	if (SECTION_TYPES.has(lower)) return lower;

	if (cards.length > 0) {
		const types = new Set(cards.map((c) => c.type));
		const dashboardTypes = new Set(['weather', 'tracker']);
		if ([...types].every((t) => dashboardTypes.has(t)) && types.size > 0) return 'dashboard';
		if (types.has('task') && types.size === 1) return 'todo';
		if (types.has('task') && !types.has('project')) return 'todo';
		if (types.has('project') && types.size === 1) return 'projects';
		if (types.has('generic') && !types.has('project') && !types.has('task')) return 'memo';
	}

	return 'projects';
}
function str(v: unknown): string {
	if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
	return '';
}
export function parseLibraryConfig(raw: Record<string, unknown>): LibraryConfig {
	const filters: import('../types').PropertyFilter[] = [];
	const rawFilters = raw.filters;
	if (Array.isArray(rawFilters)) {
		for (const item of rawFilters) {
			const rec = item as Record<string, unknown>;
			const property = str(rec.property ?? '');
			const rawValues = rec.values;
			const values = Array.isArray(rawValues) ? rawValues.map((v: unknown) => String(v)) : [];
			const dateStart = rec.dateStart ? str(rec.dateStart) : '';
			const dateEnd = rec.dateEnd ? str(rec.dateEnd) : '';
			const dateRange = dateStart || dateEnd ? { start: dateStart, end: dateEnd } : undefined;
			const rawOperator = str(rec.operator ?? '');
			const operator = rawOperator === 'contains' || rawOperator === 'notEquals' ? rawOperator : undefined;
			filters.push({ property, values, dateRange, operator });
		}
	}

	return {
		filters,
		viewMode: (['grid', 'gallery', 'list', 'table', 'kanban'].includes(str(raw.viewMode ?? ''))
			? raw.viewMode
			: 'grid') as import('../types').LibraryViewMode,
		sortBy: str(raw.sortBy ?? 'modified'),
		sortDesc: raw.sortDesc !== false,
		kanbanGroupBy: raw.kanbanGroupBy ? str(raw.kanbanGroupBy) : undefined,
		groupMode: ['property', 'folder'].includes(str(raw.groupMode ?? ''))
			? (raw.groupMode as import('../types').LibraryConfig['groupMode'])
			: undefined,
		viewGroupMode: ['none', 'folder', 'property'].includes(str(raw.viewGroupMode ?? ''))
			? (raw.viewGroupMode as import('../types').LibraryConfig['viewGroupMode'])
			: undefined,
		viewGroupBy: raw.viewGroupBy && str(raw.viewGroupMode ?? '') === 'property' ? str(raw.viewGroupBy) : undefined,
		kanbanShowCovers: raw.kanbanShowCovers === true ? true : undefined,
		pageSize: typeof raw.pageSize === 'number' ? raw.pageSize : undefined,
		showProperties: raw.showProperties === false ? false : undefined,
		propertyLimit: typeof raw.propertyLimit === 'number' ? raw.propertyLimit : undefined,
		visibleProperties: (() => {
			const list = Array.isArray(raw.visibleProperties)
				? raw.visibleProperties.map((v: unknown) => str(v)).filter((s) => s.length > 0)
				: [];
			return list.length > 0 ? [...new Set(list)] : undefined;
		})(),
		cardSize: ['small', 'medium', 'large'].includes(str(raw.cardSize ?? ''))
			? (raw.cardSize as import('../types').LibraryConfig['cardSize'])
			: undefined,
		folders: Array.isArray(raw.folders)
			? raw.folders.map((v: unknown) => String(v))
			: typeof raw.folder === 'string'
				? [raw.folder]
				: undefined,
		folderFilter: Array.isArray(raw.folderFilter) ? raw.folderFilter.map((v: unknown) => String(v)) : undefined,
		excludeFolders: Array.isArray(raw.excludeFolders)
			? raw.excludeFolders.map((v: unknown) => String(v))
			: undefined,
		includeFolders: Array.isArray(raw.includeFolders)
			? raw.includeFolders.map((v: unknown) => String(v))
			: undefined,
		templatePath: typeof raw.templatePath === 'string' ? raw.templatePath : undefined,
		taskGroupBy: ['date', 'priority', 'none'].includes(str(raw.taskGroupBy ?? ''))
			? (raw.taskGroupBy as import('../types').LibraryConfig['taskGroupBy'])
			: undefined,
		quickDateFilter:
			raw.quickDateFilter && typeof raw.quickDateFilter === 'object'
				? {
						property:
							(raw.quickDateFilter as Record<string, unknown>).property === 'modified'
								? ('modified' as const)
								: ('created' as const),
						start: str((raw.quickDateFilter as Record<string, unknown>).start ?? ''),
						end: str((raw.quickDateFilter as Record<string, unknown>).end ?? ''),
						days: (() => {
							const d = (raw.quickDateFilter as Record<string, unknown>).days;
							return typeof d === 'number' && d > 0 ? d : undefined;
						})(),
					}
				: undefined,
	};
}
export function parseWereadConfig(raw: Record<string, unknown>): WereadConfig {
	const validView = (v: unknown): WereadConfig['widgets'][number]['view'] =>
		['shelf', 'stats', 'notes'].includes(str(v ?? ''))
			? (str(v) as WereadConfig['widgets'][number]['view'])
			: 'shelf';
	const validList = <T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined => {
		if (!Array.isArray(value)) return undefined;
		const accepted = value.map((item) => str(item)).filter((item): item is T => allowed.includes(item as T));
		return accepted.length > 0 ? [...new Set(accepted)] : undefined;
	};
	const validGroupBy = (value: unknown): WereadConfig['widgets'][number]['groupBy'] => {
		const groupBy = str(value ?? 'readingState');
		return ['none', 'readingState', 'contentType', 'recency', 'notes'].includes(groupBy)
			? (groupBy as WereadConfig['widgets'][number]['groupBy'])
			: 'readingState';
	};

	// New shape: widgets[]
	if (Array.isArray(raw.widgets)) {
		const widgets = (raw.widgets as Array<Record<string, unknown>>)
			.filter((w) => w && typeof w === 'object')
			.map((w, i) => ({
				id: String((w.id ?? `w${i + 1}`) as string | number | boolean),
				view: validView(w.view),
				progressFilters: validList(w.progressFilters, ['notStarted', 'reading', 'finished'] as const),
				contentTypeFilters: validList(w.contentTypeFilters, ['book', 'audio', 'article'] as const),
				recencyFilters: validList(w.recencyFilters, ['recent7', 'recent30', 'older', 'never'] as const),
				noteFilters: validList(w.noteFilters, ['highlights', 'ideas', 'none'] as const),
				// Conditional spread: absent statsItems stays an absent key, so
				// round-trip equality with the pre-field shape holds.
				...(validList(w.statsItems, ['kpi', 'trend', 'topRead', 'preferCategory'] as const)
					? { statsItems: validList(w.statsItems, ['kpi', 'trend', 'topRead', 'preferCategory'] as const) }
					: {}),
				groupBy: validGroupBy(w.groupBy),
				categoryFilters: Array.isArray(w.categoryFilters)
					? (w.categoryFilters as Array<unknown>).map((c) => String(c as string | number | boolean))
					: undefined,
				title: w.title ? String(w.title as string | number | boolean) : undefined,
			}));
		if (widgets.length > 0) return { widgets };
	}
	// Legacy shape: single view (+ bookFilter) → migrate to a category filter.
	const legacyFilter = typeof raw.bookFilter === 'string' ? raw.bookFilter : undefined;
	return {
		widgets: [
			{
				id: 'w1',
				view: validView(raw.view),
				categoryFilters: legacyFilter && legacyFilter !== 'all' ? [legacyFilter] : undefined,
			},
		],
	};
}
export function parseDataviewConfig(raw: Record<string, unknown>): DataviewConfig {
	const query = str(raw.query ?? '');
	const title = raw.title ? str(raw.title) : undefined;
	return {
		query,
		title: title && title.length > 0 ? title : undefined,
		excludeFolders: Array.isArray(raw.excludeFolders)
			? raw.excludeFolders.map((v: unknown) => String(v))
			: undefined,
	};
}
export function parseWebConfig(raw: Record<string, unknown>): WebEmbedConfig {
	const url = str(raw.url ?? '');
	// Legacy `mode:` lines (the engine became fully automatic) are read-and-
	// dropped: a pre-2.3.1 pinned iframe/webview mode falls away on the next
	// save and the section follows the automatic route from then on.
	const zoomRaw = typeof raw.zoom === 'number' ? raw.zoom : undefined;
	// Out-of-range and 1 values drop to undefined: 1 is the default zoom, and
	// dropping it keeps serialize(parse(serialize(x))) === serialize(x).
	const zoom = zoomRaw != null && zoomRaw >= 0.5 && zoomRaw <= 2 && zoomRaw !== 1 ? zoomRaw : undefined;
	return { url, zoom };
}
export function splitByH2(body: string): Array<{ heading: string; content: string }> {
	const lines = body.split('\n');
	const sections: Array<{ heading: string; content: string }> = [];
	let current: { heading: string; lines: string[] } | null = null;

	for (const line of lines) {
		if (line.startsWith('## ')) {
			if (current) {
				sections.push({ heading: current.heading, content: current.lines.join('\n').trim() });
			}
			current = { heading: line.slice(3).trim(), lines: [] };
		} else if (current) {
			current.lines.push(line);
		}
	}

	if (current) {
		sections.push({ heading: current.heading, content: current.lines.join('\n').trim() });
	}

	return sections;
}
export function parseCards(content: string, columnName: string): DashboardCard[] {
	const blocks = splitByH3(content);
	return blocks.map((block) => parseCard(block, columnName));
}
function splitByH3(content: string): Array<{ title: string; body: string }> {
	const lines = content.split('\n');
	const blocks: Array<{ title: string; body: string }> = [];
	let current: { title: string; lines: string[] } | null = null;

	for (const line of lines) {
		if (line.startsWith('### ')) {
			if (current) {
				blocks.push({ title: current.title, body: current.lines.join('\n').trim() });
			}
			current = { title: line.slice(4).trim(), lines: [] };
		} else if (current) {
			current.lines.push(line);
		}
	}

	if (current) {
		blocks.push({ title: current.title, body: current.lines.join('\n').trim() });
	}

	return blocks;
}
function parseCard(block: { title: string; body: string }, columnName: string): DashboardCard {
	const { metadata, tasks, docs, blockquote, cleanBody } = extractCardParts(block.body);
	const cardType = detectCardType(tasks, blockquote, metadata);
	const weatherConfig = cardType === 'weather' ? parseWeatherConfig(metadata) : undefined;
	const trackerConfig = cardType === 'tracker' ? parseTrackerConfig(metadata) : undefined;

	return {
		id: metadata.id ?? generateId(block.title, columnName),
		title: block.title,
		type: cardType,
		noteStyle: metadata.noteStyle === 'cover' || metadata.noteStyle === 'plain' ? metadata.noteStyle : undefined,
		column: columnName,
		body: cleanBody,
		tasks,
		docs,
		url: extractUrl(metadata),
		wikiLink: extractWikiLink(metadata),
		progress: extractProgress(metadata),
		streak: extractStreak(metadata),
		dueDate: extractDue(metadata),
		blockquote,
		color: normalizeHexColor(metadata.color),
		coverImage: metadata.cover ?? '',
		width: parseInt(metadata.width ?? '0', 10) || 0,
		size: parseCardSize(metadata.size),
		gridCols: parseInt(metadata.cols ?? '0', 10) || 0,
		gridRows: parseInt(metadata.rows ?? '0', 10) || 0,
		gridCol: parseInt(metadata.gcol ?? '0', 10) || 0,
		gridRow: parseInt(metadata.grow ?? '0', 10) || 0,
		weatherConfig,
		trackerConfig,
	};
}
export function extractCardParts(body: string): {
	metadata: Record<string, string>;
	tasks: TaskItem[];
	docs: DocNode[];
	blockquote: string;
	cleanBody: string;
} {
	const lines = body.split('\n');
	const metadata: Record<string, string> = {};
	let tasks: TaskItem[] = [];
	const docLines: string[] = [];
	const bodyLines: string[] = [];
	let blockquote = '';
	let ancestors: { indent: number; path: number[] }[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		const indent = (line.match(/^[\t ]*/)?.[0] ?? '').replace(/\t/g, '    ').length;

		const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
		if (kvMatch && kvMatch[1] && kvMatch[2] && KNOWN_METADATA_KEYS.has(kvMatch[1])) {
			metadata[kvMatch[1]] = kvMatch[2];
			ancestors = [];
			continue;
		}

		const taskMatch = trimmed.match(/^- \[([ xX])\]\s*(.+)$/);
		if (taskMatch && taskMatch[1] && taskMatch[2]) {
			let taskText = taskMatch[2];
			let taskReminder: string | undefined;
			let taskCollapsed = false;
			const collapsedMatch = taskText.match(COLLAPSED_REGEX);
			if (collapsedMatch) {
				taskText = taskText.replace(COLLAPSED_REGEX, '');
				taskCollapsed = true;
			}
			const reminderMatch = taskText.match(REMINDER_REGEX);
			if (reminderMatch) {
				taskText = taskText.replace(REMINDER_REGEX, '');
				taskReminder = reminderMatch[1];
			}
			const node: TaskItem = {
				checked: taskMatch[1] !== ' ',
				text: taskText,
				reminder: taskReminder,
				collapsed: taskCollapsed,
			};
			ancestors = ancestors.filter((parent) => parent.indent < indent);
			const parent = ancestors[ancestors.length - 1];
			const path = parent
				? [...parent.path, getTaskByPath(tasks, parent.path)?.children?.length ?? 0]
				: [tasks.length];
			tasks = parent ? appendChild(tasks, parent.path, node) : [...tasks, node];
			ancestors = [...ancestors, { indent, path }];
			continue;
		}

		const docMatch = line.match(DOC_LINE_REGEX);
		if (docMatch) {
			docLines.push(line);
			continue;
		}

		ancestors = [];

		if (trimmed.startsWith('> ')) {
			blockquote += (blockquote ? '\n' : '') + trimmed.slice(2);
			continue;
		}

		if (trimmed) {
			bodyLines.push(trimmed);
		}
	}

	return { metadata, tasks, docs: parseDocTree(docLines), blockquote, cleanBody: bodyLines.join('\n') };
}
const DOC_TREE_INDENT = 4;
function parseDocTree(rawLines: string[]): DocNode[] {
	const root: DocNode[] = [];
	const stack: { depth: number; node: DocNode }[] = [];
	for (const line of rawLines) {
		const m = line.match(DOC_LINE_REGEX);
		if (!m) continue;
		const indentSpaces = (m[1] ?? '').replace(/\t/g, '    ');
		const depth = Math.floor(indentSpaces.length / DOC_TREE_INDENT);
		const node: DocNode = { path: m[2]! };
		if (m[3]) node.collapsed = true;
		while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
		if (stack.length === 0) {
			root.push(node);
		} else {
			const parent = stack[stack.length - 1]!.node;
			parent.children = [...(parent.children ?? []), node];
		}
		stack.push({ depth, node });
	}
	return root;
}
export function serializeDocTree(docs: DocNode[]): string[] {
	const lines: string[] = [];
	const write = (node: DocNode, indent: number) => {
		const prefix = indent > 0 ? '    '.repeat(indent) : '';
		let line = `${prefix}- [[${node.path}]]`;
		if (node.collapsed) line += ` <!--collapsed-->`;
		lines.push(line);
		for (const child of node.children ?? []) write(child, indent + 1);
	};
	for (const doc of docs) write(doc, 0);
	return lines;
}
function detectCardType(tasks: TaskItem[], blockquote: string, metadata: Record<string, string>): CardType {
	if (metadata.type === 'generic') return 'generic';
	if (metadata.type === 'task') return 'task';
	if (metadata.type === 'project') return 'project';
	if (metadata.type === 'weather') return 'weather';
	if (metadata.type === 'tracker') return 'tracker';

	const link = metadata.link ?? '';

	if (tasks.length > 0) return 'task';
	if (blockquote) return 'note';
	if (metadata.streak) return 'habit';
	if (link.startsWith('[[')) return 'project';
	if (link.startsWith('http')) return 'link';
	if (metadata.progress) return 'project';
	return 'generic';
}
function parseCardSize(raw: string | undefined): CardSize {
	const v = (raw ?? '').toUpperCase().trim();
	if (v === 'S' || v === 'L') return v;
	return 'M';
}
function extractUrl(metadata: Record<string, string>): string {
	const link = metadata.link ?? '';
	return link.startsWith('http') ? link : '';
}
function extractWikiLink(metadata: Record<string, string>): string {
	const link = metadata.link ?? '';
	const match = link.match(/^\[\[(.+)]]$/);
	return match && match[1] ? match[1] : '';
}
function extractProgress(metadata: Record<string, string>): number {
	if (!metadata.progress) return -1;
	const num = parseInt(metadata.progress.replace('%', ''), 10);
	return isNaN(num) ? -1 : Math.min(100, Math.max(0, num));
}
function extractStreak(metadata: Record<string, string>): number {
	if (!metadata.streak) return 0;
	const num = parseInt(metadata.streak, 10);
	return isNaN(num) ? 0 : num;
}
function extractDue(metadata: Record<string, string>): string {
	return metadata.due ?? '';
}
function generateId(title: string, column: string): string {
	const raw = `${title}::${column}`;
	let hash = 0;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw.charCodeAt(i);
		hash = (hash << 5) - hash + ch;
		hash |= 0;
	}
	return `card-${Math.abs(hash).toString(36)}`;
}
export function escapeYamlString(str: string): string {
	return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}
function dequote(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\"/g, '"');
	}
	if (value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1);
	}
	return value;
}
function parseWeatherConfig(metadata: Record<string, string>): WeatherConfig {
	return {
		latitude: parseFloat(metadata.lat ?? '0') || 0,
		longitude: parseFloat(metadata.lon ?? '0') || 0,
		cityName: dequote(metadata.city ?? ''),
	};
}
function parseTrackerConfig(metadata: Record<string, string>): TrackerConfig {
	const style = metadata.style ?? 'line';
	return {
		key: metadata.track ?? '',
		days: parseInt(metadata.days ?? '14', 10) || 14,
		style: style === 'heatmap' || style === 'bar' ? style : 'line',
	};
}
