<script setup lang="ts">
import ProjectWrapper from '@/components/project/ProjectWrapper.vue'
import DependencyGraph from '@/walcer/dag/DependencyGraph.vue'

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
		<!-- Walcer: dependency graph (DAG); implementation in frontend/src/walcer/dag -->
		<DependencyGraph :fixed-project-id="projectId" />
	</ProjectWrapper>
</template>
