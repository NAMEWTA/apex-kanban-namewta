import { escapeYamlString, serializeDocTree } from './extract-card-parts';
import {
	parseBanner,
	parseColumnDefs,
	parseColumns,
	parseHiddenPresets,
	parseQuickActionOrder,
	parseQuickActions,
	splitFrontmatter,
} from './generate-default-markdown';
import type { BannerData, DashboardData, TaskItem } from '../types';

export const KNOWN_METADATA_KEYS = new Set([
	'id',
	'link',
	'progress',
	'due',
	'streak',
	'type',
	'color',
	'cover',
	'width',
	'size',
	'lat',
	'lon',
	'city',
	'track',
	'days',
	'cols',
	'rows',
	'gcol',
	'grow',
	'noteStyle',
]);
export const SECTION_TYPES = new Set([
	'memo',
	'todo',
	'projects',
	'notes',
	'dashboard',
	'library',
	'folder',
	'images',
	'videos',
	'alltasks',
	'calendar',
	'dataview',
	'weread',
	'sticky',
	'web',
]);
export function normalizeHexColor(value?: string): string {
	if (!value) return '';
	const trimmed = value.trim();
	return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}
export const REMINDER_REGEX = /\s*⏰\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*$/;
export const COLLAPSED_REGEX = /\s*<!--collapsed-->\s*$/;
export const DOC_LINE_REGEX = /^(\s*)(?:- )?\[\[((?:[^\]\n]|\](?!\]))+?)]](\s*<!--collapsed-->\s*)?$/;
export const DEFAULT_BANNER: BannerData = {
	quote: 'The mind is everything. What you think you become.',
	author: 'Buddha',
	// Didot (cross-platform stack, same value the font dropdown stores) as the
	// out-of-box quote face — matches the author's own vault.
	quoteFont: 'Didot,"Bodoni MT",Georgia,serif',
	image: 'https://images.pexels.com/photos/2307638/pexels-photo-2307638.jpeg',
	images: [
		'https://images.pexels.com/photos/2307638/pexels-photo-2307638.jpeg',
		'https://images.pexels.com/photos/10664504/pexels-photo-10664504.jpeg',
	],
};
export const DEFAULT_COLUMNS = [
	{ name: 'Memo', color: '#f59e0b', sectionType: 'memo' },
	{ name: 'Todo', color: '#6366f1', sectionType: 'todo' },
	{ name: 'Projects', color: '#10b981', sectionType: 'projects' },
	{ name: 'Library', color: '#8b5cf6', sectionType: 'projects' },
];
export function parse(markdown: string): DashboardData {
	const { frontmatter, body } = splitFrontmatter(markdown);
	const banner = parseBanner(frontmatter);
	const quickActions = parseQuickActions(frontmatter);
	const quickActionOrder = parseQuickActionOrder(frontmatter);
	const columnDefs = parseColumnDefs(frontmatter);
	const columns = parseColumns(body, columnDefs);

	const data: DashboardData = { banner, quickActions, columns };
	if (quickActionOrder) data.quickActionOrder = quickActionOrder;
	const hiddenPresets = parseHiddenPresets(frontmatter);
	if (hiddenPresets) data.hiddenPresets = hiddenPresets;
	return data;
}
export function serialize(data: DashboardData): string {
	const lines: string[] = [];

	lines.push('---');
	lines.push('dashboard: true');

	lines.push('banner:');
	lines.push(`  quote: "${escapeYamlString(data.banner.quote)}"`);
	lines.push(`  author: "${escapeYamlString(data.banner.author)}"`);
	if (data.banner.image) {
		lines.push(`  image: "${data.banner.image}"`);
	}
	if (data.banner.quoteColor) {
		lines.push(`  quoteColor: "${data.banner.quoteColor}"`);
	}
	if (data.banner.quoteFont) {
		lines.push(`  quoteFont: "${escapeYamlString(data.banner.quoteFont)}"`);
	}
	if (data.banner.quotes && data.banner.quotes.length > 0) {
		lines.push('  quotes:');
		for (const q of data.banner.quotes) {
			lines.push(`    - quote: "${escapeYamlString(q.quote)}"`);
			lines.push(`      author: "${escapeYamlString(q.author)}"`);
		}
	}
	if (data.banner.images && data.banner.images.length > 0) {
		lines.push('  images:');
		for (const img of data.banner.images) {
			lines.push(`    - "${escapeYamlString(img)}"`);
		}
	}
	if (data.banner.mode === 'stats') {
		lines.push('  mode: stats');
	}
	if (data.banner.statsConfig) {
		lines.push('  statsConfig:');
		const sc = data.banner.statsConfig;
		if (sc.dailyFolder) lines.push(`    dailyFolder: "${escapeYamlString(sc.dailyFolder)}"`);
		if (sc.dailyFormat) lines.push(`    dailyFormat: "${escapeYamlString(sc.dailyFormat)}"`);
		if (typeof sc.streakFromDaily === 'boolean') lines.push(`    streakFromDaily: ${sc.streakFromDaily}`);
		if (sc.excludeFolders && sc.excludeFolders.length > 0) {
			lines.push('    excludeFolders:');
			for (const folder of sc.excludeFolders) lines.push(`      - "${escapeYamlString(folder)}"`);
		}
		if (sc.accent) lines.push(`    accent: "${sc.accent}"`); // quoted: '#' starts a YAML comment
		if (sc.blur !== undefined) lines.push(`    blur: ${sc.blur}`);
		if (sc.darkness !== undefined) lines.push(`    darkness: ${sc.darkness}`);
		if (sc.showDetails !== undefined) lines.push(`    showDetails: ${sc.showDetails}`);
		if (sc.showLeft !== undefined) lines.push(`    showLeft: ${sc.showLeft}`);
		if (sc.showCenter !== undefined) lines.push(`    showCenter: ${sc.showCenter}`);
		if (sc.showRight !== undefined) lines.push(`    showRight: ${sc.showRight}`);
		if (sc.leftStat) lines.push(`    leftStat: ${sc.leftStat}`);
		if (sc.centerStat) lines.push(`    centerStat: ${sc.centerStat}`);
		if (sc.heatmapSource) lines.push(`    heatmapSource: ${sc.heatmapSource}`);
		if (sc.heatmapHabitId) lines.push(`    heatmapHabitId: "${escapeYamlString(sc.heatmapHabitId)}"`);
		if (sc.rightStats && sc.rightStats.length > 0) {
			lines.push('    rightStats:');
			for (const rs of sc.rightStats) lines.push(`      - ${rs}`);
		}
	}

	if (data.quickActions.length > 0) {
		lines.push('quickActions:');
		for (const action of data.quickActions) {
			lines.push(`  - name: "${escapeYamlString(action.name)}"`);
			lines.push(`    icon: "${escapeYamlString(action.icon)}"`);
			lines.push(`    type: ${action.type}`);
			lines.push(`    target: "${escapeYamlString(action.target)}"`);
		}
	}

	if (data.quickActionOrder && data.quickActionOrder.length > 0) {
		lines.push('quickActionOrder:');
		for (const key of data.quickActionOrder) {
			lines.push(`  - "${escapeYamlString(key)}"`);
		}
	}

	if (data.hiddenPresets && data.hiddenPresets.length > 0) {
		lines.push('hiddenPresets:');
		for (const key of data.hiddenPresets) {
			lines.push(`  - "${escapeYamlString(key)}"`);
		}
	}

	lines.push('columns:');
	for (const col of data.columns) {
		lines.push(`  - name: ${col.name}`);
		lines.push(`    color: "${col.color}"`);
		if (col.sectionType) {
			lines.push(`    type: ${col.sectionType}`);
		}
		if (col.libraryConfig) {
			lines.push('    library:');
			const lc = col.libraryConfig;
			lines.push(`      viewMode: ${lc.viewMode}`);
			lines.push(`      sortBy: "${lc.sortBy}"`);
			lines.push(`      sortDesc: ${lc.sortDesc}`);
			if (lc.folders && lc.folders.length > 0) {
				lines.push('      folders:');
				for (const f of lc.folders) {
					lines.push(`        - "${escapeYamlString(f)}"`);
				}
			}
			if (lc.folderFilter && lc.folderFilter.length > 0) {
				lines.push('      folderFilter:');
				for (const f of lc.folderFilter) {
					lines.push(`        - "${escapeYamlString(f)}"`);
				}
			}
			if (lc.excludeFolders && lc.excludeFolders.length > 0) {
				lines.push('      excludeFolders:');
				for (const f of lc.excludeFolders) {
					lines.push(`        - "${escapeYamlString(f)}"`);
				}
			}
			if (lc.includeFolders && lc.includeFolders.length > 0) {
				lines.push('      includeFolders:');
				for (const f of lc.includeFolders) {
					lines.push(`        - "${escapeYamlString(f)}"`);
				}
			}
			if (lc.templatePath) {
				lines.push(`      templatePath: "${escapeYamlString(lc.templatePath)}"`);
			}
			if (lc.taskGroupBy) {
				lines.push(`      taskGroupBy: ${lc.taskGroupBy}`);
			}
			if (lc.kanbanGroupBy) {
				lines.push(`      kanbanGroupBy: "${escapeYamlString(lc.kanbanGroupBy)}"`);
			}
			// 'property' is the default group mode — only persist the opt-in.
			if (lc.groupMode === 'folder') {
				lines.push(`      groupMode: folder`);
			}
			// 'none'/undefined is the default view grouping — only persist the opt-ins.
			if (lc.viewGroupMode === 'folder' || lc.viewGroupMode === 'property') {
				lines.push(`      viewGroupMode: ${lc.viewGroupMode}`);
				if (lc.viewGroupMode === 'property' && lc.viewGroupBy) {
					lines.push(`      viewGroupBy: "${escapeYamlString(lc.viewGroupBy)}"`);
				}
			}
			if (lc.kanbanShowCovers) {
				lines.push(`      kanbanShowCovers: true`);
			}
			if (lc.pageSize) {
				lines.push(`      pageSize: ${lc.pageSize}`);
			}
			if (lc.showProperties === false) {
				lines.push(`      showProperties: false`);
			}
			if (lc.propertyLimit != null) {
				lines.push(`      propertyLimit: ${lc.propertyLimit}`);
			}
			if (lc.visibleProperties && lc.visibleProperties.length > 0) {
				lines.push(`      visibleProperties:`);
				for (const p of lc.visibleProperties) {
					lines.push(`        - "${escapeYamlString(p)}"`);
				}
			}
			// 'medium' is the default card size — only persist the opt-outs.
			if (lc.cardSize === 'small' || lc.cardSize === 'large') {
				lines.push(`      cardSize: ${lc.cardSize}`);
			}
			if (lc.quickDateFilter) {
				lines.push(`      quickDateFilter:`);
				lines.push(`        property: "${lc.quickDateFilter.property}"`);
				lines.push(`        start: "${lc.quickDateFilter.start}"`);
				lines.push(`        end: "${lc.quickDateFilter.end}"`);
				if (lc.quickDateFilter.days != null) {
					lines.push(`        days: ${lc.quickDateFilter.days}`);
				}
			}
			if (lc.filters.length > 0) {
				lines.push('      filters:');
				for (const filter of lc.filters) {
					lines.push(`        - property: "${escapeYamlString(filter.property)}"`);
					if (filter.operator && filter.operator !== 'equals') {
						lines.push(`          operator: "${filter.operator}"`);
					}
					if (filter.values.length > 0) {
						lines.push(
							`          values: [${filter.values.map((v) => `"${escapeYamlString(v)}"`).join(', ')}]`,
						);
					} else {
						lines.push('          values: []');
					}
					if (filter.dateRange) {
						if (filter.dateRange.start) lines.push(`          dateStart: "${filter.dateRange.start}"`);
						if (filter.dateRange.end) lines.push(`          dateEnd: "${filter.dateRange.end}"`);
					}
				}
			}
		}
		if (col.height != null) {
			lines.push(`    height: ${col.height}`);
		}
		// Pair split (left member's share %): only meaningful beside `half`.
		if (col.half && col.width != null) {
			lines.push(`    width: ${col.width}`);
		}
		if (col.half) {
			lines.push('    half: true');
		}
		if (col.wereadConfig) {
			const wc = col.wereadConfig;
			lines.push('    weread:');
			lines.push('      widgets:');
			for (const w of wc.widgets) {
				lines.push(`        - id: "${escapeYamlString(w.id)}"`);
				lines.push(`          view: ${w.view}`);
				if (w.progressFilters?.length) {
					lines.push('          progressFilters:');
					for (const p of w.progressFilters) lines.push(`            - ${p}`);
				}
				if (w.contentTypeFilters?.length) {
					lines.push('          contentTypeFilters:');
					for (const type of w.contentTypeFilters) lines.push(`            - ${type}`);
				}
				if (w.recencyFilters?.length) {
					lines.push('          recencyFilters:');
					for (const recency of w.recencyFilters) lines.push(`            - ${recency}`);
				}
				if (w.noteFilters?.length) {
					lines.push('          noteFilters:');
					for (const note of w.noteFilters) lines.push(`            - ${note}`);
				}
				if (w.statsItems?.length) {
					lines.push('          statsItems:');
					for (const item of w.statsItems) lines.push(`            - ${item}`);
				}
				if (w.groupBy && w.groupBy !== 'readingState') lines.push(`          groupBy: ${w.groupBy}`);
				if (w.categoryFilters?.length) {
					lines.push('          categoryFilters:');
					for (const c of w.categoryFilters) lines.push(`            - "${escapeYamlString(c)}"`);
				}
				if (w.title) lines.push(`          title: "${escapeYamlString(w.title)}"`);
			}
		}
		if (col.dataviewConfig) {
			const dc = col.dataviewConfig;
			lines.push('    dataview:');
			// JSON.stringify yields a valid double-quoted YAML scalar and safely
			// escapes embedded newlines/quotes in the multi-line query.
			lines.push(`      query: ${JSON.stringify(dc.query)}`);
			if (dc.title) lines.push(`      title: ${JSON.stringify(dc.title)}`);
			if (dc.excludeFolders && dc.excludeFolders.length > 0) {
				lines.push('      excludeFolders:');
				for (const f of dc.excludeFolders) {
					lines.push(`        - "${escapeYamlString(f)}"`);
				}
			}
		}
		if (col.webConfig) {
			const wc = col.webConfig;
			lines.push('    web:');
			// JSON.stringify yields a valid double-quoted YAML scalar and safely
			// escapes embedded quotes/backslashes (same trick as the dataview
			// query; a URL's :, #, ? and & need no escaping inside quotes).
			lines.push(`      url: ${JSON.stringify(wc.url)}`);
			if (typeof wc.zoom === 'number' && wc.zoom !== 1) {
				lines.push(`      zoom: ${wc.zoom}`);
			}
		}
	}

	lines.push('---');
	lines.push('');

	for (const column of data.columns) {
		lines.push(`## ${column.name}`);
		lines.push('');

		if (
			column.sectionType === 'library' ||
			column.sectionType === 'folder' ||
			column.sectionType === 'images' ||
			column.sectionType === 'videos' ||
			column.sectionType === 'alltasks' ||
			column.sectionType === 'calendar' ||
			column.sectionType === 'dataview' ||
			column.sectionType === 'web'
		)
			continue;

		for (const card of column.cards) {
			lines.push(`### ${card.title}`);

			if (card.id) {
				lines.push(`id: ${card.id}`);
			}

			if (card.noteStyle) lines.push(`noteStyle: ${card.noteStyle}`);

			if (card.type === 'generic') lines.push('type: generic');

			if (card.type === 'task') {
				lines.push(`type: task`);
			}

			if (card.type === 'project') {
				lines.push(`type: project`);
			}

			if (card.wikiLink) {
				lines.push(`link: [[${card.wikiLink}]]`);
			} else if (card.url) {
				lines.push(`link: ${card.url}`);
			}

			if (card.progress >= 0) {
				lines.push(`progress: ${card.progress}%`);
			}

			if (card.dueDate) {
				lines.push(`due: ${card.dueDate}`);
			}

			if (card.streak > 0) {
				lines.push(`streak: ${card.streak}`);
			}

			if (card.color) {
				// Store without the leading '#': a bare '#f59e0b' in the card body
				// would be picked up by Obsidian as a tag. Normalize back on read.
				lines.push(`color: ${card.color.replace(/^#/, '')}`);
			}

			if (card.coverImage) {
				lines.push(`cover: ${card.coverImage}`);
			}

			if (card.width > 0) {
				lines.push(`width: ${card.width}`);
			}
			if (card.size && card.size !== 'M') {
				lines.push(`size: ${card.size}`);
			}
			if (card.gridCols > 0) {
				lines.push(`cols: ${card.gridCols}`);
			}
			if (card.gridRows > 0) {
				lines.push(`rows: ${card.gridRows}`);
			}
			if (card.gridCol > 0) {
				lines.push(`gcol: ${card.gridCol}`);
			}
			if (card.gridRow > 0) {
				lines.push(`grow: ${card.gridRow}`);
			}
			if (card.weatherConfig) {
				const wc = card.weatherConfig;
				lines.push(`lat: ${wc.latitude}`);
				lines.push(`lon: ${wc.longitude}`);
				lines.push(`city: "${escapeYamlString(wc.cityName)}"`);
			}

			if (card.trackerConfig) {
				const tc = card.trackerConfig;
				lines.push(`track: ${tc.key}`);
				lines.push(`days: ${tc.days}`);
			}

			if (card.blockquote) {
				lines.push(`> ${card.blockquote}`);
			}

			if (card.tasks.length > 0) {
				const writeTask = (task: TaskItem, indent: number) => {
					const prefix = indent > 0 ? '    '.repeat(indent) : '';
					let taskLine = `${prefix}- [${task.checked ? 'x' : ' '}] ${task.text}`;
					if (task.reminder) taskLine += ` ⏰ ${task.reminder}`;
					if (task.collapsed) taskLine += ` <!--collapsed-->`;
					lines.push(taskLine);
					for (const child of task.children ?? []) writeTask(child, indent + 1);
				};
				for (const task of card.tasks) writeTask(task, 0);
			}

			if (card.docs.length > 0) {
				for (const docLine of serializeDocTree(card.docs)) lines.push(docLine);
			}

			const bodyLines = card.body.trim();
			if (bodyLines) {
				if (card.tasks.length > 0 || card.docs.length > 0 || card.blockquote || card.url || card.wikiLink) {
					lines.push('');
				}
				lines.push(bodyLines);
			}

			lines.push('');
		}
	}

	return lines.join('\n');
}
