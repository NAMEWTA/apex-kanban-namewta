import assert from 'node:assert/strict';
import test from 'node:test';

import { mountNandStatusBarEntry, type StatusBarEntryDocument, type StatusBarEntryHost } from './status-bar-entry.ts';

class FakeElement {
	children: FakeElement[] = [];
	textContent = '';
	classes = new Set<string>();
	classList: { add: (name: string) => void };

	constructor(cls = '') {
		if (cls) this.classes.add(cls);
		this.classList = {
			add: (name: string) => {
				this.classes.add(name);
			},
		};
	}

	createSpan(info: { cls: string }): FakeElement {
		const child = new FakeElement(info.cls);
		this.children.push(child);
		return child;
	}

	append(...nodes: FakeElement[]): void {
		this.children.push(...nodes);
	}
}

function hierarchyError(): Error {
	const error = new Error("Failed to execute 'appendChild' on 'Node': Only one element on document allowed.");
	error.name = 'HierarchyRequestError';
	return error;
}

function documentStub(): StatusBarEntryDocument & { rootCount: number } {
	const doc = {
		rootCount: 1,
		createElement(tag: 'span'): FakeElement {
			assert.equal(tag, 'span');
			return new FakeElement();
		},
		createSpan(): FakeElement {
			doc.rootCount += 1;
			throw hierarchyError();
		},
	};
	return doc as StatusBarEntryDocument & { rootCount: number };
}

function refusingItem(): StatusBarEntryHost {
	const refusal = new Error('status bar item refused a child');
	return {
		createSpan(): HTMLElement {
			throw refusal;
		},
		append(): void {
			throw refusal;
		},
	};
}

test('status bar entry mounts the icon and NAND on the item without a second document element', () => {
	const item = new FakeElement();
	const hostDocument = documentStub();
	const mounted = mountNandStatusBarEntry(item as unknown as StatusBarEntryHost, hostDocument);
	assert.equal(hostDocument.rootCount, 1);
	assert.equal(item.children.length, 2);
	assert.equal(item.children[0], mounted.iconEl);
	assert.equal((mounted.iconEl as unknown as FakeElement).classes.has('terminal-status-bar-icon'), true);
	assert.equal(mounted.labelEl.textContent, 'NAND');
	assert.equal(item.children[1], mounted.labelEl);
});

test('status bar entry lets a refused child propagate', () => {
	const hostDocument = documentStub();
	assert.throws(
		() => mountNandStatusBarEntry(refusingItem(), hostDocument),
		(error: unknown) => error instanceof Error && error.message === 'status bar item refused a child',
	);
	assert.equal(hostDocument.rootCount, 1);
});
