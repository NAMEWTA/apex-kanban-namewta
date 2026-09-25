import type { DashboardSettingTab } from './settings-tab';
import { setIcon, Setting } from 'obsidian';
import { t } from '../../shared/i18n';
import { showConfirmDialog } from '../../dashboard-view/ui/confirm-dialog';
import { showPromptDialog } from '../../dashboard-view/ui/prompt-dialog';
import { normalizeWorkspacePath } from '../../dashboard-view/workspace/workspace-registry';

/** Workspace registry management: draggable rows (reorder), a path input
 *  per workspace (retarget after moving the file outside Obsidian), rename
 *  and remove. Activation happens via the banner pills / commands. */
export function renderWorkspaceSettings(this: DashboardSettingTab, containerEl: HTMLElement): void {
	const files = this.plugin.settings.workspaceFiles;
	const names = this.plugin.settings.workspaceNames ?? [];
	const active = normalizeWorkspacePath(this.plugin.settings.dashboardFile);

	// Standalone divider (own element — themes can't round/clip it) ahead
	// of the group heading.
	containerEl.createDiv({ cls: 'dashboard-settings-divider' });
	new Setting(containerEl).setName(t('settings.workspaceList')).setDesc(t('settings.workspaceListDesc')).setHeading();

	/** Index of the row being dragged; null when idle. */
	let dragIndex: number | null = null;

	files.forEach((file, i) => {
		const name = names[i]?.trim() ?? '';
		const label = name || `#${i + 1}`;
		const isActive = normalizeWorkspacePath(file) === active;
		const setting = new Setting(containerEl).setName(isActive ? `${label} · ${t('workspace.active')}` : label);
		const rowEl = setting.settingEl;
		rowEl.addClass('dashboard-workspace-row');

		// Path input: commit on Enter/blur only (not per keystroke); the
		// refresh on failure restores the stored value.
		setting.addText((text) => {
			text.setPlaceholder('Dashboard').setValue(file);
			text.inputEl.addClass('dashboard-workspace-path-input');
			const commit = async () => {
				const value = text.inputEl.value;
				if (normalizeWorkspacePath(value) === normalizeWorkspacePath(file)) return;
				await this.plugin.retargetWorkspace(file, value);
				this.refresh();
			};
			text.inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					void commit();
				}
			});
			text.inputEl.addEventListener('blur', () => {
				void commit();
			});
		});

		setting.addExtraButton((btn) =>
			btn
				.setIcon('pencil')
				.setTooltip(t('workspace.renameTitle'))
				.onClick(async () => {
					const next = await showPromptDialog(this.app, {
						title: t('workspace.renameTitle'),
						placeholder: t('workspace.namePlaceholder'),
						defaultValue: name,
					});
					if (next !== null) {
						await this.plugin.renameWorkspace(file, next);
						this.refresh();
					}
				}),
		);

		setting.addExtraButton((btn) =>
			btn
				.setIcon('trash-2')
				.setTooltip(files.length <= 1 ? t('workspace.lastCannotRemove') : t('workspace.removeTitle'))
				.setDisabled(files.length <= 1)
				.onClick(async () => {
					const confirmed = await showConfirmDialog(this.app, {
						title: t('workspace.removeTitle'),
						message: t('workspace.removeConfirm', { name: label, file: `${file}.md` }),
					});
					if (confirmed) {
						await this.plugin.removeWorkspace(file);
						this.refresh();
					}
				}),
		);

		// Drag handle, prepended at the row's left edge. The ROW is the drag
		// source but only becomes draggable while the handle is pressed, so
		// text selection inside the path input is unaffected.
		const handle = createSpan({
			cls: 'dashboard-workspace-drag-handle',
			attr: { 'aria-label': t('workspace.dragReorder'), title: t('workspace.dragReorder') },
		});
		setIcon(handle, 'grip-vertical');
		rowEl.prepend(handle);
		handle.addEventListener('pointerdown', () => {
			rowEl.draggable = true;
		});
		handle.addEventListener('pointerup', () => {
			rowEl.draggable = false;
		});

		const clearIndicator = () => {
			rowEl.removeClass('dashboard-workspace-row--drop-before');
			rowEl.removeClass('dashboard-workspace-row--drop-after');
		};

		rowEl.addEventListener('dragstart', (e) => {
			dragIndex = i;
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', String(i));
			}
			rowEl.addClass('dashboard-workspace-row--dragging');
		});
		rowEl.addEventListener('dragend', () => {
			rowEl.draggable = false;
			rowEl.removeClass('dashboard-workspace-row--dragging');
			clearIndicator();
			dragIndex = null;
		});
		rowEl.addEventListener('dragover', (e) => {
			if (dragIndex === null || dragIndex === i) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			const before = e.offsetY < rowEl.offsetHeight / 2;
			clearIndicator();
			rowEl.addClass(before ? 'dashboard-workspace-row--drop-before' : 'dashboard-workspace-row--drop-after');
		});
		rowEl.addEventListener('dragleave', clearIndicator);
		rowEl.addEventListener('drop', (e) => {
			e.preventDefault();
			const from = dragIndex;
			clearIndicator();
			if (from === null || from === i) return;
			// Insertion point: before this row (upper half) or after it.
			const insertPos = e.offsetY < rowEl.offsetHeight / 2 ? i : i + 1;
			const to = from < insertPos ? insertPos - 1 : insertPos;
			void this.plugin.reorderWorkspaces(from, to).then(() => this.refresh());
		});
	});

	new Setting(containerEl).addButton((btn) =>
		btn
			.setButtonText(t('workspace.add'))
			.setIcon('plus')
			.onClick(async () => {
				const fallback = t('workspace.defaultName', { n: files.length + 1 });
				const name = await showPromptDialog(this.app, {
					title: t('workspace.newTitle'),
					placeholder: t('workspace.namePlaceholder'),
					defaultValue: fallback,
				});
				if (name !== null) {
					await this.plugin.createWorkspace(name === '' ? fallback : name);
					this.refresh();
				}
			}),
	);
}
