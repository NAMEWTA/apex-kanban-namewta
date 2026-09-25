import type { TextQuoteAnchor } from './model';

const QUOTE_CONTEXT = 24;

export function makeAnchor(doc: string, from: number, to: number): TextQuoteAnchor {
	const start = clamp(from, 0, doc.length);
	const end = clamp(to, start, doc.length);
	return {
		exact: doc.slice(start, end),
		prefix: doc.slice(Math.max(0, start - QUOTE_CONTEXT), start),
		suffix: doc.slice(end, Math.min(doc.length, end + QUOTE_CONTEXT)),
	};
}

/**
 * 1. Trust the stored offsets when they still slice out `exact`.
 * 2. Otherwise search `prefix + exact + suffix`.
 * 3. Otherwise search `exact` and pick the hit nearest the old start.
 * 4. Otherwise the caller marks the thread orphaned.
 */
export function locateAnchor(
	doc: string,
	quote: TextQuoteAnchor,
	start: number,
	end: number,
): { start: number; end: number } | null {
	if (!quote.exact) return null;
	if (start >= 0 && end >= start && end <= doc.length && doc.slice(start, end) === quote.exact) {
		return { start, end };
	}
	if (quote.prefix.length > 0 || quote.suffix.length > 0) {
		const windowed = `${quote.prefix}${quote.exact}${quote.suffix}`;
		const idx = doc.indexOf(windowed);
		if (idx >= 0) {
			const at = idx + quote.prefix.length;
			return { start: at, end: at + quote.exact.length };
		}
	}
	const hits: number[] = [];
	let from = 0;
	while (from < doc.length) {
		const found = doc.indexOf(quote.exact, from);
		if (found < 0) break;
		hits.push(found);
		from = found + Math.max(1, quote.exact.length);
	}
	const first = hits[0];
	if (first === undefined) return null;
	const hint = start >= 0 ? start : 0;
	let best = first;
	let bestDist = Math.abs(best - hint);
	for (const hit of hits) {
		const dist = Math.abs(hit - hint);
		if (dist < bestDist) {
			best = hit;
			bestDist = dist;
		}
	}
	return { start: best, end: best + quote.exact.length };
}

/** P1: refuse frontmatter and fenced code. A selection that only touches prose is allowed. */
export function selectionIsCommentable(doc: string, from: number, to: number): boolean {
	if (to <= from) return false;
	const fmEnd = frontmatterEnd(doc);
	if (fmEnd > 0 && from < fmEnd) return false;
	if (insideFence(doc, from) || insideFence(doc, to - 1)) return false;
	return true;
}

function frontmatterEnd(doc: string): number {
	if (!doc.startsWith('---')) return 0;
	const firstNl = doc.indexOf('\n');
	if (firstNl < 0) return 0;
	const close = doc.indexOf('\n---', firstNl);
	if (close < 0) return 0;
	const lineEnd = doc.indexOf('\n', close + 1);
	const line = doc.slice(close + 1, lineEnd < 0 ? doc.length : lineEnd);
	if (line.trim() !== '---') return 0;
	return lineEnd < 0 ? doc.length : lineEnd + 1;
}

function insideFence(doc: string, pos: number): boolean {
	const upto = doc.slice(0, Math.max(0, pos));
	const fences = upto.match(/^```/gm);
	return (fences?.length ?? 0) % 2 === 1;
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}
