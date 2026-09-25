import { locateAnchor, makeAnchor } from './anchor';
import type { CommentFileDoc, CommentIndex, CommentMessage, CommentThread, NewCommentInput } from './model';

const ROOT = '.apex-editor/comments';
const INDEX_PATH = `${ROOT}/index.json`;
const FILES_DIR = `${ROOT}/files`;
const DEFAULT_DEBOUNCE_MS = 300;

export interface CommentFs {
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	remove(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
}

/** Minimal ChangeSet stand-in so the store does not import CodeMirror. */
export interface PosMapper {
	mapPos(pos: number, assoc?: number): number;
}

export interface CommentStoreOptions {
	debounceMs?: number;
}

function filePath(hash: string): string {
	return `${FILES_DIR}/${hash}.json`;
}

function nowIso(): string {
	return new Date().toISOString();
}

function nid(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function sha16(path: string): Promise<string> {
	const data = new TextEncoder().encode(path);
	const buf = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function emptyIndex(): CommentIndex {
	return { version: 1, files: {} };
}

function asRecord(raw: unknown): Record<string, unknown> | null {
	return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
}

function normalizeMessage(raw: unknown): CommentMessage | null {
	const rec = asRecord(raw);
	if (!rec) return null;
	if (typeof rec['id'] !== 'string' || typeof rec['text'] !== 'string' || typeof rec['ts'] !== 'string') return null;
	return { id: rec['id'], text: rec['text'], ts: rec['ts'] };
}

function normalizeThread(raw: unknown, path: string): CommentThread | null {
	const rec = asRecord(raw);
	if (!rec || typeof rec['id'] !== 'string') return null;
	const status = rec['status'];
	if (status !== 'open' && status !== 'resolved' && status !== 'orphaned') return null;
	const target = asRecord(rec['target']);
	const quote = target ? asRecord(target['quote']) : null;
	if (!target || !quote) return null;
	if (typeof quote['exact'] !== 'string' || typeof quote['prefix'] !== 'string' || typeof quote['suffix'] !== 'string') {
		return null;
	}
	if (typeof target['start'] !== 'number' || typeof target['end'] !== 'number') return null;
	const messages = Array.isArray(rec['thread'])
		? rec['thread'].map(normalizeMessage).filter((m): m is CommentMessage => m !== null)
		: [];
	return {
		id: rec['id'],
		status,
		target: {
			path: typeof target['path'] === 'string' ? target['path'] : path,
			quote: { exact: quote['exact'], prefix: quote['prefix'], suffix: quote['suffix'] },
			start: target['start'],
			end: target['end'],
		},
		thread: messages,
		createdAt: typeof rec['createdAt'] === 'string' ? rec['createdAt'] : nowIso(),
		updatedAt: typeof rec['updatedAt'] === 'string' ? rec['updatedAt'] : nowIso(),
	};
}

function normalizeFile(raw: unknown, path: string): CommentThread[] {
	const rec = asRecord(raw);
	if (!rec || !Array.isArray(rec['comments'])) return [];
	return rec['comments'].map((item) => normalizeThread(item, path)).filter((t): t is CommentThread => t !== null);
}

function normalizeIndex(raw: unknown): CommentIndex {
	const out = emptyIndex();
	const rec = asRecord(raw);
	const files = rec ? asRecord(rec['files']) : null;
	if (!files) return out;
	for (const [path, value] of Object.entries(files)) {
		const entry = asRecord(value);
		if (!entry || typeof entry['hash'] !== 'string') continue;
		out.files[path] = {
			hash: entry['hash'],
			open: typeof entry['open'] === 'number' ? entry['open'] : 0,
			total: typeof entry['total'] === 'number' ? entry['total'] : 0,
			updatedAt: typeof entry['updatedAt'] === 'string' ? entry['updatedAt'] : nowIso(),
		};
	}
	return out;
}

/**
 * Sidecar comment index under the vault `.apex-editor/` folder.
 * Mutations for one store are serialized. Disk writes are debounced.
 */
export class CommentStore {
	revision = 0;
	focusedId: string | null = null;

	private readonly debounceMs: number;
	private index: CommentIndex | null = null;
	private readonly cache = new Map<string, CommentThread[]>();
	/** Paths whose quotes have been checked against the current document. */
	private readonly reconciled = new Set<string>();
	private readonly dirty = new Set<string>();
	private indexDirty = false;
	private timer: number | null = null;
	private flushing = false;
	private chain: Promise<void> = Promise.resolve();
	private readonly listeners = new Set<() => void>();

	constructor(
		private readonly fs: CommentFs,
		opts?: CommentStoreOptions,
	) {
		this.debounceMs = opts?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	}

	subscribe(cb: () => void): () => void {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
		};
	}

	/** Force open editors and the side panel to redraw (settings toggles). */
	notify(): void {
		this.emit();
	}

	focus(id: string | null): void {
		this.focusedId = id;
		this.emit();
	}

	threadsFor(path: string): readonly CommentThread[] {
		return this.cache.get(path) ?? [];
	}

	/** True after this path has been read (including an empty sidecar). */
	isLoaded(path: string): boolean {
		return this.cache.has(path);
	}

	loadFile(path: string): Promise<CommentThread[]> {
		return this.enqueue(async () => {
			const threads = await this.readThreads(path);
			return threads.map((thread) => structuredClone(thread));
		});
	}

	add(path: string, input: NewCommentInput): Promise<CommentThread> {
		return this.enqueue(async () => {
			const threads = await this.readThreads(path);
			const now = nowIso();
			const thread: CommentThread = {
				id: nid('c'),
				status: 'open',
				target: {
					path,
					quote: input.quote,
					start: input.start,
					end: input.end,
				},
				thread: [{ id: nid('m'), ts: now, text: input.text }],
				createdAt: now,
				updatedAt: now,
			};
			threads.push(thread);
			this.reconciled.add(path);
			this.markDirty(path);
			this.emit();
			return thread;
		});
	}

	reply(id: string, text: string): Promise<CommentThread> {
		return this.enqueue(async () => {
			const found = await this.locate(id);
			if (!found) throw new Error(`Comment not found: ${id}`);
			const now = nowIso();
			found.thread.thread.push({ id: nid('m'), ts: now, text });
			found.thread.updatedAt = now;
			this.markDirty(found.path);
			this.emit();
			return found.thread;
		});
	}

	resolve(id: string): Promise<void> {
		return this.setStatus(id, 'resolved');
	}

	reopen(id: string): Promise<void> {
		return this.setStatus(id, 'open');
	}

	remove(id: string): Promise<void> {
		return this.enqueue(async () => {
			const found = await this.locate(id);
			if (!found) return;
			const idx = found.threads.findIndex((thread) => thread.id === id);
			if (idx >= 0) found.threads.splice(idx, 1);
			if (this.focusedId === id) this.focusedId = null;
			this.markDirty(found.path);
			this.emit();
		});
	}

	reanchor(id: string, next: { quote: NewCommentInput['quote']; start: number; end: number }): Promise<void> {
		return this.enqueue(async () => {
			const found = await this.locate(id);
			if (!found) return;
			found.thread.target = {
				path: found.thread.target.path,
				quote: next.quote,
				start: next.start,
				end: next.end,
			};
			found.thread.status = 'open';
			found.thread.updatedAt = nowIso();
			this.markDirty(found.path);
			this.emit();
		});
	}

	/**
	 * Follow an edit with ChangeSet.mapPos. Quote text is refreshed from the
	 * new document. Nothing is written until the debounce fires.
	 * No-ops until {@link reconcile} has run for this path, so a keystroke
	 * during the initial load cannot drag a stale offset.
	 */
	applyChanges(path: string | null, mapper: PosMapper, doc: string): void {
		if (!path || !this.reconciled.has(path)) return;
		const threads = this.cache.get(path);
		if (!threads || threads.length === 0) return;
		let changed = false;
		for (const thread of threads) {
			if (thread.status === 'orphaned') continue;
			const start = mapper.mapPos(thread.target.start, 1);
			const end = mapper.mapPos(thread.target.end, -1);
			if (end <= start) {
				thread.status = 'orphaned';
				thread.updatedAt = nowIso();
				changed = true;
				continue;
			}
			const exact = doc.slice(start, end);
			if (!exact) {
				thread.status = 'orphaned';
				thread.updatedAt = nowIso();
				changed = true;
				continue;
			}
			if (start === thread.target.start && end === thread.target.end && exact === thread.target.quote.exact) {
				continue;
			}
			thread.target.start = start;
			thread.target.end = end;
			thread.target.quote = makeAnchor(doc, start, end);
			thread.updatedAt = nowIso();
			changed = true;
		}
		if (!changed) return;
		this.markDirty(path);
		this.emit();
	}

	/** Relocate open threads against `doc`. Failures become `orphaned` and are not guessed. */
	reconcile(path: string, doc: string): void {
		void this.enqueue(async () => {
			const threads = await this.readThreads(path);
			let changed = false;
			for (const thread of threads) {
				if (thread.status === 'orphaned') continue;
				const located = locateAnchor(doc, thread.target.quote, thread.target.start, thread.target.end);
				if (!located) {
					thread.status = 'orphaned';
					thread.updatedAt = nowIso();
					changed = true;
					continue;
				}
				if (thread.target.start !== located.start || thread.target.end !== located.end) {
					thread.target.start = located.start;
					thread.target.end = located.end;
					changed = true;
				}
			}
			this.reconciled.add(path);
			if (changed) {
				this.markDirty(path);
				this.emit();
			}
		});
	}

	renamePath(oldPath: string, newPath: string): Promise<void> {
		return this.enqueue(async () => {
			if (oldPath === newPath) return;
			const threads = await this.readThreads(oldPath);
			for (const thread of threads) thread.target.path = newPath;
			this.cache.delete(oldPath);
			this.cache.set(newPath, threads);
			if (this.reconciled.delete(oldPath)) this.reconciled.add(newPath);
			const index = await this.readIndex();
			const prev = index.files[oldPath];
			delete index.files[oldPath];
			if (prev) {
				const nextHash = await sha16(newPath);
				if (prev.hash !== nextHash) {
					await this.fs.remove(filePath(prev.hash)).catch(() => undefined);
				}
			}
			this.dirty.delete(oldPath);
			this.markDirty(newPath);
			await this.writeDirty();
		});
	}

	deletePath(path: string): Promise<void> {
		return this.enqueue(async () => {
			const index = await this.readIndex();
			const prev = index.files[path];
			delete index.files[path];
			this.cache.delete(path);
			this.reconciled.delete(path);
			this.dirty.delete(path);
			if (prev) await this.fs.remove(filePath(prev.hash)).catch(() => undefined);
			this.indexDirty = true;
			await this.writeDirty();
			this.emit();
		});
	}

	flush(): Promise<void> {
		if (this.timer != null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		return this.enqueue(() => this.writeDirty());
	}

	dispose(): void {
		if (this.timer != null) window.clearTimeout(this.timer);
		this.timer = null;
		this.listeners.clear();
	}

	private setStatus(id: string, status: 'open' | 'resolved'): Promise<void> {
		return this.enqueue(async () => {
			const found = await this.locate(id);
			if (!found || found.thread.status === 'orphaned') return;
			found.thread.status = status;
			found.thread.updatedAt = nowIso();
			this.markDirty(found.path);
			this.emit();
		});
	}

	private async locate(
		id: string,
	): Promise<{ path: string; thread: CommentThread; threads: CommentThread[] } | null> {
		for (const [path, threads] of this.cache) {
			const thread = threads.find((item) => item.id === id);
			if (thread) return { path, thread, threads };
		}
		const index = await this.readIndex();
		for (const path of Object.keys(index.files)) {
			if (this.cache.has(path)) continue;
			const threads = await this.readThreads(path);
			const thread = threads.find((item) => item.id === id);
			if (thread) return { path, thread, threads };
		}
		return null;
	}

	private async readThreads(path: string): Promise<CommentThread[]> {
		const cached = this.cache.get(path);
		if (cached) return cached;
		const index = await this.readIndex();
		const meta = index.files[path];
		let threads: CommentThread[] = [];
		if (meta) {
			try {
				const raw = await this.fs.read(filePath(meta.hash));
				threads = normalizeFile(JSON.parse(raw) as unknown, path);
			} catch {
				threads = [];
			}
		}
		this.cache.set(path, threads);
		return threads;
	}

	private async readIndex(): Promise<CommentIndex> {
		if (this.index) return this.index;
		try {
			const raw = await this.fs.read(INDEX_PATH);
			this.index = normalizeIndex(JSON.parse(raw) as unknown);
		} catch {
			this.index = emptyIndex();
		}
		return this.index;
	}

	private markDirty(path: string): void {
		this.dirty.add(path);
		this.indexDirty = true;
		if (this.flushing || this.timer != null) return;
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.enqueue(() => this.writeDirty());
		}, this.debounceMs);
	}

	private async recount(path: string, threads: CommentThread[]): Promise<void> {
		const index = await this.readIndex();
		if (threads.length === 0) {
			const prev = index.files[path];
			delete index.files[path];
			if (prev) await this.fs.remove(filePath(prev.hash)).catch(() => undefined);
			this.indexDirty = true;
			return;
		}
		const open = threads.filter((thread) => thread.status === 'open').length;
		index.files[path] = {
			hash: await sha16(path),
			open,
			total: threads.length,
			updatedAt: nowIso(),
		};
		this.indexDirty = true;
	}

	private async writeDirty(): Promise<void> {
		this.flushing = true;
		try {
			while (this.dirty.size > 0 || this.indexDirty) {
				const paths = [...this.dirty];
				this.dirty.clear();
				for (const path of paths) {
					const threads = this.cache.get(path) ?? [];
					await this.recount(path, threads);
					if (threads.length === 0) continue;
					const hash = (await this.readIndex()).files[path]?.hash;
					if (!hash) continue;
					const body: CommentFileDoc = { version: 1, path, comments: threads };
					await this.fs.write(filePath(hash), JSON.stringify(body, null, 2));
				}
				if (this.indexDirty && this.index) {
					const snapshot = this.index;
					this.indexDirty = false;
					await this.fs.write(INDEX_PATH, JSON.stringify(snapshot, null, 2));
				}
			}
		} finally {
			this.flushing = false;
		}
	}

	private emit(): void {
		this.revision += 1;
		for (const cb of this.listeners) cb();
	}

	private enqueue<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.chain.then(fn, fn);
		this.chain = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}
}

let activeStore: CommentStore | null = null;

export function registerCommentStore(store: CommentStore | null): void {
	activeStore = store;
}

export function getCommentStore(): CommentStore | null {
	return activeStore;
}
