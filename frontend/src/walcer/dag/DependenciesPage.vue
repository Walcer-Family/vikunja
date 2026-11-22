<!-- Walcer: global Dependencies page (route /dependencies). -->
<script setup lang="ts">
import {useTitle} from '@/composables/useTitle'
import DependencyGraph from './DependencyGraph.vue'

useTitle('Dependencies')
</script>

<template>
	<DependencyGraph />
</template>
