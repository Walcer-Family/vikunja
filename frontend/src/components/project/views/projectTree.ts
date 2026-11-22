import type {TaskResponse} from '@/client/queries/tasks'

/**
 * How the Tree view arranges tasks along their blocking relations.
 *
 * - `unblockedNested`: the top level holds tasks that block nothing else in the view, and each task
 *   lists what blocks it underneath. The most indented tasks are the ones nothing blocks.
 * - `unblockedTop`: the top level holds tasks nothing blocks, and each task lists what it unblocks
 *   underneath.
 */
export type TreeOrientation = 'unblockedNested' | 'unblockedTop'

export const TREE_ORIENTATIONS: readonly TreeOrientation[] = ['unblockedNested', 'unblockedTop']

export interface TreeRow {
	/** Unique per row: a task shows up once for every path that reaches it. */
	key: string
	task: TaskResponse
	depth: number
}

// A task can be reached along many paths, so a deep, wide chain can multiply rows. This keeps a
// runaway relation graph from rendering without bound.
export const MAX_TREE_DEPTH = 20

function relatedIds(task: TaskResponse, kind: 'blocking' | 'blocked'): number[] {
	return (task.related_tasks[kind] ?? []).map(related => related.id)
}

/**
 * Flattens a project's tasks into indented rows built from their blocking relations.
 *
 * Only relations between tasks in `tasks` count, so the view's filter decides what is shown.
 * When unblocked tasks are at the top level, a done task no longer blocks anything: its
 * dependants count as unblocked. When blockers are nested, done blockers stay under the tasks
 * they blocked, so a task shows how much of what it waits on is finished.
 *
 * A task appears once for every path that reaches it. A relation cycle is cut where it would
 * repeat a task already on the path, and tasks only reachable through a cycle start their own
 * top-level row, so every task in `tasks` is shown at least once.
 */
export function buildTaskTree(tasks: TaskResponse[], orientation: TreeOrientation): TreeRow[] {
	const order = new Map(tasks.map((task, index) => [task.id, index]))
	const byId = new Map(tasks.map(task => [task.id, task]))

	// Each side of a blocking relation reports it, so collect both into blocker -> blocked edges.
	const blockersOf = new Map<number, Set<number>>(tasks.map(task => [task.id, new Set(relatedIds(task, 'blocked'))]))
	for (const task of tasks) {
		for (const blockedId of relatedIds(task, 'blocking')) {
			blockersOf.get(blockedId)?.add(task.id)
		}
	}

	const children = new Map<number, number[]>()
	const hasParent = new Set<number>()

	for (const task of tasks) {
		for (const blockerId of blockersOf.get(task.id) ?? []) {
			const blocker = byId.get(blockerId)
			if (!blocker || blockerId === task.id) continue

			if (orientation === 'unblockedNested') {
				addChild(children, task.id, blockerId)
				hasParent.add(blockerId)
			} else if (!blocker.done) {
				addChild(children, blockerId, task.id)
				hasParent.add(task.id)
			}
		}
	}

	for (const ids of children.values()) {
		ids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
	}

	const rows: TreeRow[] = []
	const shown = new Set<number>()

	function visit(task: TaskResponse, depth: number, path: number[]) {
		const nextPath = [...path, task.id]
		rows.push({key: nextPath.join('/'), task, depth})
		shown.add(task.id)

		if (depth >= MAX_TREE_DEPTH) return

		for (const childId of children.get(task.id) ?? []) {
			if (nextPath.includes(childId)) continue
			visit(byId.get(childId)!, depth + 1, nextPath)
		}
	}

	for (const task of tasks) {
		if (!hasParent.has(task.id)) visit(task, 0, [])
	}

	// Tasks whose every parent sits on a cycle have no top-level ancestor.
	for (const task of tasks) {
		if (!shown.has(task.id)) visit(task, 0, [])
	}

	return rows
}

function addChild(children: Map<number, number[]>, parentId: number, childId: number) {
	const ids = children.get(parentId) ?? []
	if (!ids.includes(childId)) ids.push(childId)
	children.set(parentId, ids)
}
