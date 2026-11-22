import {describe, expect, it} from 'vitest'
import {buildGraph, layoutGraph, type RawTask} from './graph'

const t = (id: number, extra: Partial<RawTask> = {}): RawTask => ({
	id, title: `Task ${id}`, done: false, project_id: 1, ...extra,
})
const opts = {
	includeKinds: ['blocks', 'precedes'] as const,
	includeIsolated: false,
	includeDone: true,
	isIncluded: () => true,
}
const L = {nodeWidth: 100, nodeHeight: 40, gapX: 50, gapY: 10, now: new Date('2026-11-22T00:00:00Z')}

describe('buildGraph', () => {
	it('dedupes the two directions Vikunja stores for one relation', () => {
		const a = t(1), b = t(2)
		a.related_tasks = {blocking: [b]}
		b.related_tasks = {blocked: [a]}
		const g = buildGraph([a, b], {...opts, includeKinds: [...opts.includeKinds]})
		expect(g.edges).toEqual([{from: 1, to: 2, kind: 'blocks', cyclic: false}])
	})

	it('adds linked tasks outside the filter as external nodes', () => {
		const other = t(9, {project_id: 2})
		const a = t(1, {related_tasks: {precedes: [other]}})
		const g = buildGraph([a, other], {...opts, includeKinds: [...opts.includeKinds], isIncluded: x => x.project_id === 1})
		expect(g.tasks.map(n => [n.id, n.external])).toEqual([[1, false], [9, true]])
	})

	it('drops isolated tasks unless asked', () => {
		const g = buildGraph([t(1), t(2)], {...opts, includeKinds: [...opts.includeKinds]})
		expect(g.tasks).toHaveLength(0)
	})
})

describe('layoutGraph', () => {
	it('puts each task one layer after its latest prerequisite', () => {
		const a = t(1, {related_tasks: {blocking: [t(2)], precedes: [t(3)]}})
		const b = t(2, {related_tasks: {blocking: [t(3)]}})
		const c = t(3)
		const g = buildGraph([a, b, c], {...opts, includeKinds: [...opts.includeKinds]})
		const layout = layoutGraph(g.tasks, g.edges, L)
		const layerOf = Object.fromEntries(layout.nodes.map(n => [n.id, n.layer]))
		expect(layerOf).toEqual({1: 0, 2: 1, 3: 2})
	})

	it('survives cycles and marks the closing edge', () => {
		const a = t(1, {related_tasks: {blocking: [t(2)]}})
		const b = t(2, {related_tasks: {blocking: [t(1)]}})
		const g = buildGraph([a, b], {...opts, includeKinds: [...opts.includeKinds]})
		const layout = layoutGraph(g.tasks, g.edges, L)
		expect(layout.nodes).toHaveLength(2)
		expect(layout.edges.filter(e => e.cyclic)).toHaveLength(1)
	})

	it('derives ready / waiting / done and overdue', () => {
		const a = t(1, {related_tasks: {blocking: [t(2)]}})
		const b = t(2, {due_date: '2026-11-01T00:00:00Z'})
		const c = t(3, {done: true, related_tasks: {blocking: [t(4)]}})
		const d = t(4)
		const g = buildGraph([a, b, c, d], {...opts, includeKinds: [...opts.includeKinds]})
		const by = Object.fromEntries(layoutGraph(g.tasks, g.edges, L).nodes.map(n => [n.id, n]))
		expect([by[1].state, by[2].state, by[3].state, by[4].state]).toEqual(['ready', 'waiting', 'done', 'ready'])
		expect(by[2].overdue).toBe(true)
	})
})
