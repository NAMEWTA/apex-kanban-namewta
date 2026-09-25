import { App, Notice, Platform, TFile } from 'obsidian';
import type { LibraryConfig } from '../types';
import { t } from '../../shared/i18n';
import { KANBAN_FILE_DRAG_TYPE } from '../ui/dnd';
import {
	CoverCandidate,
	attachItemHover,
	extractCoverValue,
	folderGroupKey,
	omitFrontmatterKey,
	openFile,
	parentOf,
	renderPlaceholderCover,
	renderPropertyBadges,
	resolveLibraryCover,
	scanRootMatch,
} from './cover-candidate';
import { LibraryFileResult, formatDate, str } from './library-file-result';

function folderGroupPath(filePath: string, scanFolders: string[]): string | undefined {
	const m = scanRootMatch(filePath, scanFolders);
	if (m) {
		const parent = parentOf(filePath);
		if (m.rel === '') return parent;
		const trueRoot = parent.slice(0, parent.length - m.rel.length - 1);
		return `${trueRoot}/${m.rel.split('/')[0]}`;
	}
	const parent = parentOf(filePath);
	if (parent === '') return undefined;
	return parent.split('/')[0] ?? undefined;
}
interface KanbanDragState {
	file: TFile | null;
	cardEl: HTMLElement | null;
	/** Group key of the column the drag started in (null = the not-set column).
	 *  Property-mode drops use it to swap only the dragged-from value when the
	 *  group property is multi-valued. */
	fromKey: string | null;
}
function buildKanbanGroupFolders(results: LibraryFileResult[], scanFolders: string[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const result of results) {
		const key = folderGroupKey(result.file.path, scanFolders);
		if (key === undefined || map.has(key)) continue;
		const folder = folderGroupPath(result.file.path, scanFolders);
		if (folder !== undefined) map.set(key, folder);
	}
	return map;
}
function ancestorGroupKeys(groupFolders: Map<string, string>): Set<string> {
	const paths = [...groupFolders.values()].map((p) => p.toLowerCase().replace(/\/+$/, ''));
	const suppressed = new Set<string>();
	for (const [key, path] of groupFolders) {
		const lp = path.toLowerCase().replace(/\/+$/, '');
		if (paths.some((other) => other !== lp && other.startsWith(lp + '/'))) suppressed.add(key);
	}
	return suppressed;
}
export interface LibraryResultGroup {
	/** Collapse-set identity. The not-set bucket uses a control-character
	 * sentinel so it can never collide with a real folder/property value. */
	key: string;
	/** Header text. */
	label: string;
	/** The missing-value bucket — rendered last with muted styling. */
	isNoGroup: boolean;
	items: LibraryFileResult[];
}
export function groupLibraryResults(
	results: LibraryFileResult[],
	mode: 'folder' | 'property',
	propKey: string | undefined,
	scanFolders: string[],
): LibraryResultGroup[] {
	const groups = new Map<string, LibraryFileResult[]>();
	const noGroup: LibraryFileResult[] = [];
	for (const result of results) {
		if (mode === 'folder') {
			const key = folderGroupKey(result.file.path, scanFolders);
			if (key === undefined) {
				noGroup.push(result);
				continue;
			}
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(result);
			continue;
		}
		const value = result.frontmatter[propKey ?? ''];
		if (value == null) {
			noGroup.push(result);
			continue;
		}
		if (Array.isArray(value)) {
			for (const v of value) {
				const key = String(v);
				if (!groups.has(key)) groups.set(key, []);
				groups.get(key)!.push(result);
			}
		} else {
			const key = str(value);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(result);
		}
	}
	if (mode === 'folder') {
		const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
		groups.clear();
		for (const entry of sorted) groups.set(entry[0], entry[1]);
	}
	const out: LibraryResultGroup[] = [...groups.entries()].map(([key, items]) => ({
		key,
		label: key,
		isNoGroup: false,
		items,
	}));
	if (noGroup.length > 0)
		out.push({ key: '\u0000__nogroup__', label: t('library.notSet'), isNoGroup: true, items: noGroup });
	return out;
}
function attachKanbanCardDrag(
	card: HTMLElement,
	file: TFile,
	fromKey: string | null,
	state: KanbanDragState,
	hint: string,
): void {
	card.setAttribute('draggable', 'true');
	card.title = hint;
	card.addEventListener('dragstart', (e) => {
		state.file = file;
		state.cardEl = card;
		state.fromKey = fromKey;
		card.addClass('dashboard-library-kanban-card--dragging');
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			// Custom type only: a bare text/plain payload would insert literal
			// text wherever else the card gets dropped (editor, search, ...).
			e.dataTransfer.setData(KANBAN_FILE_DRAG_TYPE, file.path);
		}
	});
	card.addEventListener('dragend', () => {
		state.file = null;
		state.cardEl = null;
		state.fromKey = null;
		card.removeClass('dashboard-library-kanban-card--dragging');
		activeDocument
			.querySelectorAll('.dashboard-library-kanban-col--drag-over')
			.forEach((el) => (el as HTMLElement).removeClass('dashboard-library-kanban-col--drag-over'));
	});
}
function attachKanbanColumnDrop(
	col: HTMLElement,
	accepts: boolean,
	onDrop: (file: TFile, cardEl: HTMLElement) => void,
	state: KanbanDragState,
): void {
	const onDragOver = (e: DragEvent) => {
		if (!e.dataTransfer || !e.dataTransfer.types.includes(KANBAN_FILE_DRAG_TYPE)) return;
		// Claim the event so the enclosing .dashboard-section-row dragover in
		// dnd.ts doesn't highlight the whole section row behind the kanban.
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = accepts ? 'move' : 'none';
		col.toggleClass('dashboard-library-kanban-col--drag-over', accepts);
	};
	const onDragLeave = (e: DragEvent) => {
		const rect = col.getBoundingClientRect();
		if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
			col.removeClass('dashboard-library-kanban-col--drag-over');
		}
	};
	const onDropEvent = (e: DragEvent) => {
		if (!state.file || !state.cardEl) return;
		e.preventDefault();
		e.stopPropagation();
		col.removeClass('dashboard-library-kanban-col--drag-over');
		if (accepts) onDrop(state.file, state.cardEl);
	};
	col.addEventListener('dragover', onDragOver);
	col.addEventListener('dragleave', onDragLeave);
	col.addEventListener('drop', onDropEvent);
}
const kanbanMovesInFlight = new Set<TFile>();
async function moveKanbanCard(
	app: App,
	file: TFile,
	targetFolder: string,
	cardEl: HTMLElement,
	targetCol: HTMLElement,
): Promise<void> {
	const newPath = `${targetFolder}/${file.name}`;
	// Already at the group root (dropped on its own column): silent no-op.
	if (file.path === newPath) return;
	// A previous drop of this file is still renaming — let it finish.
	if (kanbanMovesInFlight.has(file)) return;
	// The group map can hold a folder deleted since the section rendered.
	if (!app.vault.getAbstractFileByPath(targetFolder)) {
		new Notice(t('library.moveFailed'));
		return;
	}
	if (app.vault.getAbstractFileByPath(newPath)) {
		new Notice(t('library.moveNameConflict', { name: file.basename, folder: targetFolder }));
		return;
	}
	const originParent = cardEl.parentNode;
	const originNext = cardEl.nextSibling;
	kanbanMovesInFlight.add(file);
	targetCol.appendChild(cardEl);
	refreshKanbanColumnCount(targetCol);
	if (originParent instanceof HTMLElement) refreshKanbanColumnCount(originParent);
	try {
		// renameFile respects the user's "auto-update internal links" setting.
		await app.fileManager.renameFile(file, newPath);
		new Notice(t('library.moved', { name: file.basename, folder: targetFolder }));
	} catch (err) {
		if (originParent) originParent.insertBefore(cardEl, originNext);
		if (originParent instanceof HTMLElement) refreshKanbanColumnCount(originParent);
		refreshKanbanColumnCount(targetCol);
		console.error('[Dashboard] library kanban move failed:', err);
		new Notice(t('library.moveFailed'));
	} finally {
		kanbanMovesInFlight.delete(file);
	}
}
export function nextGroupPropertyValue(current: unknown, targetValue: string, fromKey: string | null): unknown {
	if (Array.isArray(current)) {
		const kept = current.filter((v) => fromKey === null || String(v) !== fromKey);
		if (!kept.some((v) => String(v) === targetValue)) kept.push(targetValue);
		// Member-wise (not positional) no-op check: dropping a multi-value card
		// back on its own column must not reorder-and-rewrite the array.
		const unchanged =
			kept.length === current.length && current.every((v) => kept.some((k) => String(k) === String(v)));
		return unchanged ? undefined : kept;
	}
	if (current == null) return targetValue;
	// Only scalar YAML values can match a group name; a nested map/list in
	// the slot falls through to the overwrite (String() on it would be
	// "[object Object]" garbage anyway).
	if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
		if (String(current) === targetValue) return undefined;
	}
	return targetValue;
}
async function setKanbanGroupProperty(
	app: App,
	file: TFile,
	propKey: string,
	targetValue: string,
	fromKey: string | null,
	cardEl: HTMLElement,
	targetCol: HTMLElement,
): Promise<void> {
	// Same-value drop (including a drop back on the card's own column): no-op.
	const cached: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.[propKey];
	if (nextGroupPropertyValue(cached, targetValue, fromKey) === undefined) return;
	// A previous drop of this file is still writing — let it finish.
	if (kanbanMovesInFlight.has(file)) return;
	const originParent = cardEl.parentNode;
	const originNext = cardEl.nextSibling;
	kanbanMovesInFlight.add(file);
	targetCol.appendChild(cardEl);
	refreshKanbanColumnCount(targetCol);
	if (originParent instanceof HTMLElement) refreshKanbanColumnCount(originParent);
	try {
		// processFrontMatter re-reads the live frontmatter, so the swap derives
		// from the file's actual state even if the cache read above was stale.
		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			const next = nextGroupPropertyValue(fm[propKey], targetValue, fromKey);
			if (next !== undefined) fm[propKey] = next;
		});
		new Notice(t('library.propertyMoved', { name: file.basename, prop: propKey, value: targetValue }));
	} catch (err) {
		if (originParent) originParent.insertBefore(cardEl, originNext);
		if (originParent instanceof HTMLElement) refreshKanbanColumnCount(originParent);
		refreshKanbanColumnCount(targetCol);
		console.error('[Dashboard] library kanban property move failed:', err);
		new Notice(t('library.propertyMoveFailed'));
	} finally {
		kanbanMovesInFlight.delete(file);
	}
}
function refreshKanbanColumnCount(col: HTMLElement): void {
	const title = col.querySelector(':scope > .dashboard-library-kanban-col-title');
	const label = col.dataset.groupLabel;
	if (!title || !label) return;
	const count = col.querySelectorAll(':scope > .dashboard-library-kanban-card').length;
	title.setText(`${label} (${count})`);
}
function renderKanbanCardCover(card: HTMLElement, result: LibraryFileResult, app: App): CoverCandidate | null {
	const coverEl = card.createDiv({ cls: 'dashboard-library-card-cover dashboard-library-kanban-card-cover' });
	const cover = extractCoverValue(result.frontmatter);
	if (!cover) {
		renderPlaceholderCover(coverEl);
		return null;
	}
	void resolveLibraryCover(cover.value, result.file, app).then((url) => {
		if (!coverEl.isConnected) return;
		if (url) coverEl.style.backgroundImage = `url(${url})`;
		// Resolution failed (bad path, offline remote): themed placeholder.
		else renderPlaceholderCover(coverEl);
	});
	return cover;
}
export function renderKanbanView(
	container: HTMLElement,
	results: LibraryFileResult[],
	app: App,
	config: LibraryConfig,
): void {
	const groupBy = config.kanbanGroupBy ?? 'tags';
	const byFolder = config.groupMode === 'folder';
	const showCovers = config.kanbanShowCovers === true;
	// Both grouping modes support drag-to-move on desktop: folder moves
	// rewrite the file's path, property moves rewrite the group property.
	// The not-set column still allows dragging OUT (filing loose files) but
	// rejects drops.
	const dragEnabled = !Platform.isMobile;
	const dragHint = byFolder ? t('library.kanbanDragHint') : t('library.kanbanDragHintProperty');
	const groupFolders =
		dragEnabled && byFolder ? buildKanbanGroupFolders(results, config.folders ?? []) : new Map<string, string>();
	const dragState: KanbanDragState = { file: null, cardEl: null, fromKey: null };
	const kanban = container.createDiv({ cls: 'dashboard-library-kanban' });

	/** One card in any column. fromKey feeds property-mode drops (which column
	 *  the drag started from); cover/badges/date render identically everywhere.
	 *  Property badges share the card views' exact settings; in property mode
	 *  the grouping field itself is dropped — it is the column header already. */
	const makeCard = (col: HTMLElement, result: LibraryFileResult, fromKey: string | null): void => {
		const card = col.createDiv({ cls: 'dashboard-library-kanban-card' });
		attachItemHover(app, card, result.file);
		card.addEventListener('click', () => openFile(app, result.file));
		if (dragEnabled) attachKanbanCardDrag(card, result.file, fromKey, dragState, dragHint);
		let badgeFrontmatter = result.frontmatter;
		if (showCovers) {
			const cover = renderKanbanCardCover(card, result, app);
			if (cover) badgeFrontmatter = omitFrontmatterKey(badgeFrontmatter, cover.key);
		}
		if (!byFolder) badgeFrontmatter = omitFrontmatterKey(badgeFrontmatter, groupBy);
		card.createDiv({ cls: 'dashboard-library-kanban-card-title', text: result.basename });
		card.createDiv({ cls: 'dashboard-library-kanban-card-date', text: formatDate(result.mtime) });
		renderPropertyBadges(card, badgeFrontmatter, config);
	};

	/** Column drop wiring per grouping mode: folder mode drops into the group's
	 *  real folder, property mode rewrites the group property to the column's
	 *  value. accepts=false (the not-set column) declines drops while its cards
	 *  stay draggable out into real groups. */
	const wireColumnDrop = (col: HTMLElement, groupKey: string | undefined): void => {
		col.dataset.groupLabel = groupKey ?? t('library.notSet');
		if (!dragEnabled) return;
		if (byFolder) {
			const targetFolder = groupFolders.get(groupKey ?? '');
			attachKanbanColumnDrop(
				col,
				targetFolder !== undefined,
				(file, cardEl) => {
					if (targetFolder) void moveKanbanCard(app, file, targetFolder, cardEl, col);
				},
				dragState,
			);
			return;
		}
		if (groupKey === undefined) {
			// Property mode deliberately declines the not-set column too: its
			// drop semantics would be "delete the property", too destructive to
			// hang on an accidental drop — edit the note to clear it instead.
			attachKanbanColumnDrop(col, false, () => {}, dragState);
			return;
		}
		attachKanbanColumnDrop(
			col,
			true,
			(file, cardEl) => void setKanbanGroupProperty(app, file, groupBy, groupKey, dragState.fromKey, cardEl, col),
			dragState,
		);
	};

	// Group results
	const groups = new Map<string, LibraryFileResult[]>();
	const noGroup: LibraryFileResult[] = [];
	// Key → real folder per folder-group (collected during grouping so ancestor
	// groups can be suppressed once every group is known).
	const groupFolderPaths = new Map<string, string>();

	for (const result of results) {
		if (byFolder) {
			const key = folderGroupKey(result.file.path, config.folders ?? []);
			if (key === undefined) {
				noGroup.push(result);
				continue;
			}
			if (!groupFolderPaths.has(key)) {
				const path = folderGroupPath(result.file.path, config.folders ?? []);
				if (path !== undefined) groupFolderPaths.set(key, path);
			}
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(result);
			continue;
		}
		const value = result.frontmatter[groupBy];
		if (value == null) {
			noGroup.push(result);
			continue;
		}
		if (Array.isArray(value)) {
			for (const v of value) {
				const key = String(v);
				if (!groups.has(key)) groups.set(key, []);
				groups.get(key)!.push(result);
			}
		} else {
			const key = str(value);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(result);
		}
	}

	// Folder groups read best alphabetically (they mirror the folder tree);
	// property groups keep their first-occurrence order. First suppress
	// ancestor groups (a folder that is another group's parent) — their files
	// fall to the not-set column, so parents never appear alongside children.
	if (byFolder) {
		for (const key of ancestorGroupKeys(groupFolderPaths)) {
			const direct = groups.get(key);
			if (direct) noGroup.push(...direct);
			groups.delete(key);
		}
		const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
		groups.clear();
		for (const entry of sorted) groups.set(entry[0], entry[1]);
	}

	// Render columns
	for (const [groupName, groupResults] of groups) {
		const col = kanban.createDiv({ cls: 'dashboard-library-kanban-col' });
		col.createDiv({ cls: 'dashboard-library-kanban-col-title', text: `${groupName} (${groupResults.length})` });
		wireColumnDrop(col, groupName);
		for (const result of groupResults) {
			makeCard(col, result, groupName);
		}
	}

	if (noGroup.length > 0) {
		const col = kanban.createDiv({ cls: 'dashboard-library-kanban-col' });
		col.createDiv({
			cls: 'dashboard-library-kanban-col-title',
			text: `${t('library.notSet')} (${noGroup.length})`,
		});
		// groupKey undefined → declines drops, while its cards stay draggable.
		wireColumnDrop(col, undefined);
		for (const result of noGroup) {
			makeCard(col, result, null);
		}
	}
}
