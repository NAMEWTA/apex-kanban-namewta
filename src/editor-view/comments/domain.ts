import type { Extension } from '@codemirror/state';
import type { MarkdownPostProcessor } from 'obsidian';
import { commentsCmExtension } from './cm-extension';
import { registerCommentCommands } from './commands';
import { mountCommentsPanel } from './panel';
import { commentsReadingProcessor, refreshReadingViews } from './reading';
import type { EditorDomain } from '../host/registry';
import type DashboardPlugin from '../../plugin/main';

export function createCommentsDomain(plugin: DashboardPlugin): EditorDomain {
	const extension = commentsCmExtension(plugin);
	const processor = commentsReadingProcessor(plugin);
	return {
		id: 'comments',
		titleKey: 'editor.comments.title',
		icon: 'message-square',
		mountPanel(el, ctx) {
			return mountCommentsPanel(el, ctx);
		},
		getEditorExtensions(): Extension[] {
			return [extension];
		},
		getReadingPostProcessor(): MarkdownPostProcessor {
			return processor;
		},
		onSettingsChanged() {
			refreshReadingViews(plugin);
		},
		registerCommands() {
			registerCommentCommands(plugin);
		},
	};
}
