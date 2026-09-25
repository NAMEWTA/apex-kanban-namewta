import { MarkdownView, type MarkdownPostProcessor } from 'obsidian';
import { locateAnchor } from './anchor';
import type { TextQuoteAnchor } from './model';
import { getCommentStore } from './store';
import type DashboardPlugin from '../../plugin/main';

/** Reading-mode highlights. Missing quotes are skipped; the note source is never edited. */
export function commentsReadingProcessor(plugin: DashboardPlugin): MarkdownPostProcessor {
	return (el, ctx) => {
		const workbench = plugin.settings.editorWorkbench;
		if (!workbench.highlightEnabled) return;
		if (!ctx.sourcePath.endsWith('.md')) return;
		const store = getCommentStore();
		if (!store) return;
		const path = ctx.sourcePath;
		if (!store.isLoaded(path)) {
			void store.loadFile(path).then(() => {
				refreshReadingViews(plugin, path);
			});
			return;
		}
		const threads = store.threadsFor(path).filter((thread) => thread.status !== 'orphaned');
		if (threads.length === 0) return;
		highlightQuotes(
			el,
			threads.map((thread) => ({ id: thread.id, quote: thread.target.quote })),
		);
	};
}

/** Re-run reading mode so highlights appear after the sidecar loads or a setting flips. */
export function refreshReadingViews(plugin: DashboardPlugin, path?: string): void {
	const leaves = plugin.app.workspace.getLeavesOfType('markdown');
	for (const leaf of leaves) {
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) continue;
		if (path && view.file?.path !== path) continue;
		if (view.getMode() !== 'preview') continue;
		view.previewMode.rerender(true);
	}
}

export function highlightQuotes(
	root: HTMLElement,
	threads: { id: string; quote: TextQuoteAnchor }[],
): void {
	const pending = threads.filter((thread) => thread.quote.exact.length > 0);
	if (pending.length === 0) return;
	const nodes = collectText(root);
	if (nodes.length === 0) return;
	let full = '';
	const index: { node: Text; start: number }[] = [];
	for (const node of nodes) {
		index.push({ node, start: full.length });
		full += node.data;
	}
	const hits: { start: number; end: number; id: string }[] = [];
	for (const thread of pending) {
		const located = locateAnchor(full, thread.quote, 0, 0);
		if (!located) continue;
		hits.push({ start: located.start, end: located.end, id: thread.id });
	}
	hits.sort((a, b) => b.start - a.start);
	const used: { start: number; end: number }[] = [];
	for (const hit of hits) {
		if (used.some((range) => hit.start < range.end && hit.end > range.start)) continue;
		if (wrap(root.ownerDocument, index, hit.start, hit.end, hit.id)) used.push(hit);
	}
}

function collectText(root: HTMLElement): Text[] {
	const out: Text[] = [];
	const doc = root.ownerDocument;
	const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let current = walker.nextNode();
	while (current) {
		if (current.instanceOf(Text) && current.data.length > 0 && !skipText(current)) out.push(current);
		current = walker.nextNode();
	}
	return out;
}

function skipText(node: Text): boolean {
	let el: HTMLElement | null = node.parentElement;
	while (el) {
		const tag = el.tagName;
		if (tag === 'CODE' || tag === 'PRE' || tag === 'SCRIPT' || tag === 'STYLE') return true;
		if (el.classList.contains('apex-comment-hl')) return true;
		el = el.parentElement;
	}
	return false;
}

function nodeAt(
	index: { node: Text; start: number }[],
	pos: number,
): { node: Text; start: number; local: number } | null {
	for (let i = index.length - 1; i >= 0; i--) {
		const entry = index[i];
		if (!entry) continue;
		const len = entry.node.data.length;
		if (pos >= entry.start && pos <= entry.start + len) {
			return { node: entry.node, start: entry.start, local: pos - entry.start };
		}
	}
	return null;
}

function wrap(
	doc: Document,
	index: { node: Text; start: number }[],
	from: number,
	to: number,
	id: string,
): boolean {
	if (to <= from) return false;
	const start = nodeAt(index, from);
	const end = nodeAt(index, to);
	if (!start || !end) return false;
	const span = doc.createElement('span');
	span.className = 'apex-comment-hl';
	span.dataset['commentId'] = id;
	if (start.node === end.node) {
		let target = start.node;
		if (end.local < target.data.length) target.splitText(end.local);
		if (start.local > 0) target = target.splitText(start.local);
		target.before(span);
		span.appendChild(target);
		return true;
	}
	if (end.local < end.node.data.length) end.node.splitText(end.local);
	let first = start.node;
	if (start.local > 0) first = start.node.splitText(start.local);
	first.before(span);
	let cur: Node | null = first;
	const stop = end.node;
	while (cur) {
		const next: ChildNode | null = cur.nextSibling;
		span.appendChild(cur);
		if (cur === stop) break;
		cur = next;
	}
	return true;
}
