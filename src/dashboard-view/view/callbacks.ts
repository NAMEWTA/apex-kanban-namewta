import { getDailyNotesPlugin, prependAfterFrontmatter } from './dashboard-view';
import type { DashboardView } from './dashboard-view';
import { Notice, TFile } from 'obsidian';
import { nowMoment } from '../../shared/datetime';
import type { AppWithCommands } from '../../shared/obsidian-internal';
import type { DashboardCard, LibraryConfig, QuickNotePreset, PinnedNote, QuickCommand, DataviewConfig } from '../types';
import { createNoteFromPreset, captureThought, openPinnedNote, openTodayNote } from '../notes/quick-note-section';
import { QuickNoteConfigModal } from '../notes/quick-note-config-modal';
import { showConfirmDialog } from '../ui/confirm-dialog';
import { t } from '../../shared/i18n';
import { archiveCompleted, serializeTasksForNote } from '../persist/task-tree';
import { getOrCreateDailyNote, ensureFolder } from '../calendar/daily-notes';
import { createMemoNote } from '../notes/memo-note';

export function createCallbacks(this: DashboardView) {
	return {
		onCardEdit: (card: DashboardCard) => this.openCardEditModal(card),
		onOpenNoteInPopover: (file: TFile, subpath?: string) => this.openNote(file, subpath),
		onOpenNoteAtLine: (file: TFile, line?: number) => this.openNote(file, undefined, line),
		onCardDelete: async (cardId: string) => {
			const confirmed = await showConfirmDialog(this.app, {
				title: t('common.confirmDelete'),
				message: t('common.confirmDeleteMessage'),
			});
			if (!confirmed) return;
			void this.sync.deleteCard(cardId);
			new Notice(t('card.deleted'));
		},
		onCheckboxToggle: (cardId: string, taskPath: number[], checked: boolean) =>
			this.sync.toggleTask(cardId, taskPath, checked),
		onTaskAdd: (cardId: string, text: string, parentPath?: number[]) => this.sync.addTask(cardId, text, parentPath),
		onTaskDelete: async (cardId: string, taskPath: number[]) => {
			const confirmed = await showConfirmDialog(this.app, {
				title: t('common.confirmDelete'),
				message: t('common.confirmDeleteMessage'),
			});
			if (!confirmed) return;
			void this.sync.deleteTask(cardId, taskPath);
		},
		onTaskReorder: (cardId: string, fromPath: number[], toPath: number[], before: boolean) =>
			this.sync.reorderTask(cardId, fromPath, toPath, before),
		onTaskMoveToCard: (
			srcCardId: string,
			fromPath: number[],
			destCardId: string,
			destPath: number[],
			mode: 'before' | 'after' | 'nest',
		) => this.sync.moveTaskToCard(srcCardId, fromPath, destCardId, destPath, mode),
		onTaskEdit: (cardId: string, taskPath: number[], text: string) => this.sync.editTask(cardId, taskPath, text),
		onTaskNest: (cardId: string, taskPath: number[]) => this.sync.nestTask(cardId, taskPath),
		onTaskNestInto: (cardId: string, srcPath: number[], destPath: number[]) =>
			this.sync.nestTaskInto(cardId, srcPath, destPath),
		onTaskUnnest: (cardId: string, taskPath: number[]) => this.sync.unnestTask(cardId, taskPath),
		onTaskToggleCollapse: (cardId: string, taskPath: number[]) =>
			this.sync.toggleCollapseTaskQuiet(cardId, taskPath),
		onMemoUpdate: (
			card: DashboardCard,
			updates: Pick<DashboardCard, 'body' | 'blockquote'> &
				Partial<Pick<DashboardCard, 'tasks' | 'docs' | 'wikiLink' | 'url' | 'type'>>,
		) => this.sync.updateMemoCard(card.id, updates),
		onMemoSaveAsNote: (card: DashboardCard) => this.saveMemoAsNote(card),
		onTaskSaveToDaily: (card: DashboardCard) => this.saveTasksToDaily(card),
		onDocAdd: (cardId: string, path: string) => this.sync.addDocToCard(cardId, path),
		onCardNewNote: (cardId: string) => {
			void this.handleCardNewNote(cardId);
		},
		onDocDelete: (cardId: string, docPath: number[]) => this.sync.deleteDoc(cardId, docPath),
		onDocReorder: (cardId: string, fromPath: number[], toPath: number[], before: boolean) =>
			this.sync.reorderDocs(cardId, fromPath, toPath, before),
		onDocMoveToCard: (
			srcCardId: string,
			fromPath: number[],
			destCardId: string,
			destPath: number[],
			mode: 'before' | 'after' | 'nest',
		) => this.sync.moveDocToCard(srcCardId, fromPath, destCardId, destPath, mode),
		onDocNest: (cardId: string, docPath: number[]) => this.sync.nestDoc(cardId, docPath),
		onDocToggleCollapse: (cardId: string, docPath: number[]) => this.sync.toggleCollapseDocQuiet(cardId, docPath),
		onCardAdd: (colName: string) => {
			const column = this.data?.columns.find((col) => col.name === colName);
			const effectiveType = column?.sectionType ?? colName.toLowerCase();
			if (effectiveType === 'dashboard') {
				this.openWidgetTypeModal(colName);
			} else if (effectiveType === 'sticky') {
				// Sticky sections mix memo and todo cards: ask which one to create.
				this.openStickyCardTypeModal(colName);
			} else if (effectiveType === 'memo' || effectiveType === 'todo') {
				this.pendingScrollToLastCardOfColumn = colName;
				void this.sync.addCard(colName);
			} else {
				this.openProjectSearchModal(colName);
			}
		},
		onColumnAdd: (name: string, sectionType?: string) => {
			void this.addColumnWithType(name, sectionType);
		},
		onRequestAddSection: () => this.openAddSectionModal(),
		onBannerEdit: () => {
			if (this.data) this.openBannerEditModal(this.data);
		},
		onQuickActionAdd: () => this.openAddActionModal(),
		onQuickActionRemove: (index: number) => {
			void showConfirmDialog(this.app, {
				title: t('common.confirmDelete'),
				message: t('common.confirmDeleteMessage'),
			}).then((confirmed) => {
				if (confirmed) void this.sync.removeQuickAction(index);
			});
		},
		onQuickNoteCreate: (preset: QuickNotePreset) => void createNoteFromPreset(this.app, preset),
		onQuickNoteCapture: (text: string) => void captureThought(this.app, this.plugin.settings, text),
		onOpenPinnedNote: (note: PinnedNote) => openPinnedNote(this.app, note),
		onQuickCommand: (cmd: QuickCommand) => {
			const commands = (this.app as AppWithCommands).commands;
			// Stale id (plugin disabled/uninstalled): warn instead of silently no-op'ing.
			if (!commands.commands[cmd.commandId]) {
				new Notice(t('quickNote.commandNotFound'));
				return;
			}
			commands.executeCommandById(cmd.commandId);
		},
		onQuickNoteDaily: () => void openTodayNote(this.app),
		onQuickNoteConfig: () => new QuickNoteConfigModal(this.app, this.plugin).open(),
		onMoveCard: (cardId: string, targetCol: string, targetIdx: number) =>
			this.handleMoveCard(cardId, targetCol, targetIdx),
		onMemoColorChange: (card: DashboardCard, color: string) => this.sync.updateMemoColor(card.id, color),
		onProjectCoverChange: (card: DashboardCard, imagePath: string) =>
			this.sync.updateProjectCover(card.id, imagePath),
		onCardTitleEdit: (cardId: string, newTitle: string) => this.sync.updateCard(cardId, { title: newTitle }),
		onCardWidthChange: (cardId: string, width: number) => this.sync.updateCardWidth(cardId, width),
		onCardSizeChange: (cardId: string, size: string) =>
			this.sync.updateCardSize(cardId, size as import('../types').CardSize),
		onCardGridChange: (cardId: string, gridCols: number, gridRows: number) =>
			this.sync.updateCardGrid(cardId, gridCols, gridRows),
		onCardGridMove: (cardId: string, gridCol: number, gridRow: number) =>
			this.sync.updateCardGridMove(cardId, gridCol, gridRow),
		onFileDrop: (cardId: string, filePath: string) => this.handleFileDrop(cardId, filePath),
		onColumnRename: (oldName: string, newName: string, columnIndex?: number) => {
			void this.sync.renameColumn(oldName, newName, columnIndex);
		},
		onColumnDelete: (columnName: string, columnIndex?: number) => this.deleteColumn(columnName, columnIndex),
		onColumnMove: (fromIndex: number, toIndex: number) => {
			void this.sync.moveColumn(fromIndex, toIndex);
		},
		onColumnMoveBeside: (fromIndex: number, targetIndex: number, side: 'left' | 'right') => {
			void this.sync.moveColumnBeside(fromIndex, targetIndex, side);
		},
		onColumnHeightChange: (name: string, height: number) => {
			void this.sync.updateColumnHeight(name, height);
		},
		onColumnWidthChange: (name: string, widthPct: number) => {
			void this.sync.updateColumnWidth(name, widthPct);
		},
		onTaskReminderEdit: (cardId: string, taskPath: number[], reminder: string | undefined) =>
			this.sync.editTaskReminder(cardId, taskPath, reminder),
		onAddFromTemplate: (columnName: string) => this.openTemplatePicker(columnName),
		onArchiveTasks: (columnName: string) => this.archiveCompletedTasks(columnName),
		onLibraryConfigChange: (columnName: string, config: LibraryConfig) => {
			this.suppressNextRender = true;
			void this.sync.updateLibraryConfig(columnName, config).then(() => {
				this.refreshSectionInPlace(columnName);
			});
		},
		onDataviewConfigChange: (columnName: string, config: DataviewConfig) => {
			this.suppressNextRender = true;
			void this.sync.updateDataviewConfig(columnName, config).then(() => {
				this.refreshSectionInPlace(columnName);
			});
		},
	};
}

export function handleFileDrop(this: DashboardView, cardId: string, filePath: string): void {
	if (!this.data) return;
	let sectionType = 'projects';
	let cardType = 'generic';
	for (const col of this.data.columns) {
		const card = col.cards.find((c) => c.id === cardId);
		if (card) {
			sectionType = col.sectionType ?? col.name.toLowerCase();
			cardType = card.type;
			break;
		}
	}
	if (cardType === 'weather' || cardType === 'tracker') return;
	if (cardType === 'task' || sectionType === 'todo') {
		void this.sync.addTask(cardId, `[[${filePath}]]`);
	} else if (
		sectionType === 'memo' ||
		(sectionType === 'sticky' && (cardType === 'generic' || cardType === 'note'))
	) {
		void this.sync.addFileLinkToMemo(cardId, filePath);
	} else {
		void this.sync.addDocToCard(cardId, filePath);
	}
}

export async function saveMemoAsNote(this: DashboardView, card: DashboardCard): Promise<void> {
	try {
		const { path, templateMissing } = await createMemoNote(this.app, {
			folder: this.plugin.settings.memoSavePath,
			templatePath: this.plugin.settings.memoTemplatePath,
			card,
			untitled: t('notice.memoUntitled'),
		});
		if (templateMissing) new Notice(t('notice.memoTemplateNotFound'));
		new Notice(t('notice.memoSaved', { path }), 4000);
	} catch (err) {
		console.error('[Dashboard] saveMemoAsNote failed:', err);
		new Notice(t('notice.memoSaveError'), 4000);
	}
}

export async function saveTasksToDaily(this: DashboardView, card: DashboardCard): Promise<void> {
	try {
		if (!card.tasks || card.tasks.length === 0) {
			new Notice(t('notice.noTasksToSave'));
			return;
		}

		// Locate today's daily note via the core "Daily notes" plugin settings.
		const dailyPlugin = getDailyNotesPlugin(this.app);
		const options = dailyPlugin?.instance?.options;
		if (!dailyPlugin?.enabled || !options) {
			new Notice(t('notice.dailyNotesDisabled'), 5000);
			return;
		}

		const folder = (options.folder || '').trim().replace(/^\/+|\/+$/g, '');
		const format = options.format || 'YYYY-MM-DD';
		const dateStr = nowMoment().format(format);
		const fileName = `${dateStr}.md`;
		const path = folder ? `${folder}/${fileName}` : fileName;

		const title = card.title?.trim() || t('notice.memoUntitled');
		const block = `### ${title}\n${serializeTasksForNote(card.tasks)}`;

		if (folder) await ensureFolder(this.app, folder);

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			const raw = await this.app.vault.read(existing);
			await this.app.vault.modify(existing, prependAfterFrontmatter(raw, block));
		} else {
			await this.app.vault.create(path, `${block}\n`);
		}
		new Notice(t('notice.tasksSavedToDaily', { path }), 4000);
	} catch (err) {
		console.error('[Dashboard] saveTasksToDaily failed:', err);
		new Notice(t('notice.dailySaveError'), 4000);
	}
}

export async function archiveCompletedTasks(this: DashboardView, columnName: string): Promise<void> {
	try {
		if (!this.data) return;
		const column = this.data.columns.find((c) => c.name === columnName);
		if (!column) return;

		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

		const entries: Array<{ task: string; card: string }> = [];
		for (const card of column.cards) {
			const { archived } = archiveCompleted(card.tasks);
			if (archived.length === 0) continue;
			const cardTitle = card.title?.trim() || t('notice.memoUntitled');
			for (const item of archived) {
				entries.push({ task: item.text, card: cardTitle });
			}
		}

		if (entries.length === 0) {
			new Notice(t('notice.archiveEmpty'));
			return;
		}

		const confirmed = await showConfirmDialog(this.app, {
			title: t('renderer.archiveTasks'),
			message: t('notice.archiveConfirm', { count: entries.length }),
		});
		if (!confirmed) return;

		// Write the running log before mutating the board: if the write fails,
		// the tasks stay on the board (no data loss). Destination is either
		// today's daily note (created from the daily-notes template when
		// missing; a stale blank note is template-rescued) or the configured
		// fixed file with auto-created folders.
		const lines = entries.map((e) => t('notice.archiveLine', { time, task: e.task, card: e.card }));
		const appendText = `${lines.join('\n')}\n`;

		let destFile: TFile;
		if (this.plugin.settings.taskArchiveTarget === 'daily') {
			const note = await getOrCreateDailyNote(this.app, nowMoment().format('YYYY-MM-DD'));
			if (!note) {
				// Daily notes not configured / path unresolvable: abort BEFORE
				// removing anything from the board.
				new Notice(t('notice.archiveDailyUnavailable'), 4000);
				return;
			}
			destFile = note;
		} else {
			const configured = this.plugin.settings.taskArchivePath.trim().replace(/^\/+|\/+$/g, '');
			const fullPath = configured || '归档/已完成.md';
			const slash = fullPath.lastIndexOf('/');
			const folder = slash >= 0 ? fullPath.slice(0, slash) : '';
			if (folder) await ensureFolder(this.app, folder);
			const existing = this.app.vault.getAbstractFileByPath(fullPath);
			destFile = existing instanceof TFile ? existing : await this.app.vault.create(fullPath, '');
		}

		const raw = await this.app.vault.read(destFile);
		const sep = raw === '' || raw.endsWith('\n') ? '' : '\n';
		await this.app.vault.modify(destFile, `${raw}${sep}${appendText}`);

		await this.sync.archiveTasks(columnName);

		new Notice(t('notice.archived', { count: entries.length, path: destFile.path }), 4000);
	} catch (err) {
		console.error('[Dashboard] archiveCompletedTasks failed:', err);
		new Notice(t('notice.archiveError'), 4000);
	}
}
