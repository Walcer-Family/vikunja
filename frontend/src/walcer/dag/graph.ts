// Walcer: task dependency graph (DAG) — data model and layered layout.
// Pure functions, no Vue and no dependencies, so this file never conflicts
// with upstream and is easy to unit-test.

export type EdgeKind = 'blocks' | 'precedes' | 'subtask'

export interface GraphTask {
	id: number
	title: string
	done: boolean
	dueDate: Date | null
	projectId: number
	identifier: string
	assignees: {id: number, name: string}[]
	labels: {id: number, title: string, color: string}[]
	/** true when the task is outside the current filter but linked to a task inside it */
	external: boolean
}

export interface GraphEdge {
	from: number
	to: number
	kind: EdgeKind
	/** edge that closes a cycle; drawn, but ignored for layering */
	cyclic: boolean
}

export type NodeState = 'done' | 'ready' | 'waiting'

export interface LayoutNode extends GraphTask {
	x: number
	y: number
	layer: number
	state: NodeState
	overdue: boolean
	/** open tasks that must finish before this one */
	openBlockers: number
}

export interface Layout {
	nodes: LayoutNode[]
	edges: GraphEdge[]
	width: number
	height: number
}

/** Relation kinds as returned in task.related_tasks, mapped to a directed edge. */
const RELATION_EDGES: Record<string, {kind: EdgeKind, forward: boolean}> = {
	blocking: {kind: 'blocks', forward: true},
	blocked: {kind: 'blocks', forward: false},
	precedes: {kind: 'precedes', forward: true},
	follows: {kind: 'precedes', forward: false},
	subtask: {kind: 'subtask', forward: true},
	parenttask: {kind: 'subtask', forward: false},
}

export interface RawTask {
	id: number
	title: string
	done: boolean
	due_date?: string | null
	project_id: number
	identifier?: string
	assignees?: {id?: number, username?: string, name?: string}[] | null
	labels?: {id?: number, title?: string, hex_color?: string}[] | null
	related_tasks?: Record<string, RawTask[] | null> | null
}

function parseDue(d?: string | null): Date | null {
	if (!d || d.startsWith('0001-')) return null
	const t = new Date(d)
	return isNaN(t.getTime()) ? null : t
}

function toGraphTask(t: RawTask, external: boolean): GraphTask {
	return {
		id: t.id,
		title: t.title,
		done: t.done,
		dueDate: parseDue(t.due_date),
		projectId: t.project_id,
		identifier: t.identifier ?? '',
		assignees: (t.assignees ?? []).map(a => ({id: a.id ?? 0, name: a.name || a.username || '?'})),
		labels: (t.labels ?? []).map(l => ({id: l.id ?? 0, title: l.title ?? '', color: l.hex_color ?? ''})),
		external,
	}
}

export interface BuildOptions {
	includeKinds: EdgeKind[]
	/** keep tasks with no edges */
	includeIsolated: boolean
	includeDone: boolean
	/** tasks inside the filter; others only appear when linked to these */
	isIncluded: (t: RawTask) => boolean
}

/** Builds the node and edge sets from the task list the API returns. */
export function buildGraph(tasks: RawTask[], opts: BuildOptions): {tasks: GraphTask[], edges: GraphEdge[]} {
	const byId = new Map<number, GraphTask>()
	const inScope = tasks.filter(t => opts.isIncluded(t) && (opts.includeDone || !t.done))
	for (const t of inScope) byId.set(t.id, toGraphTask(t, false))

	const edges = new Map<string, GraphEdge>()
	for (const t of inScope) {
		for (const [rel, others] of Object.entries(t.related_tasks ?? {})) {
			const map = RELATION_EDGES[rel]
			if (!map || !opts.includeKinds.includes(map.kind)) continue
			for (const o of others ?? []) {
				if (!opts.includeDone && o.done) continue
				if (!byId.has(o.id)) byId.set(o.id, toGraphTask(o, true))
				const [from, to] = map.forward ? [t.id, o.id] : [o.id, t.id]
				if (from === to) continue
				const key = `${from}>${to}>${map.kind}`
				if (!edges.has(key)) edges.set(key, {from, to, kind: map.kind, cyclic: false})
			}
		}
	}

	const linked = new Set<number>()
	for (const e of edges.values()) { linked.add(e.from); linked.add(e.to) }
	const nodes = [...byId.values()].filter(n => opts.includeIsolated || linked.has(n.id))
	return {tasks: nodes, edges: [...edges.values()]}
}

/** Marks edges that close a cycle (DFS back edges) so layering can ignore them. */
export function markCycles(nodeIds: number[], edges: GraphEdge[]): void {
	const out = new Map<number, GraphEdge[]>()
	for (const e of edges) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e)
	const state = new Map<number, 1 | 2>() // 1 = on stack, 2 = finished
	const visit = (v: number) => {
		state.set(v, 1)
		for (const e of out.get(v) ?? []) {
			const s = state.get(e.to)
			if (s === 1) e.cyclic = true
			else if (s === undefined) visit(e.to)
		}
		state.set(v, 2)
	}
	for (const id of [...nodeIds].sort((a, b) => a - b)) if (!state.has(id)) visit(id)
}

export interface LayoutOptions {
	nodeWidth: number
	nodeHeight: number
	gapX: number
	gapY: number
	now?: Date
}

/**
 * Layered (Sugiyama-style) layout, left to right:
 * longest-path layering, then barycenter ordering sweeps to reduce crossings.
 */
export function layoutGraph(tasks: GraphTask[], edges: GraphEdge[], o: LayoutOptions): Layout {
	const ids = tasks.map(t => t.id)
	const idSet = new Set(ids)
	const live = edges.filter(e => idSet.has(e.from) && idSet.has(e.to))
	markCycles(ids, live)
	const dag = live.filter(e => !e.cyclic)

	const preds = new Map<number, number[]>(ids.map(id => [id, []]))
	const succs = new Map<number, number[]>(ids.map(id => [id, []]))
	for (const e of dag) { preds.get(e.to)!.push(e.from); succs.get(e.from)!.push(e.to) }

	// Longest path from sources (Kahn order).
	const layer = new Map<number, number>()
	const indeg = new Map(ids.map(id => [id, preds.get(id)!.length]))
	const queue = ids.filter(id => indeg.get(id) === 0).sort((a, b) => a - b)
	for (const id of queue) layer.set(id, 0)
	while (queue.length) {
		const v = queue.shift()!
		for (const w of succs.get(v)!) {
			layer.set(w, Math.max(layer.get(w) ?? 0, layer.get(v)! + 1))
			indeg.set(w, indeg.get(w)! - 1)
			if (indeg.get(w) === 0) queue.push(w)
		}
	}

	const byLayer: number[][] = []
	const task = new Map(tasks.map(t => [t.id, t]))
	for (const id of ids) (byLayer[layer.get(id) ?? 0] ??= []).push(id)
	for (const l of byLayer) l?.sort((a, b) =>
		(task.get(a)!.projectId - task.get(b)!.projectId) || (a - b))

	// Barycenter sweeps.
	const pos = new Map<number, number>()
	const reindex = () => byLayer.forEach(l => l?.forEach((id, i) => pos.set(id, i)))
	reindex()
	const bary = (id: number, nbrs: Map<number, number[]>) => {
		const ns = nbrs.get(id)!
		return ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(id)!
	}
	for (let sweep = 0; sweep < 6; sweep++) {
		const down = sweep % 2 === 0
		const order = down ? byLayer.keys() : [...byLayer.keys()].reverse()
		for (const li of order) {
			const l = byLayer[li]
			if (!l) continue
			const nbrs = down ? preds : succs
			const score = new Map(l.map(id => [id, bary(id, nbrs)]))
			l.sort((a, b) => (score.get(a)! - score.get(b)!) || (pos.get(a)! - pos.get(b)!))
			l.forEach((id, i) => pos.set(id, i))
		}
	}

	const tallest = Math.max(1, ...byLayer.map(l => l?.length ?? 0))
	const colHeight = tallest * o.nodeHeight + (tallest - 1) * o.gapY
	const now = o.now ?? new Date()
	const openBlockers = (id: number) => live
		.filter(e => e.to === id && e.kind !== 'subtask' && !task.get(e.from)!.done).length

	const nodes: LayoutNode[] = []
	byLayer.forEach((l, li) => {
		if (!l) return
		const h = l.length * o.nodeHeight + (l.length - 1) * o.gapY
		const top = (colHeight - h) / 2
		l.forEach((id, i) => {
			const t = task.get(id)!
			const blockers = openBlockers(id)
			nodes.push({
				...t,
				layer: li,
				x: li * (o.nodeWidth + o.gapX),
				y: top + i * (o.nodeHeight + o.gapY),
				openBlockers: blockers,
				state: t.done ? 'done' : blockers > 0 ? 'waiting' : 'ready',
				overdue: !t.done && t.dueDate !== null && t.dueDate < now,
			})
		})
	})

	const layers = byLayer.length
	return {
		nodes,
		edges: live,
		width: Math.max(o.nodeWidth, layers * o.nodeWidth + (layers - 1) * o.gapX),
		height: Math.max(o.nodeHeight, colHeight),
	}
}
