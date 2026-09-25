/**
 * Editor comment anchors, sidecar store, and product-boundary checks.
 * Run: pnpm run test:editor-comments
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { locateAnchor, makeAnchor, selectionIsCommentable } from '../src/editor-view/comments/anchor';
import { CommentStore, type CommentFs } from '../src/editor-view/comments/store';

const doc = '---\ntitle: x\n---\n\nHello prefix TARGET suffix tail.\n\n```\ncode TARGET\n```\n\nAfter.';

const targetAt = doc.indexOf('TARGET');
assert.ok(targetAt > 0, 'fixture contains TARGET');
const anchor = makeAnchor(doc, targetAt, targetAt + 'TARGET'.length);
assert.equal(anchor.exact, 'TARGET');
assert.ok(anchor.prefix.endsWith('prefix '), 'prefix keeps the nearby context');
assert.ok(anchor.suffix.startsWith(' suffix'), 'suffix keeps the nearby context');

assert.deepEqual(locateAnchor(doc, anchor, targetAt, targetAt + 6), { start: targetAt, end: targetAt + 6 });

const shifted = doc.replace('Hello', 'Hello!!');
const shiftedAt = shifted.indexOf('TARGET');
const located = locateAnchor(shifted, anchor, targetAt, targetAt + 6);
assert.deepEqual(located, { start: shiftedAt, end: shiftedAt + 6 }, 'prefix+exact+suffix wins over a stale offset');

const ambiguous = 'TARGET and later TARGET';
const second = ambiguous.lastIndexOf('TARGET');
const nearest = locateAnchor(ambiguous, { exact: 'TARGET', prefix: '', suffix: '' }, second, second + 6);
assert.equal(nearest?.start, second, 'bare exact picks the hit nearest the old offset');
assert.equal(locateAnchor('nothing', anchor, 0, 6), null);

const fmEnd = doc.indexOf('Hello');
assert.equal(selectionIsCommentable(doc, 4, 8), false, 'frontmatter is not commentable');
assert.equal(selectionIsCommentable(doc, fmEnd, fmEnd + 5), true);
const codeAt = doc.indexOf('code TARGET');
assert.equal(selectionIsCommentable(doc, codeAt, codeAt + 4), false, 'code fence is not commentable');

function memoryFs(): CommentFs & { files: Map<string, string> } {
	const files = new Map<string, string>();
	return {
		files,
		async read(p) {
			const value = files.get(p);
			if (value === undefined) throw new Error(`missing ${p}`);
			return value;
		},
		async write(p, data) {
			files.set(p, data);
		},
		async remove(p) {
			files.delete(p);
		},
		async exists(p) {
			return files.has(p);
		},
	};
}

const note = 'Please keep this note byte-for-byte.';

async function main(): Promise<void> {
	if (typeof window === 'undefined') {
		Object.assign(globalThis, { window: globalThis });
	}
	const fsMem = memoryFs();
const store = new CommentStore(fsMem, { debounceMs: 1000 });
const added = await store.add('notes/demo.md', {
	quote: makeAnchor(note, 7, 11),
	start: 7,
	end: 11,
	text: 'first',
});
assert.equal(note, 'Please keep this note byte-for-byte.', 'adding a comment does not touch the note');
assert.ok(added.id.startsWith('c-'));
await store.flush();
for (const key of fsMem.files.keys()) {
	assert.ok(key.startsWith('.apex-editor/comments/'), `sidecar path ${key}`);
}
const index = JSON.parse(fsMem.files.get('.apex-editor/comments/index.json') ?? '{}') as {
	files: Record<string, { hash: string; open: number; total: number }>;
};
const meta = index.files['notes/demo.md'];
assert.ok(meta, 'index records the note');
assert.equal(meta.hash.length, 16);
assert.equal(meta.open, 1);
assert.equal(meta.total, 1);
const fileBody = JSON.parse(fsMem.files.get(`.apex-editor/comments/files/${meta.hash}.json`) ?? '{}') as {
	path: string;
	comments: { target: { quote: { exact: string } } }[];
};
assert.equal(fileBody.path, 'notes/demo.md');
assert.equal(fileBody.comments[0]?.target.quote.exact, 'keep');

store.applyChanges('notes/demo.md', { mapPos: (pos) => pos + 1 }, ` ${note}`);
await store.flush();
const followed = store.threadsFor('notes/demo.md')[0];
assert.equal(followed?.target.start, 8);
assert.equal(followed?.target.quote.exact, 'keep');

await store.reply(added.id, 'second');
await store.resolve(added.id);
await store.flush();
const resolvedIndex = JSON.parse(fsMem.files.get('.apex-editor/comments/index.json') ?? '{}') as {
	files: Record<string, { open: number; total: number }>;
};
assert.equal(resolvedIndex.files['notes/demo.md']?.open, 0);
assert.equal(resolvedIndex.files['notes/demo.md']?.total, 1);

await store.renamePath('notes/demo.md', 'notes/renamed.md');
assert.equal(store.threadsFor('notes/renamed.md')[0]?.target.path, 'notes/renamed.md');
assert.equal(store.threadsFor('notes/demo.md').length, 0);
const renamedIndex = JSON.parse(fsMem.files.get('.apex-editor/comments/index.json') ?? '{}') as {
	files: Record<string, { hash: string }>;
};
assert.ok(renamedIndex.files['notes/renamed.md']);
assert.equal(renamedIndex.files['notes/demo.md'], undefined);

await store.deletePath('notes/renamed.md');
const afterDelete = JSON.parse(fsMem.files.get('.apex-editor/comments/index.json') ?? '{}') as {
	files: Record<string, unknown>;
};
assert.equal(afterDelete.files['notes/renamed.md'], undefined);
assert.equal([...fsMem.files.keys()].some((key) => key.includes('/files/')), false, 'file sidecar removed');

const orphanStore = new CommentStore(memoryFs(), { debounceMs: 1000 });
await orphanStore.add('a.md', { quote: makeAnchor('alpha', 0, 5), start: 0, end: 5, text: 'gone' });
orphanStore.reconcile('a.md', 'zzzz');
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(orphanStore.threadsFor('a.md')[0]?.status, 'orphaned');

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.name.endsWith('.ts')) out.push(full);
	}
	return out;
}

const root = process.cwd();
const importFrom = (file: string, spec: string) =>
	new RegExp(`from\\s+['\"][^'\"]*${spec}[^'\"]*['\"]`).test(fs.readFileSync(file, 'utf8'));
for (const file of walk(path.join(root, 'src/editor-view'))) {
	assert.equal(importFrom(file, 'dashboard-view'), false, `${file} must not import dashboard-view`);
	assert.equal(importFrom(file, 'terminal-agent'), false, `${file} must not import terminal-agent`);
}
for (const file of walk(path.join(root, 'src/dashboard-view'))) {
	assert.equal(importFrom(file, 'editor-view'), false, `${file} must not import editor-view`);
	assert.equal(importFrom(file, 'terminal-agent'), false, `${file} must not import terminal-agent`);
}
for (const file of walk(path.join(root, 'src/terminal-agent'))) {
	assert.equal(importFrom(file, 'editor-view'), false, `${file} must not import editor-view`);
	assert.equal(importFrom(file, 'dashboard-view'), false, `${file} must not import dashboard-view`);
}
const viewSource = fs.readFileSync(path.join(root, 'src/dashboard-view/view/dashboard-view.ts'), 'utf8');
assert.match(viewSource, /DASHBOARD_VIEW_TYPE = 'apex-dashboard-view'/);
const editorSource = fs.readFileSync(path.join(root, 'src/editor-view/view/editor-view.ts'), 'utf8');
assert.match(editorSource, /EDITOR_VIEW_TYPE = 'apex-editor-view'/);
const terminalSource = fs.readFileSync(path.join(root, 'src/terminal-agent/view/terminal-view.ts'), 'utf8');
assert.match(terminalSource, /TERMINAL_VIEW_TYPE = 'terminal-view'/);

console.log('verify-editor-comments: ok');
}

void main();
