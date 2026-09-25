import { Notice } from 'obsidian';
import { makeAnchor, selectionIsCommentable } from './anchor';
import { askText } from './prompt';
import { getCommentStore } from './store';
import type DashboardPlugin from '../../plugin/main';
import { APEX_COMMANDS } from '../../shared/commands';
import { APEX_EVENTS, type CommentToTaskPayload } from '../../shared/events';
import { t } from '../../shared/i18n';

export function registerCommentCommands(plugin: DashboardPlugin): void {
	plugin.addCommand({
		id: APEX_COMMANDS.ADD_COMMENT,
		name: t('editor.comments.add'),
		editorCallback: (editor, ctx) => {
			const file = ctx.file;
			if (!file || file.extension !== 'md') {
				new Notice(t('editor.comments.needSelection'));
				return;
			}
			const selected = editor.getSelection();
			if (!selected) {
				new Notice(t('editor.comments.needSelection'));
				return;
			}
			const from = editor.posToOffset(editor.getCursor('from'));
			const to = editor.posToOffset(editor.getCursor('to'));
			const doc = editor.getValue();
			if (!selectionIsCommentable(doc, from, to)) {
				new Notice(t('editor.comments.blocked'));
				return;
			}
			const store = getCommentStore();
			if (!store) return;
			void askText(plugin.app, t('editor.comments.add'), t('editor.comments.placeholder')).then((text) => {
				if (!text) return;
				void store.add(file.path, { quote: makeAnchor(doc, from, to), start: from, end: to, text });
			});
		},
	});
}

/**
 * Payload builder for a later "make this a task" button.
 * The editor product only shapes the event; it does not import the dashboard.
 */
export function commentToTaskPayload(sourcePath: string, commentId: string, text: string, quote: string): {
	name: typeof APEX_EVENTS.COMMENT_TO_TASK;
	payload: CommentToTaskPayload;
} {
	const title = text.split(/[\n。！？.!?]/)[0]?.trim() || text.trim();
	return {
		name: APEX_EVENTS.COMMENT_TO_TASK,
		payload: { sourcePath, commentId, title, quote },
	};
}
