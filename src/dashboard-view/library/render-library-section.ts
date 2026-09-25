import { App, Menu, Notice, TFile, setIcon } from 'obsidian';
import type { HoverParent } from 'obsidian';
import type { LibraryConfig, PropertyFilter, LibraryViewMode } from '../types';
import { t } from '../../shared/i18n';
import { showConfirmDialog } from '../ui/confirm-dialog';
import { createToolbarDropdown } from '../ui/toolbar-dropdown';
import { applyModalTheme } from '../appearance/modal-theme';
import {
	renderGalleryView,
	renderGridView,
	renderListView,
	renderTableView,
	trashLibraryFile,
} from './cover-candidate';
import {
	DEFAULT_PAGE_SIZE,
	LibraryFileResult,
	PAGE_SIZE_OPTIONS,
	extractFrontmatterProperties,
	libHoverParent,
	libOpener,
	localDateKey,
	queryVaultFiles,
	showCalendarPopup,
} from './library-file-result';
import { groupLibraryResults, renderKanbanView } from './library-result-group';

export function renderLibrarySection(
	el: HTMLElement,
	column: { name: string; color: string; sectionType?: string; libraryConfig?: LibraryConfig },
	app: App,
	onConfigChange: (config: LibraryConfig) => void,
	hoverParent: HoverParent | null = null,
	onOpenNote: ((file: TFile) => void) | null = null,
): void {
	libHoverParent.current = hoverParent;
	libOpener.current = onOpenNote;
	const config = column.libraryConfig ?? {
		filters: [] as PropertyFilter[],
		viewMode: 'grid' as LibraryViewMode,
		sortBy: 'modified',
		sortDesc: true,
	};
	const isFolder = column.sectionType === 'folder';

	const sectionContent = el.createDiv({ cls: 'dashboard-library-content' });

	// Toolbar
	const toolbar = sectionContent.createDiv({ cls: 'dashboard-library-toolbar' });

	// Search
	const searchInput = toolbar.createEl('input', {
		cls: 'dashboard-library-search',
		attr: { type: 'text', placeholder: t('library.searchPlaceholder') },
	});

	// Sort
	const sortSelect = toolbar.createEl('select', { cls: 'dashboard-library-sort' });
	const sortOptions = [
		{ value: 'modified', label: t('library.sortModified') },
		{ value: 'created', label: t('library.sortCreated') },
		{ value: 'name', label: t('library.sortName') },
	];
	for (const opt of sortOptions) {
		const option = sortSelect.createEl('option', { text: opt.label, attr: { value: opt.value } });
		if (opt.value === config.sortBy) option.selected = true;
	}

	// Sort direction toggle
	const sortDirBtn = toolbar.createDiv({ cls: 'dashboard-library-sort-dir' });
	setIcon(sortDirBtn, config.sortDesc ? 'arrow-down-wide-narrow' : 'arrow-up-wide-narrow');

	// View mode toggle: single dropdown button (current view's icon); the
	// native menu lists every view with a check on the active one.
	const viewToggle = toolbar.createDiv({ cls: 'dashboard-library-view-toggle' });
	const viewModes: LibraryViewMode[] = ['grid', 'gallery', 'list', 'table', 'kanban'];
	const viewIcons: Record<string, string> = {
		grid: 'layout-grid',
		gallery: 'image',
		list: 'list',
		table: 'table',
		kanban: 'columns',
	};
	const viewItems = viewModes.map((mode) => ({
		key: mode,
		label: t('library.view' + mode.charAt(0).toUpperCase() + mode.slice(1)),
		icon: viewIcons[mode] ?? 'file',
	}));
	const buildViewToggle = (): void => {
		viewToggle.empty();
		createToolbarDropdown(viewToggle, config.viewMode, viewItems, (key) => {
			const mode = key as LibraryViewMode;
			const newConfig = { ...config, viewMode: mode };
			onConfigChange(newConfig);
			Object.assign(config, { viewMode: mode });
			applySizeToggleVisibility(mode);
			applyGroupToggleVisibility(mode);
			currentPage = 1;
			buildViewToggle();
			renderContent(config);
		});
	};

	// Card size toggle (small / medium / large) — meaningful only for the two
	// card views, so it hides while list/table/kanban is active. Same single
	// dropdown pattern; the collapsed button shows the current letter.
	const cardViews: LibraryViewMode[] = ['grid', 'gallery'];
	const sizeToggle = toolbar.createDiv({ cls: 'dashboard-library-view-toggle dashboard-library-size-toggle' });
	const sizeLabels: Record<NonNullable<LibraryConfig['cardSize']>, string> = { small: 'S', medium: 'M', large: 'L' };
	const sizeItems = (['small', 'medium', 'large'] as const).map((s) => ({
		key: s,
		label: t(`library.size${s.charAt(0).toUpperCase()}${s.slice(1)}`),
		short: sizeLabels[s],
	}));
	const buildSizeToggle = (): void => {
		sizeToggle.empty();
		const current = config.cardSize ?? 'medium';
		createToolbarDropdown(sizeToggle, current, sizeItems, (key) => {
			const s = key as NonNullable<LibraryConfig['cardSize']>;
			const newConfig = { ...config, cardSize: s };
			onConfigChange(newConfig);
			Object.assign(config, { cardSize: s });
			buildSizeToggle();
			renderContent(config);
		});
	};
	const applySizeToggleVisibility = (mode: LibraryViewMode): void => {
		sizeToggle.toggleClass('is-hidden', !cardViews.includes(mode));
	};
	buildViewToggle();
	buildSizeToggle();
	applySizeToggleVisibility(config.viewMode);

	// View grouping toggle (grid/gallery/list/table): none / by folder / by a
	// frontmatter property. Kanban keeps its own config-modal grouping, so the
	// pill hides there. The menu is built natively (not via
	// createToolbarDropdown) because property items must be read from the vault
	// at MENU-OPEN time — new properties appear without a section rebuild — and
	// because the item list needs separators.
	const groupableViews: LibraryViewMode[] = ['grid', 'gallery', 'list', 'table'];
	const groupToggle = toolbar.createDiv({ cls: 'dashboard-library-view-toggle dashboard-library-group-toggle' });
	const currentGroupKey = (): string =>
		config.viewGroupMode === 'folder'
			? 'folder'
			: config.viewGroupMode === 'property' && config.viewGroupBy
				? `prop:${config.viewGroupBy}`
				: 'none';
	const groupTitle = (): string => {
		const k = currentGroupKey();
		return k === 'folder'
			? `${t('library.viewGroup')}: ${t('library.groupByFolder')}`
			: k.startsWith('prop:')
				? `${t('library.viewGroup')}: ${k.slice(5)}`
				: t('library.viewGroup');
	};
	const applyGroupToggleVisibility = (mode: LibraryViewMode): void => {
		groupToggle.toggleClass('is-hidden', !groupableViews.includes(mode));
	};
	const pickGroup = (key: string): void => {
		// Re-picking the already-active option: no dashboard write, no re-render
		// (same guard as createToolbarDropdown's onPick).
		if (key === currentGroupKey()) return;
		const viewGroupMode =
			key === 'folder' ? ('folder' as const) : key.startsWith('prop:') ? ('property' as const) : undefined;
		const viewGroupBy = key.startsWith('prop:') ? key.slice(5) : undefined;
		// Collapse keys are raw folder/property values — meaningless once the
		// grouping dimension changes, so start fresh.
		collapsedGroups.clear();
		onConfigChange({ ...config, viewGroupMode, viewGroupBy });
		Object.assign(config, { viewGroupMode, viewGroupBy });
		currentPage = 1;
		buildGroupToggle();
		renderContent(config);
	};
	const buildGroupToggle = (): void => {
		groupToggle.empty();
		const btn = groupToggle.createDiv({
			cls: 'dashboard-library-view-btn',
			attr: { 'aria-haspopup': 'menu' },
		});
		btn.title = groupTitle();
		btn.setAttribute('aria-label', groupTitle());
		setIcon(btn, 'rows-3');
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			const current = currentGroupKey();
			const menu = new Menu();
			menu.addItem((mi) =>
				mi
					.setTitle(t('library.viewGroupNone'))
					.setChecked(current === 'none')
					.onClick(() => pickGroup('none')),
			);
			menu.addSeparator();
			menu.addItem((mi) =>
				mi
					.setTitle(t('library.groupByFolder'))
					.setIcon('folder')
					.setChecked(current === 'folder')
					.onClick(() => pickGroup('folder')),
			);
			menu.addSeparator();
			// Property keys from the live vault: pseudo filter-properties
			// (modified/created/path) are not groupable; 'tags' leads the list.
			const keys = [...extractFrontmatterProperties(app).keys()]
				.filter((k) => k !== 'modified' && k !== 'created' && k !== 'path' && k !== 'tags')
				.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
			for (const key of ['tags', ...keys]) {
				menu.addItem((mi) =>
					mi
						.setTitle(key)
						.setChecked(current === `prop:${key}`)
						.onClick(() => pickGroup(`prop:${key}`)),
				);
			}
			btn.setAttribute('aria-expanded', 'true');
			menu.onHide(() => btn.setAttribute('aria-expanded', 'false'));
			menu.showAtMouseEvent(e);
		});
	};
	buildGroupToggle();
	applyGroupToggleVisibility(config.viewMode);

	// One-click collapse/expand for EVERY group at once (grouped views only;
	// the visibility flip lives in renderContent where isGrouped is known).
	// Follows the per-group header toggle's in-place discipline: flip
	// collapsedGroups and the DOM classes/chevrons directly, never re-query
	// the vault. The button reflects the CURRENT state — chevrons-down-up
	// ("collapse all") while any group is open, chevrons-up-down ("expand
	// all") once everything is folded.
	const collapseToggle = toolbar.createDiv({
		cls: 'dashboard-library-view-toggle dashboard-library-collapse-toggle',
	});
	const collapseBtn = collapseToggle.createDiv({
		cls: 'dashboard-library-view-btn',
		attr: { 'aria-label': t('library.collapseAllGroups'), title: t('library.collapseAllGroups') },
	});
	setIcon(collapseBtn, 'chevrons-down-up');
	const updateCollapseToggle = (): void => {
		const headers = Array.from(contentArea.querySelectorAll<HTMLElement>('.dashboard-library-group-header'));
		const collapse = headers.some((h) => !h.hasClass('is-collapsed'));
		collapseBtn.empty();
		setIcon(collapseBtn, collapse ? 'chevrons-down-up' : 'chevrons-up-down');
		const label = collapse ? t('library.collapseAllGroups') : t('library.expandAllGroups');
		collapseBtn.title = label;
		collapseBtn.setAttribute('aria-label', label);
	};
	collapseBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const headers = Array.from(contentArea.querySelectorAll<HTMLElement>('.dashboard-library-group-header'));
		if (headers.length === 0) return;
		const collapse = headers.some((h) => !h.hasClass('is-collapsed'));
		for (const header of headers) {
			const key = header.dataset.groupKey ?? '';
			const body = header.nextElementSibling;
			const chevron = header.querySelector<HTMLElement>('.dashboard-library-group-chevron');
			if (collapse) {
				collapsedGroups.add(key);
				header.addClass('is-collapsed');
				body?.addClass('is-hidden');
				if (chevron) setIcon(chevron, 'chevron-right');
			} else {
				collapsedGroups.delete(key);
				header.removeClass('is-collapsed');
				body?.removeClass('is-hidden');
				if (chevron) setIcon(chevron, 'chevron-down');
			}
		}
		updateCollapseToggle();
	});

	// Quick date filter button
	const filterBtn = toolbar.createDiv({ cls: 'dashboard-library-filter-btn' });
	setIcon(filterBtn, 'filter');
	filterBtn.title = t('library.quickFilter');

	// Quick date filter state (separate from config.filters)
	let quickProp: 'created' | 'modified' = config.quickDateFilter?.property ?? 'created';
	let quickStart = config.quickDateFilter?.start ?? '';
	let quickEnd = config.quickDateFilter?.end ?? '';
	// Rolling "last N days" window (0 = off). Takes precedence over fixed dates.
	let quickDays = config.quickDateFilter?.days ?? 0;

	// Popup
	let filterPopup: HTMLElement | null = null;
	// Legacy funnel folders (folderFilter): the quick-filter popup no longer
	// edits them, but they still filter and the popup's clear button drops them.
	let funnelFolders: string[] = [...(config.folderFilter ?? [])];

	function applyQuickFilter(): void {
		config.quickDateFilter =
			quickStart || quickEnd || quickDays > 0
				? {
						property: quickProp,
						// A rolling window owns the range; fixed dates only apply when it is off.
						start: quickDays > 0 ? '' : quickStart,
						end: quickDays > 0 ? '' : quickEnd,
						...(quickDays > 0 ? { days: quickDays } : {}),
					}
				: undefined;
		onConfigChange({ ...config });
		currentPage = 1;
		renderContent(config);
		updateFilterBtnState();
	}

	function applyFunnelFolders(): void {
		config.folderFilter = funnelFolders.length > 0 ? [...funnelFolders] : undefined;
		onConfigChange({ ...config });
		currentPage = 1;
		renderContent(config);
		updateFilterBtnState();
	}

	function openPopup(): void {
		closePopup();
		filterPopup = activeDocument.body.createDiv({ cls: 'dashboard-library-filter-popup' });

		// Mirror the active dashboard's --db-* tokens onto the popup — it
		// lives on <body>, outside the themed root.
		applyModalTheme(filterPopup);

		// Position below the filter button
		const rect = filterBtn.getBoundingClientRect();
		filterPopup.setCssProps({
			position: 'fixed',
			top: `${rect.bottom + 4}px`,
			left: `${rect.left}px`,
			zIndex: '10000',
		});

		// Popup title
		filterPopup.createDiv({ cls: 'dashboard-library-quickfilter-title', text: t('library.quickFilterTitle') });

		// Property selector + single date-range button in one row
		const propRow = filterPopup.createDiv({
			cls: 'dashboard-library-quickfilter-row dashboard-library-quickfilter-row--main',
		});
		const propSelect = propRow.createEl('select', { cls: 'dashboard-library-filter-popup-prop' });
		propSelect.createEl('option', { text: t('library.created'), attr: { value: 'created' } });
		propSelect.createEl('option', { text: t('library.modified'), attr: { value: 'modified' } });
		propSelect.value = quickProp;
		propSelect.addEventListener('change', () => {
			quickProp = propSelect.value as 'created' | 'modified';
		});
		const rangeBtn = propRow.createEl('button', {
			cls:
				'dashboard-library-filter-date-btn dashboard-library-filter-range-btn' +
				(quickStart || quickEnd ? ' has-value' : ''),
			text: quickStart || quickEnd ? `${quickStart || '…'} ~ ${quickEnd || '…'}` : t('library.filterDateRange'),
		});
		rangeBtn.addEventListener('click', (ev) => {
			ev.stopPropagation();
			showCalendarPopup(rangeBtn, quickStart, quickEnd, (start, end) => {
				quickStart = start;
				quickEnd = end;
				quickDays = 0; // an explicit range replaces the rolling window
				applyQuickFilter();
				if (activeDocument.body.contains(filterBtn)) openPopup();
			});
		});

		// Quick rolling-window presets: "last N days". Evaluated relative to
		// today on every render, so a preset chosen last week still means
		// "recently" instead of pointing at a stale fixed range. Clicking an
		// active preset again turns it off.
		const rangeRow = filterPopup.createDiv({ cls: 'dashboard-library-quickfilter-row' });
		rangeRow.createDiv({ cls: 'dashboard-library-quickfilter-label', text: t('library.quickRange') });
		const rangeChips = rangeRow.createDiv({ cls: 'dashboard-library-filter-popup-dates' });
		for (const days of [3, 7, 30]) {
			const chip = rangeChips.createEl('button', {
				cls: 'dashboard-library-filter-date-btn' + (quickDays === days ? ' has-value' : ''),
				text: t('library.lastNDays', { n: days }),
			});
			chip.addEventListener('click', (ev) => {
				ev.stopPropagation();
				quickDays = quickDays === days ? 0 : days;
				if (quickDays > 0) {
					quickStart = '';
					quickEnd = '';
				}
				applyQuickFilter();
				if (activeDocument.body.contains(filterBtn)) openPopup();
			});
		}

		// Clear button. Also drops legacy funnel folders configured by older
		// versions (the popup no longer edits them).
		if (quickStart || quickEnd || quickDays > 0 || funnelFolders.length > 0) {
			const clearBtn = filterPopup.createEl('button', {
				cls: 'dashboard-library-filter-popup-clear',
				text: t('library.clearFilters'),
			});
			clearBtn.addEventListener('click', (ev) => {
				ev.stopPropagation();
				quickStart = '';
				quickEnd = '';
				quickDays = 0;
				funnelFolders = [];
				applyQuickFilter();
				applyFunnelFolders();
				closePopup();
			});
		}
	}

	function closePopup(): void {
		if (filterPopup) {
			filterPopup.remove();
			filterPopup = null;
		}
	}

	function updateFilterBtnState(): void {
		// An active filter highlights the funnel button only; the specifics
		// live inside the popup. Surfacing filter details as chips in the
		// toolbar was tried and reverted at the user's request — sections
		// must stay visually quiet, matching the folder sections.
		filterBtn.classList.toggle(
			'active',
			!!(quickStart || quickEnd || quickDays > 0 || (config.folderFilter?.length ?? 0) > 0),
		);
	}

	filterBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		if (filterPopup) {
			closePopup();
		} else {
			openPopup();
		}
	});

	activeDocument.addEventListener('click', (e) => {
		if (!filterPopup) return;
		const target = e.target as Node;
		if (filterPopup.contains(target) || filterBtn.contains(target)) return;
		if (target.instanceOf(Element) && target.closest('.modal-container')) return;
		closePopup();
	});

	// An active filter highlights the button (accent color); the details
	// live only inside the popup, so the toolbar stays uncluttered.
	updateFilterBtnState();

	// Spacer
	toolbar.createDiv({ cls: 'dashboard-library-toolbar-spacer' });

	// File count
	const countEl = toolbar.createDiv({ cls: 'dashboard-library-count' });

	// Page size selector
	const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
	const pageSizeSelect = toolbar.createEl('select', { cls: 'dashboard-library-page-size' });
	for (const size of PAGE_SIZE_OPTIONS) {
		const opt = pageSizeSelect.createEl('option', {
			text: t('library.pageSize', { count: size }),
			attr: { value: String(size) },
		});
		if (size === pageSize) opt.selected = true;
	}
	pageSizeSelect.addEventListener('change', () => {
		const newSize = parseInt(pageSizeSelect.value) || DEFAULT_PAGE_SIZE;
		Object.assign(config, { pageSize: newSize });
		onConfigChange({ ...config });
		currentPage = 1;
		renderContent(config);
	});

	// New note button — creates a note inside this section's folder(s), or at the
	// global library path with the section's filters pre-filled (handled in view.ts).
	const newNoteBtn = toolbar.createDiv({ cls: 'dashboard-library-newnote-btn' });
	setIcon(newNoteBtn, 'file-plus');
	newNoteBtn.title = t('library.newNote');
	newNoteBtn.setAttribute('aria-label', t('library.newNote'));

	// Configure button
	const configBtn = toolbar.createDiv({ cls: 'dashboard-library-config-btn' });
	setIcon(configBtn, 'settings');
	configBtn.title = t('library.configure');

	// Content area
	const contentArea = sectionContent.createDiv({ cls: 'dashboard-library-files' });

	// Pagination area
	const paginationArea = sectionContent.createDiv({ cls: 'dashboard-library-pagination' });

	let currentPage = 1;
	// Collapsed group headers (runtime state, not persisted) — keys from
	// groupLibraryResults; toggled in place without re-querying the vault.
	const collapsedGroups = new Set<string>();

	async function deleteLibraryFileWithConfirm(file: TFile): Promise<void> {
		const confirmed = await showConfirmDialog(app, {
			title: t('common.confirmDelete'),
			message: t('library.confirmDelete', { name: file.basename }),
		});
		if (!confirmed) return;
		try {
			await trashLibraryFile(app, file);
			new Notice(t('library.deleted'));
			renderContent(config);
		} catch (err) {
			console.error('[Dashboard] library delete failed:', err);
			new Notice(t('library.deleteFailed'));
		}
	}

	function renderContent(currentConfig: LibraryConfig): void {
		contentArea.empty();
		paginationArea.empty();
		// Tag the current view so CSS can give the kanban its own (Trello-style)
		// scrolling layout without affecting grid/list/table.
		contentArea.dataset.viewMode = currentConfig.viewMode;

		let results = queryVaultFiles(app, currentConfig);

		// Apply search
		const search = searchInput.value.trim().toLowerCase();
		if (search) {
			results = results.filter((r) => r.basename.toLowerCase().includes(search));
		}

		// Apply quick date filter
		if (currentConfig.quickDateFilter) {
			const qdf = currentConfig.quickDateFilter;
			// A rolling "last N days" window is computed against today at
			// render time, so the preset never goes stale; otherwise the
			// fixed calendar range applies. Both compare in local dates.
			const days = typeof qdf.days === 'number' && qdf.days > 0 ? qdf.days : 0;
			const startStr = days > 0 ? localDateKey(Date.now() - (days - 1) * 86400000) : qdf.start;
			const endStr = days > 0 ? localDateKey(Date.now()) : qdf.end;
			if (startStr || endStr) {
				results = results.filter((r) => {
					const ts = qdf.property === 'modified' ? r.mtime : r.ctime;
					const dateStr = localDateKey(ts);
					if (startStr && dateStr < startStr) return false;
					if (endStr && dateStr > endStr) return false;
					return true;
				});
			}
		}

		// Apply folder funnel filter (OR across selected folders)
		if (currentConfig.folderFilter && currentConfig.folderFilter.length > 0) {
			const ff = currentConfig.folderFilter
				.map((f) => f.trim().replace(/^\/+|\/+$/g, ''))
				.filter((f) => f.length > 0);
			if (ff.length > 0) {
				results = results.filter((r) => {
					const lp = r.file.path.toLowerCase();
					return ff.some((f) => lp.startsWith(f.toLowerCase() + '/'));
				});
			}
		}

		const totalResults = results.length;
		countEl.textContent = t('library.fileCount', { count: totalResults });

		// Grouped mode (grid/gallery/list/table): paging chrome is meaningless.
		// A hand-edited 'property' mode without a key degrades to the flat view
		// so the menu checkmark and the rendered state stay in sync.
		const isGrouped =
			currentConfig.viewMode !== 'kanban' &&
			(currentConfig.viewGroupMode === 'folder' ||
				(currentConfig.viewGroupMode === 'property' && !!currentConfig.viewGroupBy));
		pageSizeSelect.toggleClass('is-hidden', isGrouped);
		collapseToggle.toggleClass('is-hidden', !isGrouped);

		if (
			totalResults === 0 &&
			currentConfig.filters.length === 0 &&
			!(currentConfig.folders && currentConfig.folders.length)
		) {
			contentArea.createDiv({ cls: 'dashboard-library-empty', text: t('library.noConfig') });
			return;
		}

		if (totalResults === 0) {
			contentArea.createDiv({ cls: 'dashboard-library-empty', text: t('library.noFiles') });
			return;
		}

		// Paginate (kanban scrolls horizontally; grouped mode shows every group
		// intact — slicing pages would tear the groups apart, mirroring the
		// media section's grouped mode).
		const isKanban = currentConfig.viewMode === 'kanban';
		const skipPagination = isKanban || isGrouped;
		const effectivePageSize = skipPagination ? totalResults : (currentConfig.pageSize ?? DEFAULT_PAGE_SIZE);
		const totalPages = skipPagination ? 1 : Math.ceil(totalResults / effectivePageSize);
		if (currentPage > totalPages) currentPage = totalPages;
		if (currentPage < 1) currentPage = 1;

		const startIdx = skipPagination ? 0 : (currentPage - 1) * effectivePageSize;
		const endIdx = skipPagination ? totalResults : Math.min(startIdx + effectivePageSize, totalResults);
		const pageResults = results.slice(startIdx, endIdx);

		const renderView = (host: HTMLElement, items: LibraryFileResult[]): void => {
			switch (currentConfig.viewMode) {
				case 'grid':
					renderGridView(host, items, app, isFolder, currentConfig);
					break;
				case 'gallery':
					renderGalleryView(host, items, app, isFolder, currentConfig);
					break;
				case 'list':
					renderListView(host, items, app);
					break;
				case 'table':
					renderTableView(host, items, app, currentConfig, (f) => {
						void deleteLibraryFileWithConfirm(f);
					});
					break;
			}
		};

		if (isGrouped) {
			const groups = groupLibraryResults(
				pageResults,
				currentConfig.viewGroupMode === 'folder' ? 'folder' : 'property',
				currentConfig.viewGroupBy,
				currentConfig.folders ?? [],
			);
			for (const group of groups) {
				const collapsed = collapsedGroups.has(group.key);
				const header = contentArea.createDiv({
					cls:
						'dashboard-library-group-header' +
						(collapsed ? ' is-collapsed' : '') +
						(group.isNoGroup ? ' is-nogroup' : ''),
				});
				// Key for the collapse-all sweep (it syncs collapsedGroups from
				// the rendered headers instead of re-querying the vault).
				header.dataset.groupKey = group.key;
				const chevron = header.createDiv({ cls: 'dashboard-library-group-chevron' });
				setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');
				header.createDiv({ cls: 'dashboard-library-group-name', text: group.label });
				header.createDiv({ cls: 'dashboard-library-group-count', text: String(group.items.length) });
				const body = contentArea.createDiv({ cls: 'dashboard-library-group-body' });
				if (collapsed) body.addClass('is-hidden');
				// Collapse in place (no vault re-query): flip the set and the
				// two elements' classes/chevron directly.
				header.addEventListener('click', () => {
					if (collapsedGroups.has(group.key)) {
						collapsedGroups.delete(group.key);
						header.removeClass('is-collapsed');
						body.removeClass('is-hidden');
						setIcon(chevron, 'chevron-down');
					} else {
						collapsedGroups.add(group.key);
						header.addClass('is-collapsed');
						body.addClass('is-hidden');
						setIcon(chevron, 'chevron-right');
					}
					updateCollapseToggle();
				});
				renderView(body, group.items);
			}
			// No groups rendered (filters emptied everything): the sweep has
			// nothing to act on, so hide the button entirely.
			if (groups.length === 0) collapseToggle.addClass('is-hidden');
			else updateCollapseToggle();
		} else if (isKanban) {
			renderKanbanView(contentArea, pageResults, app, currentConfig);
		} else {
			renderView(contentArea, pageResults);
		}

		// Render pagination controls (kanban scrolls horizontally, no pagination)
		if (!skipPagination && totalPages > 1) {
			renderPagination(paginationArea, currentPage, totalPages, totalResults, (page) => {
				currentPage = page;
				renderContent(currentConfig);
				// Scroll to top of section content
				sectionContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			});
		}
	}

	// Search handler
	let searchTimer: number | null = null;
	searchInput.addEventListener('input', () => {
		if (searchTimer) window.clearTimeout(searchTimer);
		searchTimer = window.setTimeout(() => {
			currentPage = 1;
			renderContent(config);
		}, 200);
	});

	// Sort handlers
	sortSelect.addEventListener('change', () => {
		config.sortBy = sortSelect.value;
		onConfigChange(config);
		currentPage = 1;
		renderContent(config);
	});

	sortDirBtn.addEventListener('click', () => {
		config.sortDesc = !config.sortDesc;
		setIcon(sortDirBtn, config.sortDesc ? 'arrow-down-wide-narrow' : 'arrow-up-wide-narrow');
		onConfigChange(config);
		currentPage = 1;
		renderContent(config);
	});

	// Config button handler - will be wired in view.ts via custom event
	configBtn.addEventListener('click', () => {
		const event = new CustomEvent('dashboard-library-config', {
			detail: { columnName: column.name },
			bubbles: true,
		});
		el.dispatchEvent(event);
	});

	// New note button handler - will be wired in view.ts via custom event
	// (x/y anchor the folder-picker menu for sections with several folders)
	newNoteBtn.addEventListener('click', (ev) => {
		const event = new CustomEvent('dashboard-library-new-note', {
			detail: { columnName: column.name, x: ev.clientX, y: ev.clientY },
			bubbles: true,
		});
		el.dispatchEvent(event);
	});

	// Initial render
	renderContent(config);
}
export function renderPagination(
	container: HTMLElement,
	currentPage: number,
	totalPages: number,
	totalResults: number,
	onPageChange: (page: number) => void,
): void {
	const nav = container.createDiv({ cls: 'dashboard-library-pagination-nav' });

	// Previous button
	const prevBtn = nav.createDiv({
		cls: 'dashboard-library-pagination-btn' + (currentPage <= 1 ? ' disabled' : ''),
		text: '<',
	});
	if (currentPage > 1) {
		prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
	}

	// Page buttons
	const maxVisible = 5;
	let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
	const endPage = Math.min(totalPages, startPage + maxVisible - 1);
	startPage = Math.max(1, endPage - maxVisible + 1);

	if (startPage > 1) {
		const firstBtn = nav.createDiv({ cls: 'dashboard-library-pagination-page', text: '1' });
		firstBtn.addEventListener('click', () => onPageChange(1));
		if (startPage > 2) {
			nav.createDiv({ cls: 'dashboard-library-pagination-ellipsis', text: '...' });
		}
	}

	for (let i = startPage; i <= endPage; i++) {
		const pageBtn = nav.createDiv({
			cls: 'dashboard-library-pagination-page' + (i === currentPage ? ' active' : ''),
			text: String(i),
		});
		if (i !== currentPage) {
			pageBtn.addEventListener('click', () => onPageChange(i));
		}
	}

	if (endPage < totalPages) {
		if (endPage < totalPages - 1) {
			nav.createDiv({ cls: 'dashboard-library-pagination-ellipsis', text: '...' });
		}
		const lastBtn = nav.createDiv({ cls: 'dashboard-library-pagination-page', text: String(totalPages) });
		lastBtn.addEventListener('click', () => onPageChange(totalPages));
	}

	// Next button
	const nextBtn = nav.createDiv({
		cls: 'dashboard-library-pagination-btn' + (currentPage >= totalPages ? ' disabled' : ''),
		text: '>',
	});
	if (currentPage < totalPages) {
		nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
	}
}
