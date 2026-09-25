import { App, setIcon } from 'obsidian';
import type { DashboardData, DashboardCard, RenderCallbacks, TaskItem, DashboardSettings, CardSize } from '../types';
import { t } from '../../shared/i18n';
import { resolveVaultImage } from '../banner/banner';
import { ITEM_DRAG_TYPE } from '../ui/dnd';
import { docDragSource, taskDragSource } from './destroy-all-charts';
import { renderMemoBody, renderProjectBody, renderTaskBody } from './memo-markdown-source';
import {
	createReminderButton,
	renderTextWithLinks,
	renderTrackerBody,
	renderWeatherBody,
} from './render-text-with-links';

export function renderCard(
	card: DashboardCard,
	columnName: string,
	sectionType: string,
	callbacks: RenderCallbacks,
	app: App,
	data?: DashboardData,
	settings?: DashboardSettings,
): HTMLElement {
	const el = createDiv();
	el.addClass('dashboard-card', `dashboard-card--${card.type}`);
	el.dataset.cardId = card.id;
	el.dataset.cardType = card.type;
	el.setAttribute('role', 'article');
	el.setAttribute('aria-label', card.title);

	if (card.color) {
		el.dataset.hasColor = 'true';
		el.style.setProperty('--db-card-accent', card.color);
	}

	const isMemo = isMemoCard(sectionType, card);
	const isTask = !isMemo && (card.type === 'task' || sectionType === 'todo');
	const isWeather = card.type === 'weather';
	const isTracker = card.type === 'tracker';
	const isWidget = isWeather || isTracker;
	const isProjectLike = !isMemo && !isTask && !isWidget;
	const isDashboardSection = sectionType === 'dashboard';
	const showCover =
		isProjectLike &&
		!isDashboardSection &&
		sectionType !== 'notes' &&
		(sectionType !== 'sticky' || card.noteStyle !== 'plain');

	if (showCover) {
		el.addClass('dashboard-card--cover');
	}

	if (card.coverImage && showCover) {
		const resolved = resolveVaultImage(app, card.coverImage);
		if (resolved) {
			const cover = el.createDiv({ cls: 'dashboard-project-cover' });
			cover.style.backgroundImage = `url("${resolved}")`;
			cover.setAttribute('draggable', 'true');
		} else {
			const cover = el.createDiv({ cls: 'dashboard-project-cover dashboard-project-cover--default' });
			cover.setAttribute('draggable', 'true');
		}
	} else if (showCover) {
		const cover = el.createDiv({ cls: 'dashboard-project-cover dashboard-project-cover--default' });
		cover.setAttribute('draggable', 'true');
	}

	const header = el.createDiv({ cls: 'dashboard-card-header' });
	header.setAttribute('draggable', 'true');

	// Mobile: tap header to toggle card action buttons
	header.addEventListener(
		'touchstart',
		() => {
			const wasActive = header.hasClass('dashboard-card-header--touched');
			activeDocument.querySelectorAll('.dashboard-card-header--touched').forEach((el) => {
				el.removeClass('dashboard-card-header--touched');
			});
			if (!wasActive) {
				header.addClass('dashboard-card-header--touched');
			}
		},
		{ passive: true },
	);

	const titleEl = header.createEl('h4', { text: card.title, cls: 'dashboard-card-title' });

	const skipEditBtn = isMemo || isTask || (isWidget && isDashboardSection);

	titleEl.addEventListener('dblclick', (e) => {
		e.stopPropagation();
		const currentTitle = titleEl.getText();
		titleEl.empty();
		const input = titleEl.createEl('input', {
			cls: 'dashboard-title-edit-input',
			attr: { type: 'text', value: currentTitle },
		});
		input.focus();
		input.select();

		const finish = (save: boolean) => {
			const newTitle = input.value.trim();
			if (save && newTitle && newTitle !== currentTitle) {
				callbacks.onCardTitleEdit(card.id, newTitle);
			} else {
				titleEl.empty();
				titleEl.setText(currentTitle);
			}
		};

		input.addEventListener('keydown', (ke: KeyboardEvent) => {
			if (ke.key === 'Enter') {
				ke.preventDefault();
				finish(true);
			} else if (ke.key === 'Escape') {
				ke.preventDefault();
				finish(false);
			}
		});

		input.addEventListener('blur', () => {
			finish(true);
		});
	});
	titleEl.setCssProps({ cursor: 'pointer' });

	const actions = header.createDiv({ cls: 'dashboard-card-actions' });

	// Dashboard grid layout for widget cards
	if (isWidget && isDashboardSection) {
		const currentSize: CardSize = card.size || 'M';
		const sizeToGrid: Record<CardSize, { cols: number; rows: number }> = {
			S: { cols: 1, rows: 1 },
			M: { cols: 2, rows: 1 },
			L: { cols: 2, rows: 2 },
		};
		const grid = sizeToGrid[currentSize];
		el.style.gridColumn = `span ${grid.cols}`;
		el.style.gridRow = `span ${grid.rows}`;

		// Size selector button for dashboard widgets only
		const sizeBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn dashboard-card-btn--size',
			attr: { 'aria-label': 'Card size' },
		});
		sizeBtn.setText(t('widget.size' + currentSize));
		sizeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const sizes: CardSize[] = ['S', 'M', 'L'];
			const nextIdx = (sizes.indexOf(currentSize) + 1) % sizes.length;
			const nextSize = sizes[nextIdx]!;
			callbacks.onCardSizeChange(card.id, nextSize);
		});
	}

	if ((isMemo && (card.type === 'generic' || card.type === 'note')) || isWidget) {
		const colorBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn dashboard-card-btn--color',
			attr: { 'aria-label': t('renderer.setMemoColor') },
		});
		setIcon(colorBtn, 'palette');
		if (card.color) {
			colorBtn.style.color = card.color;
		}
		colorBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const input = createEl('input');
			input.type = 'color';
			input.value = card.color || '#f59e0b';
			input.setCssProps({
				position: 'absolute',
				opacity: '0',
				width: '0',
				height: '0',
			});
			activeDocument.body.appendChild(input);
			input.addEventListener('input', () => {
				callbacks.onMemoColorChange(card, input.value);
			});
			input.addEventListener('change', () => {
				if (input.value) {
					callbacks.onMemoColorChange(card, input.value);
				}
				input.remove();
			});
			input.addEventListener('blur', () => {
				input.remove();
			});
			input.click();
		});
	}

	// Per-card "new note" (notes/projects sections only): creates a note and
	// attaches it to this card's doc list (view.handleCardNewNote). Rendered
	// FIRST in the actions row so it sits left of edit + delete.
	if (isProjectLike && (sectionType === 'notes' || sectionType === 'projects')) {
		const newNoteBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn dashboard-card-btn--newnote',
			attr: { 'aria-label': t('renderer.cardNewNote') },
		});
		setIcon(newNoteBtn, 'file-plus');
		newNoteBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onCardNewNote(card.id);
		});
	}

	if (!skipEditBtn) {
		const editBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn',
			attr: { 'aria-label': t('renderer.editCard') },
		});
		setIcon(editBtn, 'pencil');
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onCardEdit(card);
		});
	}

	if (isMemo) {
		const saveBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn',
			attr: { 'aria-label': t('renderer.saveMemoAsNote') },
		});
		setIcon(saveBtn, 'file-down');
		saveBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onMemoSaveAsNote(card);
		});
	}

	if (isTask) {
		const saveBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn',
			attr: { 'aria-label': t('renderer.saveTasksToDaily') },
		});
		setIcon(saveBtn, 'save');
		saveBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onTaskSaveToDaily(card);
		});
	}

	const deleteBtn = actions.createEl('button', {
		cls: 'dashboard-card-btn dashboard-card-btn--danger',
		attr: { 'aria-label': t('renderer.deleteCard') },
	});
	setIcon(deleteBtn, 'trash-2');
	deleteBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.onCardDelete(card.id);
	});

	const body = el.createDiv({ cls: 'dashboard-card-body' });

	// When this is a project-like card, allow dropping docs onto the card body
	if (isProjectLike) {
		body.addEventListener('dragover', (e) => {
			if (!docDragSource.current) return;
			if (docDragSource.current.cardId === card.id) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			body.addClass('dashboard-card-body--doc-drop');
		});

		body.addEventListener('dragleave', (e) => {
			if (!body.contains(e.relatedTarget as Node)) {
				body.removeClass('dashboard-card-body--doc-drop');
			}
		});

		body.addEventListener('drop', (e) => {
			body.removeClass('dashboard-card-body--doc-drop');
			if (!docDragSource.current) return;
			if (docDragSource.current.cardId === card.id) return;
			if (e.defaultPrevented) return;
			e.preventDefault();
			const destPath = [card.docs.length];
			callbacks.onDocMoveToCard(
				docDragSource.current.cardId,
				docDragSource.current.docPath,
				card.id,
				destPath,
				'before',
			);
		});
	}

	renderCardBody(body, card, columnName, sectionType, callbacks, app, data, settings);

	if (card.dueDate) {
		const due = el.createDiv({ cls: 'dashboard-card-due' });
		due.createSpan({ text: card.dueDate });
	}

	if (isMemo) {
		if (card.width > 0) {
			const w = Math.max(200, Math.min(600, card.width));
			el.style.flex = `0 0 ${w}px`;
			el.style.minWidth = `${w}px`;
			el.style.maxWidth = `${w}px`;
		}
	}

	// Dashboard grid layout for widget cards (styles only, button already created above)
	if (isWidget && isDashboardSection) {
		// grid styles already set above when creating the size button
	} else if (isMemo || isTask || isProjectLike) {
		const minW = 200;
		const maxW = 600;
		if (!isMemo && card.width > 0) {
			const w = Math.max(minW, Math.min(500, card.width));
			el.style.flex = `0 0 ${w}px`;
			el.style.minWidth = `${w}px`;
			el.style.maxWidth = `${w}px`;
		}
		const handle = el.createDiv({ cls: 'dashboard-card-resize-handle' });
		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const startX = e.clientX;
			const startWidth = el.offsetWidth;
			el.addClass('dashboard-card--resizing');

			const onMove = (ev: MouseEvent) => {
				const delta = ev.clientX - startX;
				const newWidth = Math.max(minW, Math.min(maxW, startWidth + delta));
				el.style.flex = `0 0 ${newWidth}px`;
				el.style.minWidth = `${newWidth}px`;
				el.style.maxWidth = `${newWidth}px`;
			};

			const onUp = (ev: MouseEvent) => {
				activeDocument.removeEventListener('mousemove', onMove);
				activeDocument.removeEventListener('mouseup', onUp);
				el.removeClass('dashboard-card--resizing');
				const finalWidth = Math.max(minW, Math.min(maxW, startWidth + (ev.clientX - startX)));
				if (finalWidth !== card.width) {
					callbacks.onCardWidthChange(card.id, finalWidth);
				}
			};

			activeDocument.addEventListener('mousemove', onMove);
			activeDocument.addEventListener('mouseup', onUp);
		});
	}

	return el;
}
function isMemoCard(sectionType: string, card: DashboardCard): boolean {
	if (sectionType === 'memo') return true;
	return sectionType === 'sticky' && (card.type === 'generic' || card.type === 'note');
}
function renderCardBody(
	container: HTMLElement,
	card: DashboardCard,
	columnName: string,
	sectionType: string,
	callbacks: RenderCallbacks,
	app: App,
	data?: DashboardData,
	settings?: DashboardSettings,
): void {
	if (card.type === 'weather') {
		renderWeatherBody(container, card, app);
		return;
	}

	if (card.type === 'tracker') {
		renderTrackerBody(container, card, app, settings);
		return;
	}

	const isMemo = isMemoCard(sectionType, card);
	const isTaskCard = !isMemo && (card.type === 'task' || sectionType === 'todo');

	if (isTaskCard) {
		renderTaskBody(container, card, callbacks, app);
		return;
	}

	if (isMemo) {
		renderMemoBody(container, card, callbacks, app);
		return;
	}

	// All non-memo, non-task cards render as project body
	renderProjectBody(container, card, callbacks, app);
}
function isDescendantPath(parentPath: number[], maybeChildPath: number[]): boolean {
	if (maybeChildPath.length <= parentPath.length) return false;
	for (let i = 0; i < parentPath.length; i++) {
		if (maybeChildPath[i] !== parentPath[i]) return false;
	}
	return true;
}
function readPathAttr(el: Element, attr: string): number[] {
	try {
		const raw = el.getAttribute(attr);
		return raw ? (JSON.parse(raw) as number[]) : [];
	} catch {
		return [];
	}
}
export function toggleCollapseInPlace(
	item: HTMLElement,
	parentPath: number[],
	pathAttr: string,
	nowCollapsed: boolean,
): void {
	const list = item.parentElement;
	if (!list) return;

	// Flip the chevron icon + record the new state as the DOM truth source.
	const toggle = item.querySelector(':scope > .dashboard-task-toggle');
	if (toggle instanceof HTMLElement) {
		setIcon(toggle, nowCollapsed ? 'chevron-right' : 'chevron-down');
	}
	item.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');

	// Build a path-keyed map of every item's expanded state ONCE, so the per-
	// descendant ancestor walk is O(1) per step instead of re-querying the list
	// (which made a single toggle O(n²) on large trees).
	const expandedByPath = new Map<string, boolean>();
	list.querySelectorAll<HTMLElement>(`:scope > [${pathAttr}]`).forEach((el) => {
		expandedByPath.set(JSON.stringify(readPathAttr(el, pathAttr)), el.getAttribute('aria-expanded') !== 'false');
	});

	// Recompute visibility for every descendant: show only if every ancestor on
	// its path prefix is currently expanded (read from the map above).
	list.querySelectorAll<HTMLElement>(`:scope > [${pathAttr}]`).forEach((sibling) => {
		if (sibling === item) return;
		const siblingPath = readPathAttr(sibling, pathAttr);
		if (!isDescendantPath(parentPath, siblingPath)) return;

		let hidden = false;
		// Walk every strict ancestor index of siblingPath (skip the node itself).
		for (let len = parentPath.length; len < siblingPath.length; len++) {
			const ancestorExpanded = expandedByPath.get(JSON.stringify(siblingPath.slice(0, len)));
			// Fail-safe: a strict prefix should always be a parent that exists in a
			// well-formed render. If it's missing, hide rather than risk leaking a
			// subtree due to stale/DOM drift.
			if (ancestorExpanded === false || ancestorExpanded === undefined) {
				hidden = true;
				break;
			}
		}
		sibling.toggleClass('dashboard-task-item--hidden', hidden);
		sibling.toggleClass('dashboard-project-doc-item--hidden', hidden);
	});
}
export function renderTaskItem(
	list: HTMLElement,
	task: TaskItem,
	path: number[],
	card: DashboardCard,
	callbacks: RenderCallbacks,
	app: App,
	depth: number,
	ancestorHidden = false,
): void {
	const item = list.createDiv({ cls: 'dashboard-task-item' });
	if (depth > 0) item.addClass('dashboard-task-item--child');
	if (ancestorHidden) item.addClass('dashboard-task-item--hidden');
	item.style.marginLeft = `${depth * 18}px`;
	item.setAttribute('draggable', 'true');
	item.dataset.taskPath = JSON.stringify(path);
	item.dataset.cardId = card.id;

	const clearDragClasses = () => {
		item.removeClass('dashboard-task-item--drag-top');
		item.removeClass('dashboard-task-item--drag-bottom');
		item.removeClass('dashboard-task-item--drag-nest');
	};

	// Mobile gestures: tap (show buttons), long-press (drag), quick-swipe (nest/unnest)
	let touchState: {
		startX: number;
		startY: number;
		startT: number;
		moved: boolean;
		dragging: boolean;
		timer: number | null;
	} | null = null;

	item.addEventListener(
		'touchstart',
		(e) => {
			const tch = e.touches[0];
			if (!tch) return;
			touchState = {
				startX: tch.clientX,
				startY: tch.clientY,
				startT: Date.now(),
				moved: false,
				dragging: false,
				timer: null,
			};
			touchState.timer = window.setTimeout(() => {
				if (touchState && !touchState.moved) {
					touchState.dragging = true;
					item.addClass('dashboard-task-item--dragging');
				}
			}, 500);
		},
		{ passive: true },
	);

	item.addEventListener(
		'touchmove',
		(e) => {
			if (!touchState) return;
			const tch = e.touches[0];
			if (!tch) return;
			const dx = tch.clientX - touchState.startX;
			const dy = tch.clientY - touchState.startY;
			if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
				touchState.moved = true;
				if (touchState.timer) {
					window.clearTimeout(touchState.timer);
					touchState.timer = null;
				}
			}
			if (!touchState.dragging && touchState.moved && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
				item.style.transform = `translateX(${Math.max(-40, Math.min(40, dx * 0.5))}px)`;
			}
		},
		{ passive: true },
	);

	item.addEventListener(
		'touchend',
		(e) => {
			const ts = touchState;
			touchState = null;
			item.setCssProps({ transform: '' });
			if (!ts) return;
			if (ts.timer) window.clearTimeout(ts.timer);
			if (ts.dragging) {
				item.removeClass('dashboard-task-item--dragging');
				return;
			}
			const tch = e.changedTouches[0];
			const dx = tch ? tch.clientX - ts.startX : 0;
			const dy = tch ? tch.clientY - ts.startY : 0;
			const dt = Date.now() - ts.startT;
			const isSwipe = dt < 500 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5;
			if (isSwipe) {
				if (dx > 0) callbacks.onTaskNest(card.id, path);
				else callbacks.onTaskUnnest(card.id, path);
				return;
			}
			if (!ts.moved) {
				const wasActive = item.hasClass('dashboard-task-item--touched');
				activeDocument.querySelectorAll('.dashboard-task-item--touched').forEach((el) => {
					el.removeClass('dashboard-task-item--touched');
				});
				if (!wasActive) item.addClass('dashboard-task-item--touched');
			}
		},
		{ passive: true },
	);

	item.addEventListener(
		'touchcancel',
		() => {
			if (touchState?.timer) window.clearTimeout(touchState.timer);
			touchState = null;
			item.setCssProps({ transform: '' });
			item.removeClass('dashboard-task-item--dragging');
		},
		{ passive: true },
	);

	const hasChildren = (task.children?.length ?? 0) > 0;
	if (hasChildren) {
		item.setAttribute('aria-expanded', task.collapsed ? 'false' : 'true');
		const toggle = item.createDiv({ cls: 'dashboard-task-toggle dashboard-task-toggle--active' });
		toggle.setAttribute('role', 'button');
		toggle.setAttribute('aria-label', task.collapsed ? t('renderer.expandTask') : t('renderer.collapseTask'));
		setIcon(toggle, task.collapsed ? 'chevron-right' : 'chevron-down');
		// Track collapse state locally. The quiet toggle path no longer rebuilds
		// the DOM (no full re-render), so the closed-over `task` reference would
		// stay frozen at its initial value and the chevron could only ever fold
		// once. This mutable flag is the source of truth for the click handler.
		let isCollapsed = task.collapsed;
		toggle.addEventListener('click', (e) => {
			e.stopPropagation();
			// Optimistic in-place DOM update + debounced quiet persist. Avoids the
			// full-board re-render the old collapse path triggered.
			isCollapsed = !isCollapsed;
			toggleCollapseInPlace(item, path, 'data-task-path', isCollapsed);
			toggle.setAttribute('aria-label', isCollapsed ? t('renderer.expandTask') : t('renderer.collapseTask'));
			callbacks.onTaskToggleCollapse(card.id, path);
		});
	}

	const checkbox = item.createEl('input', {
		cls: 'dashboard-task-checkbox',
		attr: { type: 'checkbox' },
	});
	checkbox.checked = task.checked;
	checkbox.addEventListener('change', () => {
		callbacks.onCheckboxToggle(card.id, path, checkbox.checked);
	});

	const label = item.createSpan({
		cls: task.checked ? 'dashboard-task-text dashboard-task-text--done' : 'dashboard-task-text',
	});
	renderTextWithLinks(label, task.text, app);
	label.addEventListener('dblclick', (e) => {
		e.stopPropagation();
		const currentText = label.getText();
		label.empty();
		item.setAttribute('draggable', 'false');

		const textarea = label.createEl('textarea', {
			cls: 'dashboard-task-edit-textarea',
			text: task.text,
		});

		const autoResize = () => {
			textarea.setCssProps({ height: 'auto' });
			textarea.style.height = textarea.scrollHeight + 'px';
		};
		autoResize();
		textarea.focus();
		textarea.setSelectionRange(textarea.value.length, textarea.value.length);

		const finish = (save: boolean) => {
			const newText = textarea.value.trim();
			if (save && newText && newText !== task.text) {
				callbacks.onTaskEdit(card.id, path, newText);
			} else {
				label.empty();
				label.setText(currentText);
			}
			item.setAttribute('draggable', 'true');
		};

		textarea.addEventListener('input', autoResize);
		textarea.addEventListener('keydown', (ke) => {
			if (ke.key === 'Enter' && !ke.shiftKey) {
				ke.preventDefault();
				finish(true);
			} else if (ke.key === 'Escape') {
				ke.preventDefault();
				finish(false);
			}
		});
		textarea.addEventListener('blur', () => finish(true));
	});

	const delBtn = item.createEl('button', {
		cls: 'dashboard-task-delete',
		attr: { 'aria-label': t('renderer.deleteTask') },
	});
	setIcon(delBtn, 'x');
	delBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.onTaskDelete(card.id, path);
	});

	const reminderBtn = createReminderButton(item, card.id, path, task, callbacks);
	item.appendChild(reminderBtn);

	item.addEventListener('dragstart', (e) => {
		e.stopPropagation();
		taskDragSource.current = { cardId: card.id, taskPath: path };
		item.addClass('dashboard-task-item--dragging');
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', JSON.stringify(path));
			// Marks this as an in-card item drag so the card-level file-drop
			// layer (which would force dropEffect='link' and kill the drop)
			// and the section-row handlers stand down.
			e.dataTransfer.setData(ITEM_DRAG_TYPE, '1');
		}
	});

	item.addEventListener('dragend', () => {
		item.removeClass('dashboard-task-item--dragging');
		activeDocument
			.querySelectorAll(
				'.dashboard-task-item--drag-top,.dashboard-task-item--drag-bottom,.dashboard-task-item--drag-nest',
			)
			.forEach((el) =>
				el.removeClass(
					'dashboard-task-item--drag-top',
					'dashboard-task-item--drag-bottom',
					'dashboard-task-item--drag-nest',
				),
			);
		taskDragSource.current = null;
	});

	item.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (!taskDragSource.current) return;
		const sameNode =
			taskDragSource.current.cardId === card.id &&
			JSON.stringify(taskDragSource.current.taskPath) === JSON.stringify(path);
		if (sameNode) return;
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		activeDocument
			.querySelectorAll(
				'.dashboard-task-item--drag-top,.dashboard-task-item--drag-bottom,.dashboard-task-item--drag-nest',
			)
			.forEach((el) =>
				el.removeClass(
					'dashboard-task-item--drag-top',
					'dashboard-task-item--drag-bottom',
					'dashboard-task-item--drag-nest',
				),
			);
		const rect = item.getBoundingClientRect();
		const ratio = (e.clientY - rect.top) / rect.height;
		if (ratio < 0.3) item.addClass('dashboard-task-item--drag-top');
		else if (ratio > 0.7) item.addClass('dashboard-task-item--drag-bottom');
		else item.addClass('dashboard-task-item--drag-nest');
	});

	item.addEventListener('dragleave', () => {
		clearDragClasses();
	});

	item.addEventListener('drop', (e) => {
		e.preventDefault();
		e.stopPropagation();
		clearDragClasses();
		if (!taskDragSource.current) return;
		const sameNode =
			taskDragSource.current.cardId === card.id &&
			JSON.stringify(taskDragSource.current.taskPath) === JSON.stringify(path);
		if (sameNode) return;

		const rect = item.getBoundingClientRect();
		const ratio = (e.clientY - rect.top) / rect.height;
		const src = taskDragSource.current;

		if (src.cardId === card.id) {
			if (ratio < 0.3) callbacks.onTaskReorder(card.id, src.taskPath, path, true);
			else if (ratio > 0.7) callbacks.onTaskReorder(card.id, src.taskPath, path, false);
			else callbacks.onTaskNestInto(card.id, src.taskPath, path);
		} else {
			const mode: 'before' | 'after' | 'nest' = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'nest';
			callbacks.onTaskMoveToCard(src.cardId, src.taskPath, card.id, path, mode);
		}
	});

	// CONTRACT: always render children, even when collapsed. The in-place
	// toggle (`toggleCollapseInPlace`) can only show/hide DOM that already
	// exists — if collapsed subtrees were skipped here, an expand after any full
	// re-render (e.g. checking a sibling task) would find nothing to unhide and
	// the chevron would appear dead. Do NOT "optimize" this back to
	// `!task.collapsed` — that was the bug. Collapsed subtrees are hidden via the
	// `--hidden` class (driven by `ancestorHidden`), not by omitting the DOM.
	// Trade-off: a deeply collapsed tree pays DOM-creation cost on full render;
	// acceptable because full render is low-frequency (chevron clicks are O(n)
	// in-place, not re-renders).
	if (task.children && task.children.length > 0) {
		const childHidden = ancestorHidden || task.collapsed;
		for (let i = 0; i < task.children.length; i++) {
			renderTaskItem(list, task.children[i]!, [...path, i], card, callbacks, app, depth + 1, childHidden);
		}
	}
}
