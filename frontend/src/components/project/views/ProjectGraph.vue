<script setup lang="ts">
import ProjectWrapper from '@/components/project/ProjectWrapper.vue'

defineProps<{
	isLoadingProject: boolean,
	projectId: number,
	viewId: number,
}>()
</script>

<template>
	<ProjectWrapper
		class="project-graph"
		:is-loading-project="isLoadingProject"
		:project-id="projectId"
		:view-id
	>
		<!-- Walcer: dependency graph (DAG) of blocking relations. Built on walcer-viz. -->
	</ProjectWrapper>
</template>
