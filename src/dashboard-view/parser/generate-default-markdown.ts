import {
	parseCards,
	parseDataviewConfig,
	parseLibraryConfig,
	parseWebConfig,
	parseWereadConfig,
	resolveSectionType,
	splitByH2,
} from './extract-card-parts';
import { DEFAULT_BANNER, DEFAULT_COLUMNS, parse, serialize } from './parse';
import type {
	BannerData,
	BannerLeftStat,
	BannerCenterStat,
	BannerRightStat,
	BannerStatsConfig,
	DashboardColumn,
	QuickAction,
	LibraryConfig,
	WereadConfig,
	DataviewConfig,
	WebEmbedConfig,
} from '../types';
import { parse as parseYaml } from 'yaml';
import { t } from '../../shared/i18n';
import { normalizeColumnPairs } from '../persist/column-pairs';

export function generateDefaultMarkdown(): string {
	const today = new Date();
	const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

	return serialize({
		banner: DEFAULT_BANNER,
		quickActions: [],
		columns: [
			{
				name: 'Memo',
				color: '#f59e0b',
				sectionType: 'memo',
				cards: [
					{
						id: 'demo-memo-1',
						title: t('default.memoTitle', { date: dateStr }),
						type: 'generic',
						column: 'Memo',
						body: t('default.memoBody'),
						tasks: [],
						docs: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
						width: 0,
						size: 'M',
						gridCols: 0,
						gridRows: 0,
						gridCol: 0,
						gridRow: 0,
					},
					{
						id: 'demo-memo-path',
						title: t('default.memoPathTitle'),
						type: 'generic',
						column: 'Memo',
						body: t('default.memoPathBody'),
						tasks: [],
						docs: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
						width: 0,
						size: 'M',
						gridCols: 0,
						gridRows: 0,
						gridCol: 0,
						gridRow: 0,
					},
					{
						id: 'demo-memo-rename',
						title: t('default.memoRenameTitle'),
						type: 'generic',
						column: 'Memo',
						body: t('default.memoRenameBody'),
						tasks: [],
						docs: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
						width: 0,
						size: 'M',
						gridCols: 0,
						gridRows: 0,
						gridCol: 0,
						gridRow: 0,
					},
				],
			},
			{
				name: 'Todo',
				color: '#6366f1',
				sectionType: 'todo',
				cards: [
					{
						id: 'demo-todo-1',
						title: t('default.todoTitle1'),
						type: 'task',
						column: 'Todo',
						body: '',
						tasks: [
							{ text: t('default.todo1'), checked: false },
							{ text: t('default.todo2'), checked: false },
							{ text: t('default.todo3'), checked: false },
							{ text: t('default.todo4'), checked: false },
						],
						docs: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
						width: 0,
						size: 'M',
						gridCols: 0,
						gridRows: 0,
						gridCol: 0,
						gridRow: 0,
					},
					{
						id: 'demo-todo-2',
						title: t('default.todoTitle2'),
						type: 'task',
						column: 'Todo',
						body: '',
						tasks: [
							{ text: t('default.guide1'), checked: false },
							{ text: t('default.guide2'), checked: false },
							{ text: t('default.guide3'), checked: false },
							{ text: t('default.guide4'), checked: false },
						],
						docs: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
						width: 0,
						size: 'M',
						gridCols: 0,
						gridRows: 0,
						gridCol: 0,
						gridRow: 0,
					},
				],
			},
			{
				name: 'Projects',
				color: '#10b981',
				sectionType: 'projects',
				cards: [
					{
						id: 'demo-project-1',
						title: t('default.projectTitle'),
						type: 'project',
						column: 'Projects',
						body: '',
						tasks: [],
						docs: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
						width: 0,
						size: 'M',
						gridCols: 0,
						gridRows: 0,
						gridCol: 0,
						gridRow: 0,
					},
				],
			},
			{
				name: 'Library',
				color: '#8b5cf6',
				sectionType: 'projects',
				cards: [
					{
						id: 'demo-lib-reading',
						title: 'Reading',
						type: 'project',
						column: 'Library',
						body: '',
						tasks: [],
						docs: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
						width: 0,
						size: 'M',
						gridCols: 0,
						gridRows: 0,
						gridCol: 0,
						gridRow: 0,
					},
					{
						id: 'demo-lib-toread',
						title: 'To Read',
						type: 'project',
						column: 'Library',
						body: '',
						tasks: [],
						docs: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
						width: 0,
						size: 'M',
						gridCols: 0,
						gridRows: 0,
						gridCol: 0,
						gridRow: 0,
					},
					{
						id: 'demo-lib-done',
						title: 'Done',
						type: 'project',
						column: 'Library',
						body: '',
						tasks: [],
						docs: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
						width: 0,
						size: 'M',
						gridCols: 0,
						gridRows: 0,
						gridCol: 0,
						gridRow: 0,
					},
				],
			},
		],
	});
}
export function splitFrontmatter(markdown: string): { frontmatter: Record<string, unknown>; body: string } {
	const trimmed = markdown.trimStart();
	if (!trimmed.startsWith('---')) {
		return { frontmatter: {}, body: trimmed };
	}

	const end = trimmed.indexOf('---', 3);
	if (end === -1) {
		return { frontmatter: {}, body: trimmed };
	}

	const yaml = trimmed.slice(3, end).trim();
	const body = trimmed.slice(end + 3).trim();

	return { frontmatter: (parseYaml(yaml) ?? {}) as Record<string, unknown>, body };
}
export function parseBanner(fm: Record<string, unknown>): BannerData {
	const raw = fm.banner as Record<string, unknown> | undefined;
	if (!raw) return { ...DEFAULT_BANNER, images: DEFAULT_BANNER.images ? [...DEFAULT_BANNER.images] : undefined };

	const quotesRaw = raw.quotes;
	let quotes: Array<{ quote: string; author: string }> | undefined;
	if (Array.isArray(quotesRaw)) {
		quotes = quotesRaw.map((item: Record<string, string>) => ({
			quote: item.quote ?? '',
			author: item.author ?? '',
		}));
	}

	const imagesRaw = raw.images;
	let images: string[] | undefined;
	if (Array.isArray(imagesRaw)) {
		images = (imagesRaw as unknown[]).map((item: unknown) => String(item)).filter((s: string) => s.trim());
	}

	return {
		quote: (raw.quote as string) ?? DEFAULT_BANNER.quote,
		author: (raw.author as string) ?? DEFAULT_BANNER.author,
		image: (raw.image as string) ?? '',
		quoteColor: (raw.quoteColor as string) || undefined,
		quoteFont: (raw.quoteFont as string) || undefined,
		quotes,
		images,
		mode: raw.mode === 'stats' ? 'stats' : 'quote',
		statsConfig: parseStatsConfig(raw.statsConfig),
	};
}
function parseStatsConfig(raw: unknown): BannerStatsConfig | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const r = raw as Record<string, unknown>;
	const cfg: BannerStatsConfig = {};
	if (typeof r.dailyFolder === 'string' && r.dailyFolder) cfg.dailyFolder = r.dailyFolder;
	if (typeof r.dailyFormat === 'string' && r.dailyFormat) cfg.dailyFormat = r.dailyFormat;
	if (typeof r.streakFromDaily === 'boolean') cfg.streakFromDaily = r.streakFromDaily;
	if (Array.isArray(r.excludeFolders)) {
		const folders = r.excludeFolders.filter((f): f is string => typeof f === 'string' && f.trim() !== '');
		if (folders.length > 0) cfg.excludeFolders = folders;
	}
	if (typeof r.accent === 'string' && r.accent) cfg.accent = r.accent;
	if (typeof r.blur === 'number') cfg.blur = r.blur;
	if (typeof r.darkness === 'number') cfg.darkness = r.darkness;
	if (typeof r.showDetails === 'boolean') cfg.showDetails = r.showDetails;
	if (typeof r.showLeft === 'boolean') cfg.showLeft = r.showLeft;
	if (typeof r.showCenter === 'boolean') cfg.showCenter = r.showCenter;
	if (typeof r.showRight === 'boolean') cfg.showRight = r.showRight;
	if (typeof r.leftStat === 'string') cfg.leftStat = r.leftStat as BannerLeftStat;
	if (typeof r.centerStat === 'string') cfg.centerStat = r.centerStat as BannerCenterStat;
	if (r.heatmapSource === 'notes' || r.heatmapSource === 'habit') cfg.heatmapSource = r.heatmapSource;
	if (typeof r.heatmapHabitId === 'string' && r.heatmapHabitId) cfg.heatmapHabitId = r.heatmapHabitId;
	if (Array.isArray(r.rightStats)) {
		const stats = r.rightStats.filter((s): s is BannerRightStat => typeof s === 'string');
		if (stats.length > 0) cfg.rightStats = stats;
	}
	return Object.keys(cfg).length > 0 ? cfg : undefined;
}
export function parseQuickActions(fm: Record<string, unknown>): QuickAction[] {
	const rawActions = fm.quickActions;
	if (Array.isArray(rawActions)) {
		return rawActions
			.map((item: Record<string, string>) => ({
				name: item.name ?? '',
				icon: item.icon ?? (item.type === 'command' ? 'terminal' : 'file-text'),
				type: item.type === 'command' ? ('command' as const) : ('file' as const),
				target: item.target ?? '',
			}))
			.filter((a) => a.name && a.target);
	}

	// Backward compat: migrate old quickLinks
	const rawLinks = fm.quickLinks;
	if (Array.isArray(rawLinks)) {
		return rawLinks
			.map((item: Record<string, string>) => ({
				name: item.name ?? '',
				icon: 'file-text',
				type: 'file' as const,
				target: item.path ?? '',
			}))
			.filter((a) => a.name && a.target);
	}

	return [];
}
export function parseQuickActionOrder(fm: Record<string, unknown>): string[] | undefined {
	const raw = fm.quickActionOrder;
	if (Array.isArray(raw) && raw.length > 0) {
		return raw.map((v: unknown) => String(v));
	}
	return undefined;
}
export function parseHiddenPresets(fm: Record<string, unknown>): string[] | undefined {
	const raw = fm.hiddenPresets;
	if (Array.isArray(raw) && raw.length > 0) {
		return raw.map((v: unknown) => String(v));
	}
	return undefined;
}
export function parseColumnDefs(
	fm: Record<string, unknown>,
): Array<{
	name: string;
	color: string;
	sectionType?: string;
	libraryConfig?: LibraryConfig;
	wereadConfig?: WereadConfig;
	dataviewConfig?: DataviewConfig;
	webConfig?: WebEmbedConfig;
	height?: number;
	half?: boolean;
	width?: number;
}> {
	const raw = fm.columns;
	if (!Array.isArray(raw)) return DEFAULT_COLUMNS;

	return (raw as Array<Record<string, unknown>>).map((item) => ({
		name: String((item.name ?? 'Unnamed') as string | number | boolean),
		color: String((item.color ?? '#6366f1') as string | number | boolean),
		sectionType: item.type ? String(item.type as string | number | boolean) : undefined,
		libraryConfig: item.library ? parseLibraryConfig(item.library as Record<string, unknown>) : undefined,
		wereadConfig: item.weread ? parseWereadConfig(item.weread as Record<string, unknown>) : undefined,
		dataviewConfig: item.dataview ? parseDataviewConfig(item.dataview as Record<string, unknown>) : undefined,
		webConfig: item.web ? parseWebConfig(item.web as Record<string, unknown>) : undefined,
		height: typeof item.height === 'number' ? item.height : undefined,
		half: item.half === true ? true : undefined,
		width:
			typeof item.width === 'number' && item.width >= 20 && item.width <= 80 ? Math.round(item.width) : undefined,
	}));
}
export function parseColumns(
	body: string,
	defs: Array<{
		name: string;
		color: string;
		sectionType?: string;
		libraryConfig?: LibraryConfig;
		wereadConfig?: WereadConfig;
		dataviewConfig?: DataviewConfig;
		webConfig?: WebEmbedConfig;
		height?: number;
		half?: boolean;
		width?: number;
	}>,
): DashboardColumn[] {
	const sections = splitByH2(body);
	const defMap = new Map(defs.map((d) => [d.name, d]));
	const usedDefIndices = new Set<number>();

	const mapped = sections.map((section, sectionIdx) => {
		let def = defMap.get(section.heading);
		if (!def && sectionIdx < defs.length && !usedDefIndices.has(sectionIdx)) {
			def = defs[sectionIdx];
		}
		if (def) {
			const defIdx = defs.indexOf(def);
			usedDefIndices.add(defIdx);
		}
		const cards = parseCards(section.content, section.heading);
		const resolvedType = resolveSectionType(section.heading, cards, def?.sectionType);
		return {
			name: section.heading,
			color: def?.color ?? '#6366f1',
			sectionType: resolvedType,
			// Memo rendering includes task/doc trees; retain their structure on reload.
			cards,
			libraryConfig: def?.libraryConfig,
			wereadConfig: def?.wereadConfig,
			dataviewConfig: def?.dataviewConfig,
			webConfig: def?.webConfig,
			height: def?.height,
			half: def?.half,
			width: def?.half ? def?.width : undefined,
		};
	});
	// Self-heal hand-edited frontmatter: a lone `half: true` (or an odd run)
	// pairs with no one and would render as an orphan half-width row.
	return normalizeColumnPairs(mapped);
}
