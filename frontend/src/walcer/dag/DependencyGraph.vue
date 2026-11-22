<!--
	Walcer: "Dependencies" page — every task relation (blocks, precedes, and
	optionally subtasks) drawn as a left-to-right DAG. Uses only the existing
	task list API; lives in frontend/src/walcer so upstream files stay untouched
	apart from one route and one sidebar link. Strings are English on purpose
	(no en.json edits, which would conflict on every upstream rebase).
-->
<template>
	<div class="dag-page">
		<header class="dag-toolbar">
			<label class="dag-field">
				<span>Project</span>
				<select
					id="dag-project"
					v-model.number="projectId"
				>
					<option :value="0">All projects</option>
					<option
						v-for="p in projectOptions"
						:key="p.id"
						:value="p.id"
					>
						{{ p.title }}
					</option>
				</select>
			</label>
			<label class="dag-check"><input
				id="dag-done"
				v-model="showDone"
				type="checkbox"
			> Completed tasks</label>
			<label class="dag-check"><input
				id="dag-subtasks"
				v-model="showSubtasks"
				type="checkbox"
			> Subtasks</label>
			<label class="dag-check"><input
				id="dag-isolated"
				v-model="showIsolated"
				type="checkbox"
			> Tasks without links</label>
			<span class="dag-legend">
				<i class="sw ready" /> Ready
				<i class="sw waiting" /> Waiting on others
				<i class="sw done" /> Done
				<i class="sw overdue" /> Overdue
			</span>
		</header>

		<Loading v-if="query.isLoading.value" />
		<p
			v-else-if="layout.nodes.length === 0"
			class="dag-empty"
		>
			No linked tasks here yet. Open a task, choose <b>Relations</b>, and add
			"blocking" or "precedes" links; they will show up as arrows on this page.
		</p>
		<div
			v-else
			class="dag-scroll"
		>
			<svg
				:width="layout.width + PAD * 2"
				:height="layout.height + PAD * 2"
				:viewBox="`${-PAD} ${-PAD} ${layout.width + PAD * 2} ${layout.height + PAD * 2}`"
				role="img"
				aria-label="Task dependency graph"
			>
				<defs>
					<marker
						id="dag-arrow"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="7"
						markerHeight="7"
						orient="auto-start-reverse"
					>
						<path
							d="M0 0L10 5L0 10z"
							class="dag-arrowhead"
						/>
					</marker>
				</defs>
				<path
					v-for="(e, i) in layout.edges"
					:key="`e${i}`"
					:d="edgePath(e)"
					class="dag-edge"
					:class="[e.kind, {cyclic: e.cyclic, hl: isHighlighted(e)}]"
					marker-end="url(#dag-arrow)"
				/>
				<g
					v-for="n in layout.nodes"
					:key="n.id"
					class="dag-node"
					:class="[n.state, {overdue: n.overdue, external: n.external, dim: hovered !== null && !related.has(n.id)}]"
					:transform="`translate(${n.x} ${n.y})`"
					tabindex="0"
					role="link"
					@click="open(n.id)"
					@keydown.enter="open(n.id)"
					@mouseenter="hovered = n.id"
					@mouseleave="hovered = null"
					@focus="hovered = n.id"
					@blur="hovered = null"
				>
					<title>{{ tooltip(n) }}</title>
					<rect
						:width="NODE_W"
						:height="NODE_H"
						rx="8"
						class="dag-box"
					/>
					<rect
						:width="5"
						:height="NODE_H"
						rx="2"
						class="dag-stripe"
					/>
					<text
						x="14"
						y="22"
						class="dag-title"
					>{{ clip(n.title, 30) }}</text>
					<text
						x="14"
						y="42"
						class="dag-meta"
					>{{ meta(n) }}</text>
				</g>
			</svg>
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useRouter} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'

import Loading from '@/components/misc/Loading.vue'
import {allTasksQuery} from '@/client/queries/tasks'
import {useProjects} from '@/composables/useProjects'
import {useTitle} from '@/composables/useTitle'
import {useAuthStore} from '@/stores/auth'
import {buildGraph, layoutGraph, type EdgeKind, type GraphEdge, type LayoutNode, type RawTask} from './graph'

const NODE_W = 240
const NODE_H = 56
const GAP_X = 70
const GAP_Y = 18
const PAD = 16

useTitle('Dependencies')

const router = useRouter()
const auth = useAuthStore()
const projectState = useProjects()

const projectId = ref(0)
const showDone = ref(true)
const showSubtasks = ref(false)
const showIsolated = ref(false)
const hovered = ref<number | null>(null)

// All tasks the user can see; filtering happens client-side so links to tasks
// in other projects can still be drawn (as "external" nodes).
const query = useQuery(computed(() => allTasksQuery({
	params: {filter: '', filter_timezone: auth.settings.timezone, sort_by: ['id'], order_by: ['asc']},
})))

const projectOptions = computed(() => [...projectState.projectsArray]
	.filter(p => p.id > 0 && !p.is_archived)
	.sort((a, b) => a.title.localeCompare(b.title)))

const layout = computed(() => {
	const kinds: EdgeKind[] = ['blocks', 'precedes', ...(showSubtasks.value ? ['subtask' as const] : [])]
	const g = buildGraph((query.data.value ?? []) as unknown as RawTask[], {
		includeKinds: kinds,
		includeIsolated: showIsolated.value,
		includeDone: showDone.value,
		isIncluded: t => projectId.value === 0 || t.project_id === projectId.value,
	})
	return layoutGraph(g.tasks, g.edges, {nodeWidth: NODE_W, nodeHeight: NODE_H, gapX: GAP_X, gapY: GAP_Y})
})

const nodeById = computed(() => new Map(layout.value.nodes.map(n => [n.id, n])))

// Hovering a task highlights everything upstream and downstream of it.
const related = computed(() => {
	const set = new Set<number>()
	if (hovered.value === null) return set
	const walk = (start: number, dir: 'up' | 'down') => {
		const stack = [start]
		while (stack.length) {
			const v = stack.pop()!
			if (set.has(v) && v !== start) continue
			set.add(v)
			for (const e of layout.value.edges) {
				if (dir === 'down' && e.from === v && !set.has(e.to)) stack.push(e.to)
				if (dir === 'up' && e.to === v && !set.has(e.from)) stack.push(e.from)
			}
		}
	}
	walk(hovered.value, 'down')
	walk(hovered.value, 'up')
	return set
})
const isHighlighted = (e: GraphEdge) => hovered.value !== null && related.value.has(e.from) && related.value.has(e.to)

function edgePath(e: GraphEdge) {
	const a = nodeById.value.get(e.from), b = nodeById.value.get(e.to)
	if (!a || !b) return ''
	const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2
	const x2 = b.x, y2 = b.y + NODE_H / 2
	if (x2 <= x1) { // cycle / same column: loop around below
		const yb = Math.max(a.y, b.y) + NODE_H + GAP_Y
		return `M${x1} ${y1} C${x1 + 40} ${y1} ${x1 + 40} ${yb} ${(x1 + x2) / 2} ${yb} S${x2 - 40} ${y2} ${x2 - 1} ${y2}`
	}
	const dx = Math.max(30, (x2 - x1) / 2)
	return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2 - 1} ${y2}`
}

const clip = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s

function meta(n: LayoutNode) {
	const parts: string[] = []
	parts.push(n.identifier || `#${n.id}`)
	if (n.external || projectId.value === 0) {
		const p = projectState.projects[n.projectId]
		if (p) parts.push(clip(p.title, 14))
	}
	if (n.assignees.length) parts.push(n.assignees.map(a => a.split(' ')[0]).join(', '))
	if (n.dueDate) parts.push(n.dueDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric'}))
	return clip(parts.join(' · '), 40)
}

function tooltip(n: LayoutNode) {
	const lines = [n.title]
	if (n.state === 'waiting') lines.push(`Waiting on ${n.openBlockers} open task${n.openBlockers === 1 ? '' : 's'}`)
	if (n.state === 'ready') lines.push('Ready to work on')
	if (n.done) lines.push('Done')
	if (n.overdue) lines.push('Overdue')
	if (n.external) lines.push('In another project')
	return lines.join('\n')
}

function open(id: number) {
	router.push({name: 'task.detail', params: {id}})
}
</script>

<style lang="scss" scoped>
.dag-page { display: grid; gap: 1rem; }
.dag-toolbar {
	display: flex; flex-wrap: wrap; align-items: center; gap: .75rem 1.25rem;
	font-size: .9rem;
}
.dag-field { display: flex; align-items: center; gap: .5rem; }
.dag-field select {
	padding: .3rem .5rem; border-radius: 4px; border: 1px solid var(--grey-300);
	background: var(--scheme-main); color: var(--text);
}
.dag-check { display: flex; align-items: center; gap: .35rem; cursor: pointer; }
.dag-legend { display: flex; align-items: center; gap: .4rem; color: var(--grey-500); margin-inline-start: auto; }
.sw {
	display: inline-block; inline-size: .8rem; block-size: .8rem; border-radius: 3px; margin-inline-start: .5rem;
	&.ready { background: var(--success); }
	&.waiting { background: var(--warning); }
	&.done { background: var(--grey-300); }
	&.overdue { background: var(--danger); }
}
.dag-empty { color: var(--grey-500); max-inline-size: 60ch; }
.dag-scroll {
	overflow: auto; max-block-size: calc(100vh - 12rem);
	background: var(--scheme-main); border-radius: 8px; box-shadow: var(--shadow-sm);
}
svg { display: block; }

.dag-edge {
	fill: none; stroke: var(--grey-400); stroke-width: 1.6;
	transition: stroke .15s, opacity .15s;
	&.precedes { stroke-dasharray: 6 4; }
	&.subtask { stroke-dasharray: 2 4; stroke: var(--grey-300); }
	&.cyclic { stroke: var(--danger); }
	&.hl { stroke: var(--primary); stroke-width: 2.4; }
}
.dag-arrowhead { fill: var(--grey-500); }

.dag-node {
	cursor: pointer; outline: none; transition: opacity .15s;
	&.dim { opacity: .35; }
	.dag-box { fill: var(--scheme-main); stroke: var(--grey-200); stroke-width: 1.2; }
	&:hover .dag-box, &:focus-visible .dag-box { stroke: var(--primary); stroke-width: 2; }
	.dag-stripe { fill: var(--grey-300); }
	&.ready .dag-stripe { fill: var(--success); }
	&.waiting .dag-stripe { fill: var(--warning); }
	&.overdue .dag-box { stroke: var(--danger); stroke-width: 2; }
	&.external .dag-box { stroke-dasharray: 4 3; }
	.dag-title { font-size: 14px; font-weight: 600; fill: var(--text); }
	.dag-meta { font-size: 12px; fill: var(--grey-500); }
	&.done .dag-title { fill: var(--grey-500); text-decoration: line-through; }
}
</style>
