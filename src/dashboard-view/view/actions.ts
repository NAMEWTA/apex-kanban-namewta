import type { DashboardView } from './dashboard-view';
import { MarkdownView, Notice, TFile } from 'obsidian';
import type { AppWithCommands } from '../../shared/obsidian-internal';
import type { DashboardData, DashboardCard, DashboardColumn, QuickAction } from '../types';
import { renderSection } from '../renderer';
import { BannerEditModal } from '../banner/banner';
import { AddActionModal, DocSearchModal } from '../notes/quick-actions';
import { setupDragAndDrop } from '../ui/dnd';
import { CardEditModal } from '../ui/card-edit-modal';
import { NotePopoverModal, revealMarkdownLine } from '../ui/note-popover-modal';
import { showConfirmDialog } from '../ui/confirm-dialog';
import { showPromptDialog } from '../ui/prompt-dialog';
import { WidgetTypeModal, type WidgetType } from '../widgets/widget-type-modal';
import { StickyCardTypeModal } from '../notes/sticky-card-type-modal';
import { AddSectionModal } from '../ui/add-section-modal';
import { WeatherConfigModal } from '../widgets/weather-config-modal';
import { LibraryConfigModal } from '../library/library-config-modal';
import { FolderConfigModal, folderResultToLibraryConfig } from '../library/folder-config-modal';
import {
	buildNewNoteProps,
	sectionNewNoteFolder,
	createNoteWithProps,
	pickFolderFromMenu,
} from '../library/library-new-note';
import { NotesSectionConfigModal } from '../notes/notes-config-modal';
import { DataviewConfigModal } from '../dataview/dataview-config-modal';
import { WebConfigModal } from '../web/web-config-modal';
import { MediaConfigModal } from '../media/media-config-modal';
import { WereadConfigModal } from '../weread/weread-config-modal';
import { TrackerConfigModal } from '../widgets/tracker-config-modal';
import { TemplatePickerModal } from '../ui/template-modal';
import { t } from '../../shared/i18n';
import { captureScrollStates, restoreScrollStates } from '../ui/scroll-preserve';

export function openBannerEditModal(this: DashboardView, data: DashboardData): void {
	const modal = new BannerEditModal(this.app, data.banner, (updates) => {
		void this.sync.updateBanner(updates);
	});
	modal.open();
}

export function openCardEditModal(this: DashboardView, card: DashboardCard): void {
	const modal = new CardEditModal(this.app, card, (updates) => {
		void this.sync.updateCard(card.id, updates);
	});
	modal.open();
}

export function openNotePopover(this: DashboardView, file: TFile, subpath?: string, line?: number): void {
	// Close any previously open popover so its embedded leaf is detached
	// before we open a fresh one.
	this.popoverModal?.close();
	const modal = new NotePopoverModal(this.app, file, subpath, line);
	this.popoverModal = modal;
	modal.open();
}

/** Opens a note on card click. Honors the "disable popover" setting: when
 *  on, the note opens directly in a tab (no in-dashboard editor).
 *
 *  subpath is the raw `#heading` / `#^block` fragment of a wikilink; the
 *  tab path resolves it via openLinkText, the popover scrolls to it after
 *  the embedded view is ready. line is a 0-based source line (calendar
 *  task jumps): the note is revealed at that line in either path.
 *
 *  Non-markdown files (canvas whiteboards, base databases, pdf, media) are
 *  always opened in a real tab — the in-dashboard popover only hosts a
 *  MarkdownView and would render them broken. */
export function openNote(this: DashboardView, file: TFile, subpath?: string, line?: number): void {
	if (this.plugin.settings.disableNotePopover || file.extension !== 'md') {
		void this.openNoteInTab(file, subpath, line);
		return;
	}
	this.openNotePopover(file, subpath, line);
}

/** Tab-path open with an optional line reveal once the view is active. */
export async function openNoteInTab(this: DashboardView, file: TFile, subpath?: string, line?: number): Promise<void> {
	await this.app.workspace.openLinkText(subpath ? `${file.path}${subpath}` : file.path, '');
	if (line === undefined) return;
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);
	if (view && view.file?.path === file.path) revealMarkdownLine(view, line);
}

export async function addColumnWithType(this: DashboardView, name: string, sectionType?: string): Promise<void> {
	await this.sync.addColumn(name, sectionType);
	if (sectionType === 'library') {
		this.openLibraryConfigModal(name);
	} else if (sectionType === 'folder') {
		this.openFolderConfigModal(name);
	} else if (sectionType === 'weread') {
		this.openWereadConfigModal(name);
	} else if (sectionType === 'dataview') {
		this.openDataviewConfigModal(name);
	} else if (sectionType === 'web') {
		this.openWebConfigModal(name);
	}
}

export function openAddSectionModal(this: DashboardView): void {
	const modal = new AddSectionModal(this.app, (name, sectionType) => {
		void this.addColumnWithType(name, sectionType);
	});
	modal.open();
}

export function openWidgetTypeModal(this: DashboardView, colName: string): void {
	const modal = new WidgetTypeModal(this.app, (type: WidgetType) => {
		if (type === 'weather') {
			this.openWeatherConfigModal(colName);
		} else if (type === 'tracker') {
			this.openTrackerConfigModal(colName);
		}
	});
	modal.open();
}

/** Sticky ("便利贴") sections: choose memo or todo before the card is created. */
export function openStickyCardTypeModal(this: DashboardView, colName: string): void {
	const modal = new StickyCardTypeModal(this.app, (kind) => {
		this.pendingScrollToLastCardOfColumn = colName;
		if (kind === 'todo') {
			void this.sync.addCard(colName, { type: 'task', title: t('sync.todoTitle') });
		} else {
			const now = new Date();
			const pad = (n: number) => String(n).padStart(2, '0');
			const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
			void this.sync.addCard(colName, { type: 'generic', title: t('sync.memoTitle', { date }) });
		}
	});
	modal.open();
}

export function openWeatherConfigModal(this: DashboardView, colName: string): void {
	const modal = new WeatherConfigModal(this.app, (title, config) => {
		void this.sync.addCard(colName, {
			title,
			type: 'weather',
			weatherConfig: config,
		});
	});
	modal.open();
}

export function openTrackerConfigModal(this: DashboardView, colName: string): void {
	const modal = new TrackerConfigModal(this.app, (title, config) => {
		void this.sync.addCard(colName, {
			title,
			type: 'tracker',
			trackerConfig: config,
		});
	});
	modal.open();
}

export function openTemplatePicker(this: DashboardView, colName: string): void {
	const modal = new TemplatePickerModal(this.app, this.plugin, (template) => {
		this.pendingScrollToLastCardOfColumn = colName;
		void this.sync.addCard(colName, {
			title: template.name,
			type: 'task',
			tasks: template.tasks.map((text) => ({ text, checked: false })),
		});
	});
	modal.open();
}

export function openLibraryConfigModal(this: DashboardView, colName: string): void {
	const column = this.data?.columns.find((col) => col.name === colName);
	const existingConfig = column?.libraryConfig ?? {
		filters: [],
		viewMode: 'grid' as const,
		sortBy: 'modified',
		sortDesc: true,
	};
	const modal = new LibraryConfigModal(this.app, existingConfig, (config) => {
		void this.sync.updateLibraryConfig(colName, config);
	});
	modal.open();
}

export function openDataviewConfigModal(this: DashboardView, colName: string): void {
	const column = this.data?.columns.find((col) => col.name === colName);
	const existing = column?.dataviewConfig ?? { query: '' };
	const modal = new DataviewConfigModal(this.app, existing, (config) => {
		void this.sync.updateDataviewConfig(colName, config);
	});
	modal.open();
}

/** Web section: URL + engine mode + zoom. Saving goes through the plain
 *  sync path — handleDataUpdate('local') rebuilds the section in place,
 *  reloading the frame with the new URL. */
export function openWebConfigModal(this: DashboardView, colName: string): void {
	const column = this.data?.columns.find((col) => col.name === colName);
	const existing = column?.webConfig ?? { url: '' };
	const modal = new WebConfigModal(this.app, existing, (config) => {
		void this.sync.updateWebConfig(colName, config);
	});
	modal.open();
}

/** Images/videos sections: the config currently manages the excluded-folder
 *  set, persisted via the column's libraryConfig. */
export function openMediaConfigModal(this: DashboardView, colName: string): void {
	const column = this.data?.columns.find((col) => col.name === colName);
	const modal = new MediaConfigModal(this.app, column?.libraryConfig, (config) => {
		void this.sync.updateLibraryConfig(colName, config);
	});
	modal.open();
}

export function openWereadConfigModal(this: DashboardView, colName: string): void {
	const column = this.data?.columns.find((col) => col.name === colName);
	const existing = column?.wereadConfig ?? {
		widgets: [{ id: 'w1', view: 'shelf' as const, groupBy: 'readingState' as const }],
	};
	const modal = new WereadConfigModal(this.app, existing, (config) => {
		void this.sync.updateWereadConfig(colName, config);
	});
	modal.open();
}

/**
 * Optimistic card move: rewrite only the affected section(s) in place
 * instead of letting the default full-board re-render tear down every
 * section (the source of the long lag and the dragend transform "afterimage"
 * on memo cards).
 *
 * moveCard updates `this.data` synchronously then persists; its
 * `notifyCallbacks` is suppressed here (one-shot) and the file-watcher's
 * own reload is a no-op via its serialize-equality check, so no extra
 * full render fires. We then refresh just the source and target sections.
 */
/**
 * Optimistic card move: physically relocate the dragged card's DOM node
 * instead of re-rendering. This is zero-cost compared to refreshSectionInPlace
 * (which rebuilds every memo card — each line re-parsing links, each wikilink
 * re-resolved against the vault — the real source of the lingering lag).
 *
 * DnD listeners are bound per cardEl (setupDragAndDrop attaches dragstart to
 * each card), so moving a node keeps its listeners intact — no rebind needed.
 * The dragged card carries a `--dragging` class during the drag (desktop) /
 * until cleanupDrag (touch); we clear it here in case dragend lands after us.
 */
export async function handleMoveCard(
	this: DashboardView,
	cardId: string,
	targetCol: string,
	targetIdx: number,
): Promise<void> {
	const kanban = (this.containerEl.children[1] as HTMLElement)?.querySelector<HTMLElement>('.dashboard-kanban');
	const draggedEl =
		kanban?.querySelector<HTMLElement>(`.dashboard-card[data-card-id="${CSS.escape(cardId)}"]`) ?? null;
	const sourceCol = this.data?.columns.find((c) => c.cards.some((card) => card.id === cardId))?.name;

	this.suppressNextRender = true;
	try {
		await this.sync.moveCard(cardId, targetCol, targetIdx);
	} catch {
		// moveCard swallows disk I/O itself; guard anything else so a rejection
		// can't desync the UI from this.data.
		this.suppressNextRender = false;
		if (this.data) this.render(this.data);
		return;
	}

	// Cross-section moves change both rendering and column-bound callbacks.
	// Rebuild both rows; merely reordering destination children cannot move
	// a node from the source and leaves stale card type / event closures.
	this.suppressNextRender = false;
	if (sourceCol && sourceCol !== targetCol) {
		const sourceRefreshed = this.refreshSectionInPlace(sourceCol);
		const targetRefreshed = this.refreshSectionInPlace(targetCol);
		if ((!sourceRefreshed || !targetRefreshed) && this.data) this.render(this.data);
		return;
	}

	// Physically reorder the target section's card DOM to match the new data
	// order. If we can't (element missing — e.g. a concurrent full render
	// swapped the tree), fall back to the in-place section refresh, then full.
	const moved = draggedEl && this.reorderCardsInDOM(targetCol);
	if (sourceCol && sourceCol !== targetCol) {
		this.reorderCardsInDOM(sourceCol);
	}
	if (draggedEl) {
		draggedEl.removeClass('dashboard-card--dragging');
	}
	if (!moved) {
		let refreshed = this.refreshSectionInPlace(targetCol);
		if (sourceCol && sourceCol !== targetCol) {
			refreshed = this.refreshSectionInPlace(sourceCol) || refreshed;
		}
		if (!refreshed && this.data) {
			this.render(this.data);
		}
	}
}

/**
 * Reorder the card DOM nodes in one section to match `this.data`'s card
 * order for that column. Pure DOM shuffle (insertBefore) — no rebuild, so
 * memo cards keep their already-parsed links and hover bindings. Returns
 * false if the section's DOM can't be located.
 */
export function reorderCardsInDOM(this: DashboardView, columnName: string): boolean {
	if (!this.data) return false;
	const kanban = (this.containerEl.children[1] as HTMLElement)?.querySelector<HTMLElement>('.dashboard-kanban');
	const section = kanban?.querySelector<HTMLElement>(`:scope > [data-column="${CSS.escape(columnName)}"]`);
	const cardsContainer = section?.querySelector<HTMLElement>('.dashboard-section-cards');
	if (!cardsContainer) return false;
	const column = this.data.columns.find((c) => c.name === columnName);
	if (!column) return false;

	const existing = new Map<string, HTMLElement>();
	cardsContainer.querySelectorAll<HTMLElement>(':scope > .dashboard-card').forEach((el) => {
		const id = el.dataset.cardId;
		if (id) existing.set(id, el);
	});

	// Re-append in data order; remove any drop indicator sitting first.
	cardsContainer.querySelectorAll(':scope > .dashboard-drop-indicator').forEach((el) => el.remove());
	let cursor: Node | null = null;
	for (const card of column.cards) {
		const el = existing.get(card.id);
		if (!el) continue;
		if (cursor) {
			if (cursor.nextSibling !== el) cardsContainer.insertBefore(el, cursor.nextSibling);
		} else {
			if (cardsContainer.firstChild !== el) cardsContainer.insertBefore(el, cardsContainer.firstChild);
		}
		cursor = el;
	}
	return true;
}

export function refreshSectionInPlace(this: DashboardView, columnName: string): boolean {
	if (!this.data) return false;
	const kanban = (this.containerEl.children[1] as HTMLElement)?.querySelector<HTMLElement>('.dashboard-kanban');
	if (!kanban) return false;
	const oldEl = kanban.querySelector(`:scope > [data-column="${CSS.escape(columnName)}"]`);
	if (!oldEl) return false;
	const column = this.data.columns.find((c) => c.name === columnName);
	if (!column) return false;
	const callbacks = this.createCallbacks();
	const newEl = renderSection(column, callbacks, this.app, this.data, this.plugin.settings);
	// The rebuilt row starts every internal scroller at 0, which snaps the
	// card deck back to its first card and task lists back to their top —
	// the "page jumps away after finishing an edit" symptom. Carry the old
	// row's scroll positions over the node swap.
	const scrollStates = captureScrollStates(oldEl);
	oldEl.replaceWith(newEl);
	restoreScrollStates(newEl, scrollStates);
	for (const fn of this.dndCleanupFns) fn();
	this.dndCleanupFns = [];
	setupDragAndDrop(kanban, callbacks, this.dndCleanupFns);
	return true;
}

export function openFolderConfigModal(this: DashboardView, colName: string): void {
	const column = this.data?.columns.find((col) => col.name === colName);
	const libraryConfig = column?.libraryConfig;
	const currentFolders = libraryConfig?.folders ?? [];
	const currentTags = libraryConfig?.filters.find((f) => f.property === 'tags')?.values ?? [];
	const currentGroupBy = libraryConfig?.kanbanGroupBy;
	const modal = new FolderConfigModal(
		this.app,
		currentFolders,
		libraryConfig?.excludeFolders,
		currentTags,
		currentGroupBy,
		libraryConfig?.showProperties,
		libraryConfig?.propertyLimit,
		(result) => {
			void this.sync.updateLibraryConfig(colName, folderResultToLibraryConfig(libraryConfig, result));
		},
		libraryConfig?.groupMode,
		libraryConfig?.visibleProperties,
		libraryConfig?.kanbanShowCovers,
		libraryConfig?.templatePath,
	);
	modal.open();
}

/** Per-card "new note" (notes/projects sections): prompt for a title, create
 *  the note from the section's settings (template + save folder; vault root
 *  when no folder is configured), attach it to the card's doc list, and
 *  open it. */
export async function handleCardNewNote(this: DashboardView, cardId: string): Promise<void> {
	if (this.cardNewNoteInFlight) return;
	this.cardNewNoteInFlight = true;
	try {
		let found: { column: DashboardColumn; card: DashboardCard } | null = null;
		for (const column of this.data?.columns ?? []) {
			const card = column.cards.find((c) => c.id === cardId);
			if (card) {
				found = { column, card };
				break;
			}
		}
		if (!found) return;
		const { column, card } = found;

		const folder = sectionNewNoteFolder(column.libraryConfig);
		const templatePath = (column.libraryConfig?.templatePath ?? '').trim();
		const title = await showPromptDialog(this.app, {
			title: t('quickNote.titlePrompt'),
			placeholder: t('quickNote.titlePlaceholder'),
		});
		if (title == null) return; // cancelled (empty submit cancels too)

		try {
			let file: TFile;
			try {
				file = await createNoteWithProps(this.app, folder, title, {}, templatePath || undefined);
			} catch (err) {
				// A missing template must not kill the creation — fall back to
				// a bare note and tell the user (the library flow's behavior).
				if (err instanceof Error && err.message.startsWith('Template not found')) {
					new Notice(t('quickNote.templateNotFound'));
					file = await createNoteWithProps(this.app, folder, title, {});
				} else {
					throw err;
				}
			}
			await this.sync.addDocToCard(card.id, file.path);
			await this.app.workspace.getLeaf('tab').openFile(file);
			new Notice(t('quickNote.created', { name: file.basename }));
		} catch (err) {
			console.error('[Dashboard] card new note failed:', err);
			new Notice(t('library.newNoteFailed'));
		}
	} finally {
		this.cardNewNoteInFlight = false;
	}
}

/** Notes (cover / no-cover) section settings: new-note template + save
 *  folder, persisted through the column's libraryConfig. */
export function openNotesSectionConfigModal(this: DashboardView, colName: string): void {
	const column = this.data?.columns.find((col) => col.name === colName);
	if (!column) return;
	const config = column.libraryConfig;
	const modal = new NotesSectionConfigModal(
		this.app,
		{
			templatePath: config?.templatePath ?? '',
			folder: (config?.folders ?? [])[0] ?? '',
		},
		(settings) => {
			void this.sync.updateLibraryConfig(colName, {
				filters: [],
				viewMode: 'grid',
				sortBy: 'modified',
				sortDesc: true,
				...config,
				templatePath: settings.templatePath || undefined,
				folders: settings.folder ? [settings.folder] : undefined,
			});
		},
	);
	modal.open();
}

/** Toolbar "new note": folder sections create inside their configured folder
 *  (menu when several); library sections create at settings.libraryNewNotePath
 *  with the section's property filters pre-filled so the note matches them.
 *  A library section with hand-authored scan folders (dashboard-file YAML)
 *  follows the folder branch — queryVaultFiles scopes its results to those
 *  folders, so the global path would hide the note.
 *  The section refresh rides the vault-'create' debounce (registerVaultListeners
 *  → flushVaultRefresh → refreshSectionsFor) — an inline refresh could beat
 *  metadataCache indexing and briefly render the section without the new
 *  note. */
export async function handleLibraryNewNote(
	this: DashboardView,
	columnName: string,
	pos?: { x: number; y: number },
): Promise<void> {
	if (this.libraryNewNoteInFlight) return;
	this.libraryNewNoteInFlight = true;
	try {
		const column = this.data?.columns.find((c) => c.name === columnName);
		if (!column || (column.sectionType !== 'folder' && column.sectionType !== 'library')) return;

		const folders = (column.libraryConfig?.folders ?? [])
			.map((f) => f.trim().replace(/^\/+|\/+$/g, ''))
			.filter((f) => f.length > 0);
		let folder: string;
		if (column.sectionType === 'folder' || folders.length > 0) {
			if (folders.length === 0) {
				new Notice(t('library.newNoteNoFolder'));
				return;
			}
			if (folders.length === 1) {
				folder = folders[0]!;
			} else {
				if (!pos) return;
				folder = (await pickFolderFromMenu(folders, pos)) ?? '';
				if (!folder) return; // menu dismissed
			}
		} else {
			folder = this.plugin.settings.libraryNewNotePath.trim().replace(/^\/+|\/+$/g, '');
		}

		const title = await showPromptDialog(this.app, {
			title: t('quickNote.titlePrompt'),
			placeholder: t('quickNote.titlePlaceholder'),
		});
		if (title == null) return; // cancelled (empty submit cancels too — same as presets)

		const { props, skipped } = buildNewNoteProps(column.libraryConfig);
		try {
			const templatePath = (column.libraryConfig?.templatePath ?? '').trim();
			let file: TFile;
			try {
				file = await createNoteWithProps(this.app, folder, title, props, templatePath || undefined);
			} catch (err) {
				// Missing template should not kill the creation — fall back
				// to a bare note and tell the user (the preset behavior).
				if (err instanceof Error && err.message.startsWith('Template not found')) {
					new Notice(t('quickNote.templateNotFound'));
					file = await createNoteWithProps(this.app, folder, title, props);
				} else {
					throw err;
				}
			}
			await this.app.workspace.getLeaf('tab').openFile(file);
			new Notice(t('quickNote.created', { name: file.basename }));
			if (skipped.length > 0) {
				new Notice(t('library.newNoteSkipped', { props: skipped.join(', ') }));
			}
		} catch (err) {
			console.error('[Dashboard] library new note failed:', err);
			new Notice(t('library.newNoteFailed'));
		}
	} finally {
		this.libraryNewNoteInFlight = false;
	}
}

export function openAddActionModal(this: DashboardView): void {
	const modal = new AddActionModal(this.app, (action) => {
		void this.sync.addQuickAction(action);
	});
	modal.open();
}

export function openEditActionModal(this: DashboardView, action: QuickAction): void {
	const index = this.data?.quickActions.findIndex((a) => a.target === action.target) ?? -1;
	if (index < 0) return;
	const modal = new AddActionModal(
		this.app,
		(updated) => {
			void this.sync.updateQuickAction(index, { name: updated.name, icon: updated.icon });
		},
		action,
	);
	modal.open();
}

export async function deleteColumn(this: DashboardView, columnName: string, columnIndex?: number): Promise<void> {
	const confirmed = await showConfirmDialog(this.app, {
		title: t('common.confirmDelete'),
		message: t('renderer.confirmDeleteSection', { column: columnName }),
	});
	if (!confirmed) return;
	await this.sync.deleteColumn(columnName, columnIndex);
	new Notice(t('renderer.sectionDeleted'));
}

export async function executeAction(this: DashboardView, action: QuickAction): Promise<void> {
	if (action.type === 'file') {
		await this.navigateToPath(action.target);
	} else if (action.type === 'command') {
		// Route every command (including 'daily-notes') through Obsidian's command
		// system so the core Daily notes plugin honors its folder/format/template
		// settings. (Previously 'daily-notes' was short-circuited to a root-level
		// file that ignored all of those settings.)
		(this.app as AppWithCommands).commands.executeCommandById(action.target);
	}
}

export function openProjectSearchModal(this: DashboardView, colName: string): void {
	const modal = new DocSearchModal(this.app, (link) => {
		void this.sync.addCard(colName, {
			title: link.name,
			body: `[[${link.path}]]`,
		});
	});
	modal.open();
}

export async function promptAddColumn(this: DashboardView): Promise<void> {
	const name = await showPromptDialog(this.app, { title: t('renderer.sectionName') });
	if (name) {
		void this.sync.addColumn(name);
	}
}

export async function navigateToPath(this: DashboardView, path: string): Promise<void> {
	let file = this.app.vault.getFileByPath(path);
	if (!file && !path.endsWith('.md')) {
		file = this.app.vault.getFileByPath(`${path}.md`);
	}

	if (!file) {
		const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
		if (basename) {
			const found = this.app.vault.getMarkdownFiles().find((mf) => mf.basename === basename);
			if (found) file = found;
		}
	}

	if (file) {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		return;
	}

	const folderPath = path.replace(/\/$/, '');
	const abstractFile = this.app.vault.getAbstractFileByPath(folderPath);
	if (abstractFile) {
		const leaves = this.app.workspace.getLeavesOfType('file-explorer');
		if (leaves.length > 0) {
			this.app.workspace.setActiveLeaf(leaves[0]!, { focus: true });
		}
	}
}
