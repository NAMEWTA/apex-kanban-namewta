/** DOM surface used to mount the NAND status-bar entry. */
export interface StatusBarEntryHost {
	createSpan(info: { cls: string }): HTMLElement;
	append(...nodes: Node[]): void;
}

/** Document surface. createElement does not insert. createSpan inserts into this document. */
export interface StatusBarEntryDocument {
	createElement(tag: 'span'): HTMLElement;
	createSpan?(info: { cls: string }): HTMLElement;
}

/**
 * Put the status-bar icon and the NAND label on the status-bar item.
 * The icon is created on the item. The label is created detached, then appended to the item.
 * A refusal from the item propagates. This function does not catch it.
 */
export function mountNandStatusBarEntry(
	statusBarItem: StatusBarEntryHost,
	hostDocument: StatusBarEntryDocument,
): { iconEl: HTMLElement; labelEl: HTMLElement } {
	const iconEl = statusBarItem.createSpan({ cls: 'terminal-status-bar-icon' });
	const labelEl = hostDocument.createElement('span');
	labelEl.classList.add('terminal-status-bar-label');
	labelEl.textContent = 'NAND';
	statusBarItem.append(labelEl);
	return { iconEl, labelEl };
}
