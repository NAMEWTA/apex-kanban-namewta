import assert from 'node:assert/strict';
import test from 'node:test';

import { createSerialQueue } from './serial-queue.ts';

test('a serial queue starts the next task only after the previous one settles', async () => {
	const enqueue = createSerialQueue();
	const order: string[] = [];
	let releaseFirst: () => void = () => undefined;
	const firstGate = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});

	const first = enqueue(async () => {
		order.push('first-start');
		await firstGate;
		order.push('first-end');
		return 'one';
	});
	const second = enqueue(async () => {
		order.push('second-start');
		return 'two';
	});

	await Promise.resolve();
	assert.deepEqual(order, ['first-start']);
	releaseFirst();
	assert.deepEqual(await Promise.all([first, second]), ['one', 'two']);
	assert.deepEqual(order, ['first-start', 'first-end', 'second-start']);
});

test('a rejected task still lets the next task run', async () => {
	const enqueue = createSerialQueue();
	const first = enqueue(() => Promise.reject(new Error('boom')));
	const second = enqueue(async () => 'after');
	await assert.rejects(first, /boom/);
	assert.equal(await second, 'after');
});
