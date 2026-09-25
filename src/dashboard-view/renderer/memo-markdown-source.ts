import { memoCardText } from '../persist/card-move';
import { extractCardParts } from '../parser';
import { App, Component, MarkdownRenderer, Platform, setIcon } from 'obsidian';
import type { DashboardCard, RenderCallbacks, TaskItem, DocNode } from '../types';
import { t } from '../../shared/i18n';
import { ITEM_DRAG_TYPE } from '../ui/dnd';
import { attachFileSuggest } from '../ui/file-suggest';
import { showConfirmDialog } from '../ui/confirm-dialog';
import { attachNoteHover } from '../ui/hover-preview';
import { iconForExtension } from '../../shared/file-types';
import {
	activeHoverParent,
	activeMarkdownComponent,
	activeNoteOpener,
	docDragSource,
	getSearchableFiles,
	resolveNoteFile,
	taskDragSource,
} from './destroy-all-charts';
import { renderTaskItem, toggleCollapseInPlace } from './render-card';
import { renderTextWithLinks } from './render-text-with-links';

function taskCompletion(task: TaskItem): number {
	if (!task.children || task.children.length === 0) return task.checked ? 1 : 0;
	const sum = task.children.reduce((acc, child) => acc + taskCompletion(child), 0);
	return sum / task.children.length;
}
export function renderTaskBody(
	container: HTMLElement,
	card: DashboardCard,
	callbacks: RenderCallbacks,
	app: App,
): void {
	const list = container.createDiv({ cls: 'dashboard-task-list' });
	list.dataset.cardId = card.id;

	// When the list is empty, make it a drop target so tasks can be dragged in
	list.addEventListener('dragover', (e) => {
		if (!taskDragSource.current) return;
		if (taskDragSource.current.cardId === card.id) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		list.addClass('dashboard-task-list--drop-target');
	});

	list.addEventListener('dragleave', (e) => {
		if (!list.contains(e.relatedTarget as Node)) {
			list.removeClass('dashboard-task-list--drop-target');
		}
	});

	list.addEventListener('drop', (e) => {
		e.preventDefault();
		list.removeClass('dashboard-task-list--drop-target');
		if (!taskDragSource.current) return;
		if (taskDragSource.current.cardId === card.id) return;
		callbacks.onTaskMoveToCard(
			taskDragSource.current.cardId,
			taskDragSource.current.taskPath,
			card.id,
			[card.tasks.length],
			'before',
		);
	});

	card.tasks.forEach((task, i) => renderTaskItem(list, task, [i], card, callbacks, app, 0));

	const addRow = container.createDiv({ cls: 'dashboard-task-add' });
	const input = addRow.createEl('input', {
		cls: 'dashboard-task-input',
		attr: { type: 'text', placeholder: t('renderer.addTask') },
	});
	const taskSuggest = attachFileSuggest(input, app);
	input.addEventListener('keydown', (e) => {
		if (taskSuggest.isActive()) return;
		if (e.key === 'Enter' && input.value.trim()) {
			callbacks.onTaskAdd(card.id, input.value.trim());
			input.value = '';
		}
	});

	if (card.tasks.length > 0) {
		const sum = card.tasks.reduce((acc, task) => acc + taskCompletion(task), 0);
		const percent = Math.round((sum / card.tasks.length) * 100);

		const progressWrap = container.createDiv({ cls: 'dashboard-progress' });
		const bar = progressWrap.createDiv({ cls: 'dashboard-progress-bar' });
		bar.createDiv({
			cls: 'dashboard-progress-fill',
			attr: { style: `width: ${percent}%` },
		});
		progressWrap.createSpan({
			cls: 'dashboard-progress-text',
			text: `${percent}%`,
		});
	}
}
export function renderMemoBody(
	container: HTMLElement,
	card: DashboardCard,
	callbacks: RenderCallbacks,
	app: App,
): void {
	const text = memoCardText(card);
	let dirty = false;

	// View mode: rendered text with clickable links
	const view = container.createDiv({ cls: 'dashboard-memo-view' });
	renderMemoViewContent(view, text, app);
	view.addEventListener('click', () => {
		view.setCssProps({ display: 'none' });
		textarea.setCssProps({ display: '' });
		textarea.focus();
	});

	// Edit mode: textarea (hidden by default)
	const textarea = container.createEl('textarea', {
		cls: 'dashboard-memo-textarea',
		text: text,
		attr: { placeholder: t('renderer.writeThoughts') },
	});
	textarea.setCssProps({ display: 'none' });

	attachFileSuggest(textarea, app);

	textarea.addEventListener('input', () => {
		dirty = true;
	});

	const save = () => {
		if (!dirty) return;
		dirty = false;
		const value = textarea.value;
		const parts = extractCardParts(value);
		callbacks.onMemoUpdate(card, {
			body: parts.cleanBody,
			blockquote: parts.blockquote,
			tasks: parts.tasks,
			docs: parts.docs,
			wikiLink: '',
			url: '',
			type: 'generic',
		});
	};

	textarea.addEventListener('blur', () => {
		save();
		// If re-render didn't happen (not dirty), switch to view manually
		if (activeDocument.body.contains(view)) {
			renderMemoViewContent(view, textarea.value, app);
			view.setCssProps({ display: '' });
			textarea.setCssProps({ display: 'none' });
		}
	});
}
function renderMemoViewContent(container: HTMLElement, text: string, app: App): void {
	container.empty();
	container.removeClass('dashboard-memo-view--md');
	if (!text) {
		container.addClass('dashboard-memo-view--empty');
		container.setText(t('renderer.writeThoughts'));
		return;
	}
	container.removeClass('dashboard-memo-view--empty');

	// Instant plain-lines paint so the card never flashes empty while the
	// async markdown pass is in flight; renderMemoMarkdown swaps it out on
	// success (and leaves this paint standing on failure).
	renderMemoPlainLines(container, text, app);
	const component = activeMarkdownComponent.current;
	if (component) void renderMemoMarkdown(container, text, app, component);
}
function renderMemoPlainLines(container: HTMLElement, text: string, app: App): void {
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (i > 0) container.createEl('br');
		const line = lines[i]!;
		if (line.startsWith('> ')) {
			const quote = container.createDiv({ cls: 'dashboard-note-quote' });
			quote.setText(line.slice(2));
		} else {
			renderTextWithLinks(container, line, app);
		}
	}
}
export function memoMarkdownSource(text: string): string {
	const lines = text.split('\n');
	const out: string[] = [];
	let listBuf: string[] = [];
	let inFence = false;
	const flush = (): void => {
		if (listBuf.length > 0) {
			out.push(...listBuf, '');
			listBuf = [];
		}
	};
	for (const line of lines) {
		if (/^\s*(```|~~~)/.test(line)) {
			flush();
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (inFence) {
			out.push(line);
			continue;
		}
		const isListItem = /^(\s*)([-*+]|\d+\.)\s+/.test(line);
		const isContinuation = listBuf.length > 0 && /^\s+\S/.test(line);
		if (isListItem || isContinuation) {
			listBuf.push(line);
		} else {
			flush();
			out.push(line, '');
		}
	}
	flush();
	return out
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}
export function renderMemoMarkdown(
	container: HTMLElement,
	text: string,
	app: App,
	component: Component,
): Promise<void> {
	const host = createDiv();
	return MarkdownRenderer.render(app, memoMarkdownSource(text), host, '', component)
		.then(() => {
			if (!container.isConnected || !host.hasChildNodes()) return;
			container.empty();
			container.addClass('dashboard-memo-view--md');
			while (host.firstChild) container.appendChild(host.firstChild);
			wireMemoMarkdownLinks(container, app);
		})
		.catch(() => {
			// Keep the plain-lines paint — a render failure must not blank the card.
		});
}
function wireMemoMarkdownLinks(container: HTMLElement, app: App): void {
	container.querySelectorAll('a').forEach((raw) => {
		const a = raw as HTMLElement;
		const href = a.getAttribute('href') ?? '';
		if (a.hasClass('internal-link') || href === '' || href.startsWith('#')) {
			const target = a.getAttribute('data-href') ?? a.getText();
			const path = target.split('#')[0]!;
			const file = resolveNoteFile(app, path);
			if (file && !Platform.isMobile && activeHoverParent.current) {
				attachNoteHover(
					app,
					a,
					file,
					activeHoverParent.current,
					target.includes('#') ? `#${target.split('#').pop()}` : undefined,
				);
			}
			a.addEventListener('click', (e) => {
				e.stopPropagation();
				e.preventDefault();
				if (!file) return;
				activeNoteOpener.current?.(file, target.includes('#') ? `#${target.split('#').pop()}` : undefined);
			});
		} else if (/^https?:/i.test(href)) {
			a.addEventListener('click', (e) => {
				e.stopPropagation();
				e.preventDefault();
				window.open(href, '_blank');
			});
		}
	});
}
export function renderProjectBody(
	container: HTMLElement,
	card: DashboardCard,
	callbacks: RenderCallbacks,
	app: App,
): void {
	const collectDocPaths = (docs: DocNode[]): string[] => {
		const out: string[] = [];
		const walk = (nodes: DocNode[]) => {
			for (const n of nodes) {
				out.push(n.path);
				if (n.children) walk(n.children);
			}
		};
		walk(docs);
		return out;
	};

	const clearDragClasses = () => {
		activeDocument
			.querySelectorAll(
				'.dashboard-task-item--drag-top,.dashboard-task-item--drag-bottom,.dashboard-task-item--drag-nest,.dashboard-task-item--drag-over,.dashboard-task-item--dragging',
			)
			.forEach((el) => {
				(el as HTMLElement).removeClass(
					'dashboard-task-item--drag-top',
					'dashboard-task-item--drag-bottom',
					'dashboard-task-item--drag-nest',
					'dashboard-task-item--drag-over',
					'dashboard-task-item--dragging',
				);
			});
	};

	const docList = container.createDiv({ cls: 'dashboard-project-docs' });
	docList.dataset.cardId = card.id;

	// Empty list drop target so docs can be dragged in (appends at top-level end)
	docList.addEventListener('dragover', (e) => {
		if (!docDragSource.current) return;
		if (docDragSource.current.cardId === card.id) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		docList.addClass('dashboard-project-docs--drop-target');
	});

	docList.addEventListener('dragleave', (e) => {
		if (!docList.contains(e.relatedTarget as Node)) {
			docList.removeClass('dashboard-project-docs--drop-target');
		}
	});

	docList.addEventListener('drop', (e) => {
		e.preventDefault();
		docList.removeClass('dashboard-project-docs--drop-target');
		if (!docDragSource.current) return;
		if (docDragSource.current.cardId === card.id) return;
		const destPath = [card.docs.length];
		callbacks.onDocMoveToCard(
			docDragSource.current.cardId,
			docDragSource.current.docPath,
			card.id,
			destPath,
			'before',
		);
	});

	const renderDocItem = (doc: DocNode, path: number[], depth: number, ancestorHidden = false) => {
		const docItem = docList.createDiv({ cls: 'dashboard-project-doc-item' });
		if (depth > 0) docItem.addClass('dashboard-project-doc-item--child');
		if (ancestorHidden) docItem.addClass('dashboard-project-doc-item--hidden');
		docItem.style.marginLeft = `${depth * 18}px`;
		docItem.setAttribute('draggable', 'true');
		docItem.dataset.docPath = JSON.stringify(path);

		const hasChildren = (doc.children?.length ?? 0) > 0;
		if (hasChildren) {
			docItem.setAttribute('aria-expanded', doc.collapsed ? 'false' : 'true');
			const toggle = docItem.createDiv({ cls: 'dashboard-task-toggle dashboard-task-toggle--active' });
			toggle.setAttribute('role', 'button');
			toggle.setAttribute('aria-label', doc.collapsed ? t('renderer.expandDoc') : t('renderer.collapseDoc'));
			setIcon(toggle, doc.collapsed ? 'chevron-right' : 'chevron-down');
			// See task toggle: mutable local flag avoids the frozen closed-over
			// value now that the quiet path skips the full re-render.
			let isCollapsed = doc.collapsed;
			toggle.addEventListener('click', (e) => {
				e.stopPropagation();
				// Optimistic in-place DOM update + debounced quiet persist. Avoids
				// the full-board re-render the old collapse path triggered.
				isCollapsed = !isCollapsed;
				toggleCollapseInPlace(docItem, path, 'data-doc-path', isCollapsed);
				toggle.setAttribute('aria-label', isCollapsed ? t('renderer.expandDoc') : t('renderer.collapseDoc'));
				callbacks.onDocToggleCollapse(card.id, path);
			});
		}

		const resolved = resolveNoteFile(app, doc.path);
		const docIcon = docItem.createSpan({ cls: 'dashboard-project-doc-icon' });
		setIcon(docIcon, iconForExtension(resolved?.extension ?? ''));
		docItem.createSpan({
			text: resolved?.basename ?? doc.path.split('/').pop() ?? doc.path,
			cls: 'dashboard-project-doc-name',
		});

		if (resolved && !Platform.isMobile && activeHoverParent.current) {
			attachNoteHover(app, docItem, resolved, activeHoverParent.current);
		}

		const removeBtn = docItem.createEl('button', {
			cls: 'dashboard-project-doc-remove',
			attr: { 'aria-label': t('renderer.removeDoc') },
		});
		setIcon(removeBtn, 'x');
		removeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			void (async () => {
				const confirmed = await showConfirmDialog(app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				});
				if (!confirmed) return;
				callbacks.onDocDelete(card.id, path);
			})();
		});

		docItem.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).tagName === 'BUTTON') return;
			if (!resolved) return;
			activeNoteOpener.current?.(resolved);
		});

		docItem.addEventListener('dragstart', (e) => {
			e.stopPropagation();
			docDragSource.current = { cardId: card.id, docPath: path };
			docItem.addClass('dashboard-task-item--dragging');
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', JSON.stringify(path));
				// Marks this as an in-card item drag so the card-level
				// file-drop layer (dropEffect='link' override) stands down.
				e.dataTransfer.setData(ITEM_DRAG_TYPE, '1');
			}
		});

		docItem.addEventListener('dragend', () => {
			docItem.removeClass('dashboard-task-item--dragging');
			clearDragClasses();
			docDragSource.current = null;
		});

		docItem.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (!docDragSource.current) return;
			const sameNode =
				docDragSource.current.cardId === card.id &&
				JSON.stringify(docDragSource.current.docPath) === JSON.stringify(path);
			if (sameNode) return;
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			clearDragClasses();
			const rect = docItem.getBoundingClientRect();
			const ratio = (e.clientY - rect.top) / rect.height;
			if (ratio < 0.3) docItem.addClass('dashboard-task-item--drag-top');
			else if (ratio > 0.7) docItem.addClass('dashboard-task-item--drag-bottom');
			else docItem.addClass('dashboard-task-item--drag-nest');
		});

		docItem.addEventListener('dragleave', () => {
			docItem.removeClass('dashboard-task-item--drag-top');
			docItem.removeClass('dashboard-task-item--drag-bottom');
			docItem.removeClass('dashboard-task-item--drag-nest');
		});

		docItem.addEventListener('drop', (e) => {
			e.preventDefault();
			e.stopPropagation();
			clearDragClasses();
			if (!docDragSource.current) return;
			const sameNode =
				docDragSource.current.cardId === card.id &&
				JSON.stringify(docDragSource.current.docPath) === JSON.stringify(path);
			if (sameNode) return;

			const rect = docItem.getBoundingClientRect();
			const ratio = (e.clientY - rect.top) / rect.height;
			const src = docDragSource.current;

			if (src.cardId === card.id) {
				if (ratio < 0.3) callbacks.onDocReorder(card.id, src.docPath, path, true);
				else if (ratio > 0.7) callbacks.onDocReorder(card.id, src.docPath, path, false);
				else callbacks.onDocNest(card.id, src.docPath);
			} else {
				const mode: 'before' | 'after' | 'nest' = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'nest';
				callbacks.onDocMoveToCard(src.cardId, src.docPath, card.id, path, mode);
			}
		});

		// CONTRACT: always render children, even when collapsed (see task
		// branch for the full rationale). Do not gate on `!doc.collapsed`.
		if (hasChildren) {
			const childHidden = ancestorHidden || doc.collapsed;
			doc.children!.forEach((child, i) => renderDocItem(child, [...path, i], depth + 1, childHidden));
		}
	};

	card.docs.forEach((doc, i) => renderDocItem(doc, [i], 0));

	const addDocRow = container.createDiv({ cls: 'dashboard-project-add-doc' });
	const docInput = addDocRow.createEl('input', {
		cls: 'dashboard-task-input',
		attr: { type: 'text', placeholder: t('renderer.addDocument') },
	});

	const docResults = addDocRow.createDiv({ cls: 'dashboard-project-doc-results' });

	docInput.addEventListener('input', () => {
		docResults.empty();
		const q = docInput.value.toLowerCase().trim();
		if (!q) return;

		const currentPaths = collectDocPaths(card.docs);
		const files = getSearchableFiles(app)
			.filter((f) => !f.path.startsWith('.'))
			.filter((f) => f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q))
			.filter((f) => !currentPaths.includes(f.path))
			.slice(0, 50);

		for (const file of files) {
			const item = docResults.createDiv({ cls: 'dashboard-project-doc-result' });
			item.setText(file.basename);
			item.addEventListener('click', () => {
				callbacks.onDocAdd(card.id, file.path);
			});
		}
	});

	docInput.addEventListener('blur', () => {
		window.setTimeout(() => docResults.empty(), 200);
	});
}
