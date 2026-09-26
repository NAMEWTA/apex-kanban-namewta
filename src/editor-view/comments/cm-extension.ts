import { EditorState, StateEffect, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { makeAnchor, selectionIsCommentable } from './anchor';
import { getCommentStore } from './store';
import type DashboardPlugin from '../../plugin/main';
import { t } from '../../shared/i18n';

const bump = StateEffect.define<number>();

function pathOf(state: EditorState): string | null {
	const info = state.field(editorInfoField, false);
	const path = info?.file?.path ?? null;
	return path && path.endsWith('.md') ? path : null;
}

function buildDecorations(view: EditorView, plugin: DashboardPlugin): DecorationSet {
	if (!plugin.settings.editorWorkbench.highlightEnabled) return Decoration.none;
	const path = pathOf(view.state);
	const store = getCommentStore();
	if (!path || !store) return Decoration.none;
	const ranges: { from: number; to: number; id: string }[] = [];
	const docLen = view.state.doc.length;
	for (const thread of store.threadsFor(path)) {
		if (thread.status === 'orphaned') continue;
		const from = thread.target.start;
		const to = thread.target.end;
		if (from < 0 || to <= from || to > docLen) continue;
		if (view.state.doc.sliceString(from, to) !== thread.target.quote.exact) continue;
		ranges.push({ from, to, id: thread.id });
	}
	ranges.sort((a, b) => a.from - b.from || a.to - b.to);
	const marks = [];
	let cursor = 0;
	for (const range of ranges) {
		if (range.from < cursor) continue;
		marks.push(
			Decoration.mark({
				class: 'apex-comment-hl',
				attributes: { 'data-comment-id': range.id },
			}).range(range.from, range.to),
		);
		cursor = range.to;
	}
	return Decoration.set(marks, true);
}

/** CodeMirror 6 highlights + selection popover. Registered by the host, not the side panel. */
export function commentsCmExtension(plugin: DashboardPlugin): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			private popover: HTMLElement | null = null;
			private dead = false;
			private applying = false;
			private readonly off: () => void;
			private readonly onClick: (event: MouseEvent) => void;

			constructor(private readonly view: EditorView) {
				this.decorations = buildDecorations(view, plugin);
				const store = getCommentStore();
				this.off = store
					? store.subscribe(() => {
							if (this.applying || this.dead) return;
							queueMicrotask(() => {
								if (this.dead) return;
								this.view.dispatch({ effects: bump.of(store.revision) });
							});
						})
					: () => undefined;
				this.onClick = (event) => {
					const target = event.target;
					if (!(target instanceof HTMLElement)) return;
					const mark = target.closest('.apex-comment-hl');
					if (!(mark instanceof HTMLElement)) return;
					const id = mark.dataset['commentId'];
					if (id) getCommentStore()?.focus(id);
				};
				view.dom.addEventListener('click', this.onClick);
				const path = pathOf(view.state);
				if (path && store) {
					void store.loadFile(path).then(() => {
						if (this.dead) return;
						store.reconcile(path, view.state.doc.toString());
						this.view.dispatch({ effects: bump.of(store.revision) });
					});
				}
				this.queuePopover(view);
			}

			update(update: ViewUpdate): void {
				const store = getCommentStore();
				const path = pathOf(update.state) ?? pathOf(update.startState);
				if (update.docChanged && store && path) {
					this.applying = true;
					store.applyChanges(path, update.changes, update.state.doc.toString());
					this.applying = false;
				}
				const refreshed = update.transactions.some((tr) => tr.effects.some((effect) => effect.is(bump)));
				if (update.docChanged || refreshed || update.viewportChanged) {
					this.decorations = buildDecorations(update.view, plugin);
				}
				if (
					update.docChanged ||
					update.selectionSet ||
					update.viewportChanged ||
					update.geometryChanged ||
					update.focusChanged ||
					refreshed
				) {
					this.queuePopover(update.view);
				}
			}

			destroy(): void {
				this.dead = true;
				this.off();
				this.view.dom.removeEventListener('click', this.onClick);
				this.popover?.remove();
				this.popover = null;
			}

			private popoverShouldShow(view: EditorView): boolean {
				const store = getCommentStore();
				const path = pathOf(view.state);
				const selection = view.state.selection.main;
				return (
					plugin.settings.editorWorkbench.popoverEnabled &&
					!!store &&
					!!path &&
					!selection.empty &&
					selectionIsCommentable(view.state.doc.toString(), selection.from, selection.to)
				);
			}

			/** Position the popover after layout. coordsAtPos is illegal during update. */
			private queuePopover(view: EditorView): void {
				if (!this.popoverShouldShow(view)) {
					this.popover?.remove();
					this.popover = null;
					return;
				}
				view.requestMeasure({
					key: this,
					read: (measured) => {
						if (this.dead || !this.popoverShouldShow(measured)) return null;
						const selection = measured.state.selection.main;
						const coords = measured.coordsAtPos(selection.from);
						const path = pathOf(measured.state);
						if (!coords || !path) return null;
						return { coords, path, from: selection.from, to: selection.to };
					},
					write: (place, measured) => {
						if (this.dead) return;
						if (!place) {
							this.popover?.remove();
							this.popover = null;
							return;
						}
						const pop = this.ensurePopover(measured);
						const input = pop.querySelector('textarea');
						if (!(input instanceof HTMLTextAreaElement) || input.hidden) {
							pop.dataset['path'] = place.path;
							pop.dataset['from'] = String(place.from);
							pop.dataset['to'] = String(place.to);
						}
						pop.style.left = `${Math.max(8, place.coords.left)}px`;
						pop.style.top = `${Math.max(8, place.coords.top - 36)}px`;
					},
				});
			}

			private ensurePopover(view: EditorView): HTMLElement {
				if (this.popover) return this.popover;
				const doc = view.dom.ownerDocument;
				const pop = doc.createElement('div');
				pop.className = 'apex-comment-popover';
				const button = doc.createElement('button');
				button.type = 'button';
				button.className = 'apex-comment-popover-btn';
				button.textContent = t('editor.comments.popover');
				const input = doc.createElement('textarea');
				input.className = 'apex-comment-popover-input';
				input.placeholder = t('editor.comments.placeholder');
				input.hidden = true;
				button.addEventListener('mousedown', (event) => event.preventDefault());
				input.addEventListener('mousedown', (event) => event.stopPropagation());
				button.addEventListener('click', () => {
					input.hidden = false;
					button.hidden = true;
					input.focus();
				});
				const submit = () => {
					const text = input.value.trim();
					if (!text) return;
					const notePath = pop.dataset['path'];
					const from = Number(pop.dataset['from']);
					const to = Number(pop.dataset['to']);
					const store = getCommentStore();
					if (!store || !notePath || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
					const docText = view.state.doc.toString();
					void store.add(notePath, {
						quote: makeAnchor(docText, from, to),
						start: from,
						end: to,
						text,
					});
					input.value = '';
					input.hidden = true;
					button.hidden = false;
					view.focus();
				};
				input.addEventListener('keydown', (event) => {
					if (event.key === 'Enter' && !event.shiftKey) {
						event.preventDefault();
						submit();
					} else if (event.key === 'Escape') {
						event.preventDefault();
						input.hidden = true;
						button.hidden = false;
						view.focus();
					}
				});
				pop.append(button, input);
				doc.body.append(pop);
				this.popover = pop;
				return pop;
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}
