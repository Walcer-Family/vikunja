// Walcer: display settings for the dependency graph, remembered per browser
// (same approach as the table view's column choices).
import {useStorage} from '@vueuse/core'

export type DagColorBy = 'status' | 'project' | 'person' | 'label'

export interface DagSettings {
	colorBy: DagColorBy
	showSubtasks: boolean
	showUnlinked: boolean
}

export function useDagSettings() {
	return useStorage<DagSettings>('walcerDagSettings', {
		colorBy: 'status',
		showSubtasks: false,
		showUnlinked: false,
	}, undefined, {mergeDefaults: true})
}
