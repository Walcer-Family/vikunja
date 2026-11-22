<script setup lang="ts">
import {computed, ref} from 'vue'
import {useQuery} from '@tanstack/vue-query'

import ProjectWrapper from '@/components/project/ProjectWrapper.vue'
import FilterPopup from '@/components/project/partials/FilterPopup.vue'
import {allTasksQuery, getDefaultTaskFilterParams, type TaskFilterParams} from '@/client/queries/tasks'
import {isSavedFilterProject} from '@/client/queries/projects'
import {useAuthStore} from '@/stores/auth'
import DagDisplayPopup from '@/walcer/dag/DagDisplayPopup.vue'
import DependencyGraph from '@/walcer/dag/DependencyGraph.vue'
import type {RawTask} from '@/walcer/dag/graph'

const props = defineProps<{
	isLoadingProject: boolean,
	projectId: number,
	viewId: number,
}>()

const auth = useAuthStore()

// Same default as the list view: open tasks only ("Show done tasks" in Filters).
const params = ref<TaskFilterParams>({...getDefaultTaskFilterParams(), filter: 'done = false'})

const query = useQuery(computed(() => allTasksQuery({
	project: props.projectId,
	view: props.viewId,
	params: {...params.value, filter_timezone: auth.settings.timezone},
})))
const tasks = computed(() => (query.data.value ?? []) as unknown as RawTask[])
</script>

<template>
	<ProjectWrapper
		class="project-graph"
		:is-loading-project="isLoadingProject"
		:project-id="projectId"
		:view-id
	>
		<template #header>
			<div class="filter-container">
				<DagDisplayPopup />
				<FilterPopup
					v-if="!isSavedFilterProject({id: projectId})"
					v-model="params"
					:view-id="viewId"
					:project-id="projectId"
				/>
			</div>
		</template>

		<template #default>
			<!-- Walcer: dependency graph (DAG); implementation in frontend/src/walcer/dag -->
			<DependencyGraph
				:tasks="tasks"
				:loading="query.isFetching.value"
				:project-id="projectId"
			/>
		</template>
	</ProjectWrapper>
</template>

<style lang="scss" scoped>
.filter-container {
	display: flex;
	align-items: center;
	gap: .5rem;
}
</style>
