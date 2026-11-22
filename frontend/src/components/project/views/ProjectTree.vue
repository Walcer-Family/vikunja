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
		class="project-tree"
		:is-loading-project="isLoadingProject"
		:project-id="projectId"
		:view-id
	>
		<!-- Walcer: indented dependency tree. Built on walcer-tree. -->
	</ProjectWrapper>
</template>
