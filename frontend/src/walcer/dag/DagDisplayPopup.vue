<!-- Walcer: "Display" button for the dependency graph, modeled on the table view's "Columns" popup. -->
<template>
	<Popup
		placement="bottom-start"
		:anchor="triggerEl"
	>
		<template #trigger="{toggle}">
			<XButton
				ref="trigger"
				icon="eye"
				variant="secondary"
				class="mie-2"
				@click.prevent.stop="toggle()"
			>
				{{ $t('walcer.dependencies.display') }}
			</XButton>
		</template>
		<template #content="{isOpen}">
			<Card
				class="dag-display"
				:class="{'is-open': isOpen}"
			>
				<label
					class="label"
					for="dagColorBy"
				>{{ $t('walcer.dependencies.colorBy') }}</label>
				<FormSelect
					id="dagColorBy"
					v-model="settings.colorBy"
					class="mbe-3"
					:options="colorOptions"
				/>
				<FancyCheckbox v-model="settings.showSubtasks">
					{{ $t('walcer.dependencies.showSubtasks') }}
				</FancyCheckbox>
				<FancyCheckbox v-model="settings.showUnlinked">
					{{ $t('walcer.dependencies.showUnlinked') }}
				</FancyCheckbox>
			</Card>
		</template>
	</Popup>
</template>

<script setup lang="ts">
import {computed, ref, type ComponentPublicInstance} from 'vue'
import {useI18n} from 'vue-i18n'

import Popup from '@/components/misc/Popup.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import FormSelect from '@/components/input/FormSelect.vue'
import {useDagSettings} from './useDagSettings'

const {t} = useI18n({useScope: 'global'})
const settings = useDagSettings()

const trigger = ref<ComponentPublicInstance | null>(null)
const triggerEl = computed<HTMLElement | null>(() => (trigger.value?.$el as HTMLElement) ?? null)

const colorOptions = computed(() => (['status', 'project', 'person', 'label'] as const).map(value => ({
	value,
	label: t(`walcer.dependencies.colorByOptions.${value}`),
})))
</script>

<style lang="scss" scoped>
.dag-display {
	padding: .5rem;
	inline-size: 16rem;
}
</style>
