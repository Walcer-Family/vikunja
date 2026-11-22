// Walcer: display settings for the dependency graph, remembered per browser
// (same approach as the table view's column choices).
import {useStorage} from '@vueuse/core'

export type DagColorBy = 'status' | 'project' | 'person' | 'label'

export interface DagSettings {
	colorBy: DagColorBy
	showSubtasks: boolean
	showUnlinked: boolean
	/** legend entries clicked off: status (s:ready…), group keys (p12, u3, l7) or 'overdue' */
	hidden: string[]
}

export function useDagSettings() {
	return useStorage<DagSettings>('walcerDagSettings', {
		colorBy: 'status',
		showSubtasks: false,
		showUnlinked: false,
		hidden: [],
	}, undefined, {mergeDefaults: true})
}
