import {describe, expect, it} from 'vitest'

import type {TaskResponse} from '@/client/queries/tasks'
import {buildTaskTree, type TreeRow} from './projectTree'

type Relations = {blocking?: number[], blocked?: number[], done?: boolean}

function makeTasks(spec: Record<number, Relations>): TaskResponse[] {
	return Object.entries(spec).map(([id, {blocking = [], blocked = [], done = false}]) => ({
		id: Number(id),
		title: `Task ${id}`,
		done,
		related_tasks: {
			blocking: blocking.map(other => ({id: other}) as TaskResponse),
			blocked: blocked.map(other => ({id: other}) as TaskResponse),
		},
	}) as unknown as TaskResponse)
}

function outline(rows: TreeRow[]): string[] {
	return rows.map(row => `${'  '.repeat(row.depth)}${row.task.id}`)
}

describe('buildTaskTree', () => {
	// 1 and 2 both block 3; 3 blocks 4. 5 is unrelated.
	const chain = makeTasks({
		1: {blocking: [3]},
		2: {blocking: [3]},
		3: {blocked: [1, 2], blocking: [4]},
		4: {blocked: [3]},
		5: {},
	})

	it('nests blockers under the tasks they block', () => {
		expect(outline(buildTaskTree(chain, 'unblockedNested'))).toEqual([
			'4',
			'  3',
			'    1',
			'    2',
			'5',
		])
	})

	it('puts unblocked tasks at the top and repeats shared dependants', () => {
		expect(outline(buildTaskTree(chain, 'unblockedTop'))).toEqual([
			'1',
			'  3',
			'    4',
			'2',
			'  3',
			'    4',
			'5',
		])
	})

	it('gives every row a unique key', () => {
		const keys = buildTaskTree(chain, 'unblockedTop').map(row => row.key)
		expect(new Set(keys).size).toBe(keys.length)
	})

	it('reads a relation reported by only one side', () => {
		const tasks = makeTasks({1: {blocking: [2]}, 2: {}})
		expect(outline(buildTaskTree(tasks, 'unblockedTop'))).toEqual(['1', '  2'])
		expect(outline(buildTaskTree(tasks, 'unblockedNested'))).toEqual(['2', '  1'])
	})

	it('ignores relations to tasks outside the view', () => {
		const tasks = makeTasks({1: {blocked: [99]}, 2: {blocking: [98]}})
		expect(outline(buildTaskTree(tasks, 'unblockedTop'))).toEqual(['1', '2'])
	})

	it('treats tasks blocked only by done tasks as unblocked', () => {
		const tasks = makeTasks({1: {blocking: [2], done: true}, 2: {blocked: [1]}})
		expect(outline(buildTaskTree(tasks, 'unblockedTop'))).toEqual(['1', '2'])
		expect(outline(buildTaskTree(tasks, 'unblockedNested'))).toEqual(['2', '  1'])
	})

	it('keeps the order of the fetched tasks among siblings', () => {
		const tasks = makeTasks({3: {}, 1: {blocking: [3]}, 2: {blocking: [3]}})
		// Fetched order is 1, 2, 3 by key order; reverse it to check siblings follow the input.
		const reversed = [...tasks].reverse()
		expect(outline(buildTaskTree(reversed, 'unblockedNested'))).toEqual(['3', '  2', '  1'])
	})

	it('cuts cycles and still shows every task', () => {
		const tasks = makeTasks({1: {blocking: [2]}, 2: {blocking: [3]}, 3: {blocking: [1]}})
		const rows = buildTaskTree(tasks, 'unblockedTop')
		expect(outline(rows)).toEqual(['1', '  2', '    3'])
	})
})
