export {
	formatReference,
	stripUriSuffix,
	toAbsoluteReferencePath,
	type ReferenceCaret,
	type ReferenceSelection,
} from '../../shared/path-reference';
import { stripUriSuffix } from '../../shared/path-reference';

export function formatAbsoluteDropPaths(paths: string[]): string {
	const formatted = paths
		.map((path) => stripUriSuffix(path))
		.filter((path) => path.length > 0)
		.map(quotePathIfNeeded)
		.join(' ');
	return formatted ? `${formatted} ` : '';
}

export function nextUsageDelayMs(baseSec: number, consecutiveFailures: number): number {
	const base = Math.max(15, baseSec) * 1000;
	const failures = Math.max(0, Math.floor(consecutiveFailures));
	const factor = Math.min(8, 2 ** Math.min(failures, 3));
	return base * factor;
}

function quotePathIfNeeded(path: string): string {
	if (!/[\s"]/.test(path)) return path;
	return `"${path.replace(/"/g, '\\"')}"`;
}
