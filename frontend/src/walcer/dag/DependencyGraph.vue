<!--
	Walcer: task dependency graph (DAG). Presentational: the containers
	(ProjectGraph.vue for one project, DependenciesPage.vue for everything)
	fetch tasks through the regular task list API and Vikunja's own filters,
	and pass them in. Blocking / precedes (and optionally subtask) relations
	become left-to-right arrows; layout lives in ./graph.ts.
-->
<template>
	<div
		class="loader-container dependency-graph"
		:class="{'is-loading': loading}"
	>
		<Card
			:padding="false"
			:has-content="false"
		>
			<div class="dag-legend">
				<template v-if="settings.colorBy === 'status'">
					<span><i class="swatch is-ready" />{{ $t('walcer.dependencies.legend.ready') }}</span>
					<span><i class="swatch is-waiting" />{{ $t('walcer.dependencies.legend.waiting') }}</span>
					<span><i class="swatch is-done" />{{ $t('walcer.dependencies.legend.done') }}</span>
				</template>
				<template v-else>
					<span
						v-for="item in legend"
						:key="item.key"
					><i
						class="swatch"
						:style="{background: item.color}"
					/>{{ item.name }}</span>
				</template>
				<span><i class="swatch is-overdue" />{{ $t('walcer.dependencies.legend.overdue') }}</span>
			</div>

			<p
				v-if="!loading && layout.nodes.length === 0"
				class="has-text-centered has-text-grey is-italic dag-empty"
			>
				{{ $t('walcer.dependencies.empty') }}
			</p>
			<div
				v-else
				class="dag-canvas"
			>
				<svg
					:width="layout.width + PAD * 2"
					:height="layout.height + PAD * 2"
					:viewBox="`${-PAD} ${-PAD} ${layout.width + PAD * 2} ${layout.height + PAD * 2}`"
					role="img"
					:aria-label="$t('walcer.dependencies.title')"
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
						:class="[`is-${e.kind}`, {'is-cyclic': e.cyclic, 'is-highlighted': isHighlighted(e)}]"
						marker-end="url(#dag-arrow)"
					/>
					<g
						v-for="n in layout.nodes"
						:key="n.id"
						v-tooltip="tooltip(n)"
						class="dag-node"
						:class="[`is-${n.state}`, {'is-overdue': n.overdue, 'is-external': n.external, 'is-dimmed': hovered !== null && !related.has(n.id)}]"
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
						<rect
							:width="NODE_W"
							:height="NODE_H"
							rx="4"
							class="dag-box"
						/>
						<rect
							:width="4"
							:height="NODE_H"
							rx="2"
							class="dag-stripe"
							:style="settings.colorBy === 'status' ? undefined : {fill: groupOf(n).color}"
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
		</Card>
	</div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'

import {useProjects} from '@/composables/useProjects'
import {buildGraph, layoutGraph, type EdgeKind, type GraphEdge, type LayoutNode, type RawTask} from './graph'
import {useDagSettings} from './useDagSettings'

const props = defineProps<{
	tasks: RawTask[]
	loading?: boolean
	/** set inside a project's Graph view; tasks of other projects are then shown as linked */
	projectId?: number
}>()

const NODE_W = 240
const NODE_H = 56
const GAP_X = 70
const GAP_Y = 18
const PAD = 16

const {t} = useI18n({useScope: 'global'})
const router = useRouter()
const projectState = useProjects()
const settings = useDagSettings()
const hovered = ref<number | null>(null)

const layout = computed(() => {
	const kinds: EdgeKind[] = ['blocks', 'precedes', ...(settings.value.showSubtasks ? ['subtask' as const] : [])]
	const g = buildGraph(props.tasks, {
		includeKinds: kinds,
		includeIsolated: settings.value.showUnlinked,
		// Done and all other filtering already happened server-side via the filter popup.
		includeDone: true,
		isIncluded: () => true,
	})
	return layoutGraph(g.tasks, g.edges, {nodeWidth: NODE_W, nodeHeight: NODE_H, gapX: GAP_X, gapY: GAP_Y})
})

const nodeById = computed(() => new Map(layout.value.nodes.map(n => [n.id, n])))

// Hovering a task highlights everything upstream and downstream of it.
const related = computed(() => {
	const set = new Set<number>()
	if (hovered.value === null) return set
	for (const dir of ['up', 'down'] as const) {
		const stack = [hovered.value]
		while (stack.length) {
			const v = stack.pop()!
			set.add(v)
			for (const e of layout.value.edges) {
				const next = dir === 'down' ? (e.from === v ? e.to : null) : (e.to === v ? e.from : null)
				if (next !== null && !set.has(next)) stack.push(next)
			}
		}
	}
	return set
})
const isHighlighted = (e: GraphEdge) => hovered.value !== null && related.value.has(e.from) && related.value.has(e.to)

// Color groups for the non-status modes: a fixed palette, except that projects
// and labels use their own color when they have one.
const PALETTE = ['#1973ff', '#ff8a00', '#2bb673', '#8e4ec6', '#00a2c7', '#d6409f', '#a18072', '#e5484d']
const NONE = 'var(--grey-300)'
const hex = (c?: string) => c ? (c.startsWith('#') ? c : `#${c}`) : ''
const pick = (id: number) => PALETTE[Math.abs(id) % PALETTE.length]

function groupOf(n: LayoutNode): {key: string, name: string, color: string} {
	if (settings.value.colorBy === 'project') {
		const p = projectState.projects[n.projectId]
		return {key: `p${n.projectId}`, name: p?.title ?? t('walcer.dependencies.legend.otherProject'), color: hex(p?.hex_color) || pick(n.projectId)}
	}
	if (settings.value.colorBy === 'person') {
		const a = n.assignees[0]
		return a
			? {key: `u${a.id}`, name: a.name, color: pick(a.id)}
			: {key: 'u0', name: t('walcer.dependencies.legend.unassigned'), color: NONE}
	}
	const l = n.labels[0]
	return l
		? {key: `l${l.id}`, name: l.title, color: hex(l.color) || pick(l.id)}
		: {key: 'l0', name: t('walcer.dependencies.legend.noLabel'), color: NONE}
}

const legend = computed(() => {
	const m = new Map<string, {key: string, name: string, color: string}>()
	for (const n of layout.value.nodes) {
		const g = groupOf(n)
		if (!m.has(g.key)) m.set(g.key, g)
	}
	return [...m.values()]
})

function edgePath(e: GraphEdge) {
	const a = nodeById.value.get(e.from), b = nodeById.value.get(e.to)
	if (!a || !b) return ''
	const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2
	const x2 = b.x, y2 = b.y + NODE_H / 2
	if (x2 <= x1) { // a cycle: loop around underneath
		const yb = Math.max(a.y, b.y) + NODE_H + GAP_Y
		return `M${x1} ${y1} C${x1 + 40} ${y1} ${x1 + 40} ${yb} ${(x1 + x2) / 2} ${yb} S${x2 - 40} ${y2} ${x2 - 1} ${y2}`
	}
	const dx = Math.max(30, (x2 - x1) / 2)
	return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2 - 1} ${y2}`
}

const clip = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s

function meta(n: LayoutNode) {
	const parts: string[] = [n.identifier || `#${n.id}`]
	if (n.external || !props.projectId) {
		const p = projectState.projects[n.projectId]
		if (p) parts.push(clip(p.title, 14))
	}
	if (n.assignees.length) parts.push(n.assignees.map(a => a.name.split(' ')[0]).join(', '))
	if (n.dueDate) parts.push(n.dueDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric'}))
	return clip(parts.join(' · '), 40)
}

function tooltip(n: LayoutNode) {
	const lines = [n.title]
	if (n.state === 'waiting') lines.push(t('walcer.dependencies.tooltip.waiting', {count: n.openBlockers}, n.openBlockers))
	if (n.state === 'ready') lines.push(t('walcer.dependencies.tooltip.ready'))
	if (n.overdue) lines.push(t('walcer.dependencies.legend.overdue'))
	if (n.external) lines.push(t('walcer.dependencies.tooltip.external'))
	return lines.join(' · ')
}

function open(id: number) {
	router.push({name: 'task.detail', params: {id}})
}
</script>

<style lang="scss" scoped>
.dag-legend {
	display: flex;
	flex-wrap: wrap;
	gap: .25rem 1rem;
	padding: .75rem 1rem;
	border-block-end: 1px solid var(--grey-200);
	font-size: .85rem;
	color: var(--grey-600);

	span {
		display: inline-flex;
		align-items: center;
		gap: .35rem;
	}
}

.swatch {
	display: inline-block;
	inline-size: .75rem;
	block-size: .75rem;
	border-radius: $radius;

	&.is-ready { background: var(--success); }
	&.is-waiting { background: var(--warning); }
	&.is-done { background: var(--grey-300); }
	&.is-overdue { background: var(--danger); }
}

.dag-empty {
	padding: 2rem 1rem;
}

.dag-canvas {
	max-block-size: calc(100vh - 14rem);
	overflow: auto;

	svg {
		display: block;
	}
}

.dag-edge {
	fill: none;
	stroke: var(--grey-400);
	stroke-width: 1.5;
	transition: stroke $transition, opacity $transition;

	&.is-precedes { stroke-dasharray: 6 4; }
	&.is-subtask { stroke-dasharray: 2 4; stroke: var(--grey-300); }
	&.is-cyclic { stroke: var(--danger); }
	&.is-highlighted { stroke: var(--primary); stroke-width: 2.25; }
}

.dag-arrowhead {
	fill: var(--grey-500);
}

.dag-node {
	cursor: pointer;
	outline: none;
	transition: opacity $transition;

	&.is-dimmed { opacity: .35; }

	.dag-box {
		fill: var(--white);
		stroke: var(--grey-200);
		stroke-width: 1;
	}

	&:hover .dag-box,
	&:focus-visible .dag-box {
		stroke: var(--primary);
		stroke-width: 2;
	}

	.dag-stripe { fill: var(--grey-300); }
	&.is-ready .dag-stripe { fill: var(--success); }
	&.is-waiting .dag-stripe { fill: var(--warning); }
	&.is-overdue .dag-box { stroke: var(--danger); stroke-width: 2; }
	&.is-external .dag-box { stroke-dasharray: 4 3; }

	.dag-title {
		font-size: 14px;
		font-weight: 600;
		fill: var(--text);
	}

	.dag-meta {
		font-size: 12px;
		fill: var(--grey-500);
	}

	&.is-done .dag-title {
		fill: var(--grey-500);
		text-decoration: line-through;
	}
}
</style>
