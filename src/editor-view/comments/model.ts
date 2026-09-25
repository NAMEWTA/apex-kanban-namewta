export type CommentStatus = 'open' | 'resolved' | 'orphaned';

/** Quote is the source of truth. Offsets are a cache and are relocated on load. */
export interface TextQuoteAnchor {
	exact: string;
	/** About 24 characters before the selection. */
	prefix: string;
	/** About 24 characters after the selection. */
	suffix: string;
}

export interface CommentMessage {
	id: string;
	/** ISO 8601 */
	ts: string;
	text: string;
}

export interface CommentThread {
	/** `c-…` */
	id: string;
	status: CommentStatus;
	target: {
		path: string;
		quote: TextQuoteAnchor;
		/** CodeMirror document offset. */
		start: number;
		end: number;
	};
	thread: CommentMessage[];
	createdAt: string;
	updatedAt: string;
}

export interface CommentFileDoc {
	version: 1;
	path: string;
	comments: CommentThread[];
}

export interface CommentIndexEntry {
	hash: string;
	open: number;
	total: number;
	updatedAt: string;
}

export interface CommentIndex {
	version: 1;
	files: Record<string, CommentIndexEntry>;
}

export interface NewCommentInput {
	quote: TextQuoteAnchor;
	start: number;
	end: number;
	text: string;
}
