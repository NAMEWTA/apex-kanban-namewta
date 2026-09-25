import { Modal, type App } from 'obsidian';
import { t } from '../shared/i18n';

/** One intro after install. It does not mention a version and it has no code to scan. */
export class IntroModal extends Modal {
	constructor(
		app: App,
		private readonly onSeen: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: t('intro.title') });
		contentEl.createEl('p', { text: t('intro.body') });
		const button = contentEl.createEl('button', { text: t('intro.ok'), cls: 'mod-cta' });
		button.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.onSeen();
		this.contentEl.empty();
	}
}
