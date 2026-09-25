/** Cross-product event names. Payload types live next to the event, not in either product. */
export const APEX_EVENTS = {
	COMMENT_TO_TASK: 'apex:comment-to-task',
	ACTIVE_FILE_COMMENTS_CHANGED: 'apex:comments-changed',
} as const;

/** Reserved for a later "turn this comment into a task" action. P0 does not emit it. */
export interface CommentToTaskPayload {
	sourcePath: string;
	commentId: string;
	/** Defaults to the first sentence of the comment. */
	title: string;
	quote: string;
}
