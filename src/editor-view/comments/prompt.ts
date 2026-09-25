import { App, Modal } from 'obsidian';
import { t } from '../../shared/i18n';

/** Small text prompt. Resolves null when cancelled. Does not touch the note. */
export function askText(app: App, title: string, placeholder: string): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new TextPromptModal(app, title, placeholder, resolve);
		modal.open();
	});
}

class TextPromptModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly titleText: string,
		private readonly placeholder: string,
		private readonly done: (value: string | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: this.titleText, cls: 'apex-comment-prompt-title' });
		const input = contentEl.createEl('textarea', { cls: 'apex-comment-prompt' });
		input.placeholder = this.placeholder;
		input.rows = 4;
		const row = contentEl.createDiv({ cls: 'apex-comment-prompt-row' });
		const cancel = row.createEl('button', { text: t('editor.comments.cancel') });
		const ok = row.createEl('button', { text: t('editor.comments.save'), cls: 'mod-cta' });
		cancel.addEventListener('click', () => this.finish(null));
		ok.addEventListener('click', () => this.finish(input.value.trim() || null));
		input.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
				ev.preventDefault();
				this.finish(input.value.trim() || null);
			} else if (ev.key === 'Escape') {
				ev.preventDefault();
				this.finish(null);
			}
		});
		input.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) {
			this.settled = true;
			this.done(null);
		}
	}

	private finish(value: string | null): void {
		if (this.settled) return;
		this.settled = true;
		this.done(value);
		this.close();
	}
}
