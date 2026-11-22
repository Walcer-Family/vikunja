<!-- Walcer: global Dependencies page (sidebar link, route /dependencies): every project at once. -->
<script setup lang="ts">
import {computed, ref} from 'vue'
import {useQuery} from '@tanstack/vue-query'

import FilterPopup from '@/components/project/partials/FilterPopup.vue'
import {allTasksQuery, getDefaultTaskFilterParams, type TaskFilterParams} from '@/client/queries/tasks'
import {useTitle} from '@/composables/useTitle'
import {useAuthStore} from '@/stores/auth'
import {useI18n} from 'vue-i18n'
import DagDisplayPopup from './DagDisplayPopup.vue'
import DependencyGraph from './DependencyGraph.vue'
import type {RawTask} from './graph'

const {t} = useI18n({useScope: 'global'})
useTitle(() => t('walcer.dependencies.title'))

const auth = useAuthStore()
const params = ref<TaskFilterParams>({...getDefaultTaskFilterParams(), filter: 'done = false'})
const query = useQuery(computed(() => allTasksQuery({
	params: {...params.value, filter_timezone: auth.settings.timezone},
})))
const tasks = computed(() => (query.data.value ?? []) as unknown as RawTask[])
</script>

<template>
	<div class="dependencies-page">
		<h2 class="mbe-2 title">
			{{ $t('walcer.dependencies.title') }}
		</h2>
		<p class="has-text-grey mbe-4">
			{{ $t('walcer.dependencies.description') }}
		</p>
		<div class="filter-container mbe-4">
			<DagDisplayPopup />
			<FilterPopup v-model="params" />
		</div>
		<DependencyGraph
			:tasks="tasks"
			:loading="query.isFetching.value"
		/>
	</div>
</template>

<style lang="scss" scoped>
.filter-container {
	display: flex;
	align-items: center;
	gap: .5rem;
}
</style>
