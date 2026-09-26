/** Run async tasks one at a time. A rejection does not block the next task. */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
	let chain: Promise<void> = Promise.resolve();
	return <T>(task: () => Promise<T>): Promise<T> => {
		const run = chain.then(task, task);
		chain = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};
}
