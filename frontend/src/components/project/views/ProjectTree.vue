<template>
	<ProjectWrapper
		class="project-tree"
		:is-loading-project="isLoadingProject"
		:project-id="projectId"
		:view-id
	>
		<template #header>
			<div class="filter-container">
				<Popup
					placement="bottom-end"
					:anchor="arrangeTriggerEl"
				>
					<template #trigger="{toggle}">
						<XButton
							ref="arrangeTrigger"
							variant="secondary"
							icon="sitemap"
							@click.prevent.stop="toggle()"
						>
							{{ $t('project.tree.arrange') }}
						</XButton>
					</template>
					<template #content="{close}">
						<Card class="arrange-popup">
							<div
								v-for="option in TREE_ORIENTATIONS"
								:key="option"
								class="control"
							>
								<label class="radio">
									<input
										v-model="orientation"
										name="treeOrientation"
										type="radio"
										:value="option"
										@change="close()"
									>
									{{ $t(`project.tree.${option}.title`) }}
								</label>
								<p class="help">
									{{ $t(`project.tree.${option}.description`) }}
								</p>
							</div>
							<FancyCheckbox
								v-model="showDoneTasks"
								class="arrange-popup__done"
							>
								{{ $t('project.tree.showDoneTasks') }}
							</FancyCheckbox>
						</Card>
					</template>
				</Popup>
				<SortPopup
					v-model="sortBy"
				/>
				<FilterPopup
					v-if="!isSavedFilterProject(project)"
					v-model="params"
					:view-id="viewId"
					:project-id="projectId"
				/>
			</div>
		</template>

		<template #default>
			<div
				:class="{ 'is-loading': showLoading }"
				class="loader-container is-max-width-desktop tree-view"
			>
				<Card
					:padding="false"
					:has-content="false"
					class="has-overflow"
				>
					<AddTask
						v-if="!project?.is_archived && canWrite"
						ref="addTaskRef"
						class="tree-view__add-task d-print-none"
						@tasksAdded="updateTaskList"
					/>

					<Nothing v-if="ctaVisible && rows.length === 0 && !loading">
						{{ $t('project.list.empty') }}
						<ButtonLink
							v-if="(project?.id ?? 0) > 0 && canWrite"
							@click="focusNewTaskInput()"
						>
							{{ $t('project.list.newTaskCta') }}
						</ButtonLink>
					</Nothing>

					<ul
						v-if="rows.length > 0"
						class="tasks"
					>
						<template
							v-for="(row, index) in rows"
							:key="row.key"
						>
							<li
								:style="{'--tree-depth': row.depth}"
								class="tree-row"
							>
								<SingleTaskInProject
									:ref="(el) => setTaskRef(el as InstanceType<typeof SingleTaskInProject> | null, index)"
									:can-mark-as-done="canWrite"
									:the-task="row.task"
								>
									<BaseButton
										v-if="canWrite"
										v-tooltip="$t(`project.tree.${orientation}.addUnder`)"
										class="add-under"
										:class="{'is-active': addingUnder === row.key}"
										:aria-label="$t(`project.tree.${orientation}.addUnder`)"
										@click.stop="toggleAddUnder(row.key)"
									>
										<Icon icon="plus" />
									</BaseButton>
								</SingleTaskInProject>
							</li>
							<li
								v-if="addingUnder === row.key"
								:style="{'--tree-depth': row.depth + 1}"
								class="tree-row tree-row__add-task"
								@keydown.esc="addingUnder = null"
							>
								<AddTask @tasksAdded="tasks => relateNewTasks(tasks, row.task.id)" />
							</li>
						</template>
					</ul>
				</Card>
			</div>
		</template>
	</ProjectWrapper>
</template>

<script setup lang="ts">
import {ref, computed, nextTick, onMounted, onBeforeUnmount, watch} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {useStorage} from '@vueuse/core'

import ProjectWrapper from '@/components/project/ProjectWrapper.vue'
import ButtonLink from '@/components/misc/ButtonLink.vue'
import Card from '@/components/misc/Card.vue'
import Nothing from '@/components/misc/Nothing.vue'
import Popup from '@/components/misc/Popup.vue'
import XButton from '@/components/input/Button.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import AddTask from '@/components/tasks/AddTask.vue'
import SingleTaskInProject from '@/components/tasks/partials/SingleTaskInProject.vue'
import FilterPopup from '@/components/project/partials/FilterPopup.vue'
import SortPopup from '@/components/project/partials/SortPopup.vue'

import type {Task as ITask} from '@/client/generated'
import {useCreateTaskRelationMutation} from '@/client/queries/taskMutations'
import {allTasksQuery, getDefaultTaskFilterParams, type TaskFilterParams} from '@/client/queries/tasks'
import {isSavedFilterProject} from '@/client/queries/projects'
import {isRequestContextAbort} from '@/client/requestContext'
import {useCurrentProject} from '@/composables/useCurrentProject'
import {useDelayedLoading} from '@/composables/useDelayedLoading'
import type {SortBy} from '@/composables/useTaskList'
import {PERMISSIONS as Permissions} from '@/constants/permissions'
import {eventToShortcutString} from '@/helpers/shortcut'
import {error} from '@/message'
import {useAuthStore} from '@/stores/auth'
import {useBaseStore} from '@/stores/base'
import {RELATION_KIND} from '@/types/IRelationKind'

import {buildTaskTree, TREE_ORIENTATIONS, type TreeOrientation} from './projectTree'

const props = defineProps<{
	isLoadingProject: boolean,
	projectId: number,
	viewId: number,
}>()

defineOptions({name: 'ProjectTree'})

const orientation = useStorage<TreeOrientation>('treeViewOrientation', 'unblockedNested')
// Like the default List view, done tasks stay out of the way unless asked for.
const showDoneTasks = useStorage('treeViewShowDoneTasks', false)

const params = ref<TaskFilterParams>({...getDefaultTaskFilterParams()})
const sortBy = ref<SortBy>({position: 'asc'})
watch([() => props.projectId, () => props.viewId], () => {
	params.value = {...getDefaultTaskFilterParams()}
	sortBy.value = {position: 'asc'}
})

const authStore = useAuthStore()

const query = useQuery(computed(() => {
	// The id is only a tie-breaker for the selected sort field.
	const sortKeys = [...(Object.keys(sortBy.value) as (keyof SortBy)[]).filter(key => key !== 'id'), 'id' as const]
	return allTasksQuery({
		project: props.projectId,
		view: props.viewId,
		params: {
			...params.value,
			sort_by: sortKeys,
			order_by: sortKeys.map(key => sortBy.value[key] ?? 'desc'),
			filter_timezone: authStore.settings.timezone,
			expand: ['comment_count', 'is_unread'],
		},
	})
}))

watch(query.error, cause => {
	if (cause && !isRequestContextAbort(cause)) error(cause)
})

const loading = query.isFetching
const showLoading = useDelayedLoading(loading)

const visibleTasks = computed(() => {
	const tasks = query.data.value ?? []
	return showDoneTasks.value ? tasks : tasks.filter(task => !task.done)
})

const rows = computed(() => buildTaskTree(visibleTasks.value, orientation.value))

const baseStore = useBaseStore()
const {currentProject: project} = useCurrentProject()

const canWrite = computed(() => {
	return typeof project.value?.max_permission === 'number' &&
		project.value.max_permission > Permissions.READ &&
		project.value.id > 0
})

const ctaVisible = ref(false)
onMounted(async () => {
	await nextTick()
	ctaVisible.value = true
})

const arrangeTrigger = ref<InstanceType<typeof XButton> | null>(null)
const arrangeTriggerEl = computed<HTMLElement | null>(() => arrangeTrigger.value?.$el ?? null)

const addTaskRef = ref<typeof AddTask | null>(null)

function focusNewTaskInput() {
	addTaskRef.value?.focusTaskInput()
}

function updateTaskList() {
	baseStore.setHasTasks(true)
}

// The row a new task is being added under, by row key: a task can have several rows.
const addingUnder = ref<string | null>(null)
watch([() => props.projectId, () => props.viewId, orientation], () => { addingUnder.value = null })

function toggleAddUnder(rowKey: string) {
	addingUnder.value = addingUnder.value === rowKey ? null : rowKey
}

const createRelation = useCreateTaskRelationMutation()

// A task added under a row becomes its child in the current arrangement: a blocker of the row
// when blockers are nested, or a task the row blocks when unblocked tasks are at the top.
async function relateNewTasks(created: ITask[], rowTaskId: number) {
	updateTaskList()
	addingUnder.value = null
	await Promise.all(created.map(task => createRelation.mutateAsync(orientation.value === 'unblockedNested'
		? {taskId: task.id!, other_task_id: rowTaskId, relation_kind: RELATION_KIND.BLOCKING}
		: {taskId: rowTaskId, other_task_id: task.id!, relation_kind: RELATION_KIND.BLOCKING},
	))).catch(() => { /* Mutation reports the error. */ })
}

const taskRefs = ref<(InstanceType<typeof SingleTaskInProject> | null)[]>([])
const focusedIndex = ref(-1)

function setTaskRef(el: InstanceType<typeof SingleTaskInProject> | null, index: number) {
	if (el === null) {
		delete taskRefs.value[index]
	} else {
		taskRefs.value[index] = el
	}
}

function focusTask(index: number) {
	if (index < 0 || index >= rows.value.length) {
		return
	}

	focusedIndex.value = index
	taskRefs.value[index]?.focus()
}

function handleTreeNavigation(e: KeyboardEvent) {
	if (e.target instanceof HTMLElement && (e.target.closest('input, textarea, select, [contenteditable="true"]'))) {
		return
	}

	const shortcut = eventToShortcutString(e)
	if (shortcut === 'KeyJ') {
		e.preventDefault()
		focusTask(Math.min(focusedIndex.value + 1, rows.value.length - 1))
		return
	}

	if (shortcut === 'KeyK') {
		e.preventDefault()
		if (focusedIndex.value === -1) {
			focusTask(rows.value.length - 1)
			return
		}

		if (focusedIndex.value === 0) {
			addTaskRef.value?.focusTaskInput()
			focusedIndex.value = -1
			return
		}

		focusTask(Math.max(focusedIndex.value - 1, 0))
		return
	}

	if (shortcut === 'Enter') {
		// Links and buttons activate natively on Enter; leave them alone
		if (e.target instanceof HTMLElement && e.target.closest('a, button, [role="button"]')) {
			return
		}

		// Only act when a row was focused via J/K roving navigation
		if (focusedIndex.value < 0) {
			return
		}

		e.preventDefault()
		taskRefs.value[focusedIndex.value]?.click(e)
	}
}

onMounted(() => {
	document.addEventListener('keydown', handleTreeNavigation)
})

onBeforeUnmount(() => {
	document.removeEventListener('keydown', handleTreeNavigation)
})
</script>

<style lang="scss" scoped>
.filter-container {
	display: flex;
	align-items: center;
	gap: .5rem;

	:deep(.popup) {
		max-inline-size: 300px;
	}
}

.arrange-popup {
	.control + .control {
		margin-block-start: .75rem;
	}

	.help {
		margin-block-start: .25rem;
		margin-inline-start: 1.25rem;
		color: var(--grey-500);
	}
}

.tasks {
	padding: .5rem;
}

// Same step as the List view's nested subtasks.
.tree-row {
	margin-inline-start: calc(var(--tree-depth) * 1.75rem);
}

.tree-row__add-task {
	padding: .25rem .4rem;
}

// Revealed on hover like the row's favorite star.
:deep(.single-task .add-under) {
	inline-size: 27px;
	text-align: center;
	border-radius: $radius;
	color: var(--grey-400);
	transition: opacity $transition, color $transition;

	&:hover,
	&.is-active {
		color: var(--primary);
	}
}

@media (hover: hover) and (pointer: fine) {
	:deep(.single-task) {
		.add-under:not(.is-active, :focus) {
			opacity: 0;
		}

		&:hover .add-under {
			opacity: 1;
		}
	}
}

.arrange-popup__done {
	margin-block-start: .75rem;
}

.tree-view__add-task {
	padding: 1rem 1rem 0;
}

.link-share-view .card {
	border: none;
	box-shadow: none;
}

.tree-view {
	padding-block-end: 1rem;

	:deep(.card) {
		margin-block-end: 0;
	}
}
</style>
