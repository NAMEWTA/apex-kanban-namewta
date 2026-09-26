import { MarkdownView, TFile, type App } from 'obsidian';
import { makeAnchor, selectionIsCommentable } from './anchor';
import { askText } from './prompt';
import { getCommentStore, type CommentStore } from './store';
import type { CommentThread } from './model';
import type DashboardPlugin from '../../plugin/main';
import { t } from '../../shared/i18n';

export interface CommentPanelContext {
	app: App;
	plugin: DashboardPlugin;
	file: TFile | null;
}

/** Side-panel thread list. Unmounting this does not remove editor highlights. */
export function mountCommentsPanel(el: HTMLElement, ctx: CommentPanelContext): () => void {
	const store = getCommentStore();
	el.empty();
	el.addClass('apex-editor-comments');
	if (!store) {
		el.createDiv({ text: t('editor.comments.noFile') });
		return () => undefined;
	}
	const path = ctx.file?.extension === 'md' ? ctx.file.path : null;
	let disposed = false;
	const render = () => {
		if (disposed) return;
		const active = el.ownerDocument.activeElement;
		if (active instanceof HTMLTextAreaElement && el.contains(active)) return;
		draw(el, ctx, store, path);
	};
	const off = store.subscribe(render);
	if (path) void store.loadFile(path).then(render);
	else render();
	return () => {
		disposed = true;
		off();
		el.empty();
	};
}

function draw(el: HTMLElement, ctx: CommentPanelContext, store: CommentStore, path: string | null): void {
	el.empty();
	const head = el.createDiv({ cls: 'apex-editor-comments-head' });
	head.createDiv({ cls: 'apex-editor-comments-title', text: t('editor.comments.title') });
	if (!path) {
		el.createDiv({ cls: 'apex-editor-comments-empty', text: t('editor.comments.noFile') });
		return;
	}
	head.createDiv({ cls: 'apex-editor-comments-path', text: path });
	const threads = store.threadsFor(path);
	if (threads.length === 0) {
		el.createDiv({ cls: 'apex-editor-comments-empty', text: t('editor.comments.empty') });
		return;
	}
	const list = el.createDiv({ cls: 'apex-editor-comments-list' });
	for (const thread of threads) {
		renderCard(list, ctx, store, thread);
	}
}

function renderCard(parent: HTMLElement, ctx: CommentPanelContext, store: CommentStore, thread: CommentThread): HTMLElement {
	const card = parent.createDiv({
		cls: 'apex-editor-comment' + (store.focusedId === thread.id ? ' is-focused' : ''),
	});
	card.dataset['commentId'] = thread.id;
	const quote = card.createDiv({ cls: 'apex-editor-comment-quote', text: thread.target.quote.exact || '…' });
	quote.addEventListener('click', () => {
		void jumpToComment(ctx.app, thread);
	});
	if (thread.status === 'orphaned') {
		card.createDiv({ cls: 'apex-editor-comment-status', text: t('editor.comments.orphaned') });
	} else if (thread.status === 'resolved') {
		card.createDiv({ cls: 'apex-editor-comment-status', text: t('editor.comments.resolve') });
	}
	const messages = card.createDiv({ cls: 'apex-editor-comment-messages' });
	for (const message of thread.thread) {
		const row = messages.createDiv({ cls: 'apex-editor-comment-message' });
		row.createDiv({ cls: 'apex-editor-comment-text', text: message.text });
		row.createDiv({ cls: 'apex-editor-comment-time', text: message.ts.slice(0, 16).replace('T', ' ') });
	}
	const actions = card.createDiv({ cls: 'apex-editor-comment-actions' });
	if (thread.status === 'orphaned') {
		const reanchor = actions.createEl('button', { text: t('editor.comments.reanchor') });
		reanchor.addEventListener('click', () => {
			void reanchorFromSelection(ctx, store, thread);
		});
	} else if (thread.status === 'open') {
		const resolve = actions.createEl('button', { text: t('editor.comments.resolve') });
		resolve.addEventListener('click', () => {
			void store.resolve(thread.id);
		});
	} else {
		const reopen = actions.createEl('button', { text: t('editor.comments.reopen') });
		reopen.addEventListener('click', () => {
			void store.reopen(thread.id);
		});
	}
	const reply = actions.createEl('button', { text: t('editor.comments.reply') });
	reply.addEventListener('click', () => {
		void askText(ctx.app, t('editor.comments.reply'), t('editor.comments.placeholder')).then((text) => {
			if (text) void store.reply(thread.id, text);
		});
	});
	const remove = actions.createEl('button', { text: t('editor.comments.delete') });
	remove.addEventListener('click', () => {
		void store.remove(thread.id);
	});
	return card;
}

async function reanchorFromSelection(ctx: CommentPanelContext, store: CommentStore, thread: CommentThread): Promise<void> {
	const view = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view?.file || view.file.path !== thread.target.path) {
		await jumpToComment(ctx.app, thread);
		return;
	}
	const fromPos = view.editor.getCursor('from');
	const toPos = view.editor.getCursor('to');
	const from = view.editor.posToOffset(fromPos);
	const to = view.editor.posToOffset(toPos);
	const doc = view.editor.getValue();
	if (!selectionIsCommentable(doc, from, to)) return;
	await store.reanchor(thread.id, { quote: makeAnchor(doc, from, to), start: from, end: to });
}

export async function jumpToComment(app: App, thread: CommentThread): Promise<void> {
	const file = app.vault.getFileByPath(thread.target.path);
	if (!(file instanceof TFile)) return;
	const leaves = app.workspace.getLeavesOfType('markdown');
	let leaf = leaves.find((item) => item.view instanceof MarkdownView && item.view.file?.path === file.path);
	if (!leaf) leaf = app.workspace.getLeaf(false);
	if (leaf.view instanceof MarkdownView && leaf.view.getMode() === 'preview') {
		const state = leaf.getViewState();
		await leaf.setViewState({
			type: 'markdown',
			state: { ...(state.state ?? {}), mode: 'source', file: file.path },
			active: true,
		});
	} else if (!(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== file.path) {
		await leaf.openFile(file);
	} else {
		await app.workspace.revealLeaf(leaf);
	}
	const view = leaf.view;
	if (!(view instanceof MarkdownView)) return;
	const from = view.editor.offsetToPos(thread.target.start);
	const to = view.editor.offsetToPos(thread.target.end);
	view.editor.setSelection(from, to);
	view.editor.scrollIntoView({ from, to }, true);
	getCommentStore()?.focus(thread.id);
}
