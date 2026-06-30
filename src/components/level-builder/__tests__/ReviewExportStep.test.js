// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ReviewExportStep from '../ReviewExportStep.vue'

// Stub out PackageValidationPanel — it has its own tests and we only
// need structural/emit assertions here.
const PackageValidationPanelStub = { name: 'PackageValidationPanel', render: () => null }

const BASE_PROPS = {
  validation: { ok: true, errors: [], warnings: [], package: null },
  displayedErrors: [],
  displayedWarnings: [],
  levelId: 'test_level',
  exportLevelId: 'test_level_2026-06-19_10-00-00',
  lastActionStage: 'idle',
  sectionReadiness: []
}

function mountStep(overrides = {}) {
  return mount(ReviewExportStep, {
    props: { ...BASE_PROPS, ...overrides },
    global: {
      mocks: { $t: key => key },
      stubs: { PackageValidationPanel: PackageValidationPanelStub }
    }
  })
}

describe('ReviewExportStep · three-block structure', () => {
  it('renders three action blocks inside the actions section', () => {
    const wrapper = mountStep()
    const blocks = wrapper.findAll('.review-export-step__block')
    expect(blocks).toHaveLength(3)
  })

  it('each block has a heading element', () => {
    const wrapper = mountStep()
    const headings = wrapper.findAll('.review-export-step__block-heading')
    expect(headings).toHaveLength(3)
  })
})

describe('ReviewExportStep · export-archive emit (block 1)', () => {
  it('emits export-archive when Export level button is clicked', async () => {
    const wrapper = mountStep()
    const btn = wrapper.findAll('button').find(b =>
      b.text().includes('levelBuilder.reviewExport.exportLevel')
    )
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    expect(wrapper.emitted('export-archive')).toHaveLength(1)
  })

  it('Export level button is disabled when canExport is false', () => {
    const wrapper = mountStep({
      validation: { ok: false, errors: [{ message: 'error' }], warnings: [], package: null }
    })
    const btn = wrapper.findAll('button').find(b =>
      b.text().includes('levelBuilder.reviewExport.exportLevel')
    )
    expect(btn.attributes('disabled')).toBeDefined()
  })
})

describe('ReviewExportStep · test-in-playground emit (block 2)', () => {
  it('emits test-in-playground when the manual test button is clicked', async () => {
    const wrapper = mountStep()
    const btn = wrapper.findAll('button').find(b =>
      b.text().includes('levelBuilder.reviewExport.testManually')
    )
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    expect(wrapper.emitted('test-in-playground')).toHaveLength(1)
  })

  it('manual test button is disabled when canExport is false', () => {
    const wrapper = mountStep({
      validation: { ok: false, errors: [{ message: 'error' }], warnings: [], package: null }
    })
    const btn = wrapper.findAll('button').find(b =>
      b.text().includes('levelBuilder.reviewExport.testManually')
    )
    expect(btn.attributes('disabled')).toBeDefined()
  })
})

describe('ReviewExportStep · test-in-automated-playground emit (block 2)', () => {
  it('emits test-in-automated-playground when the automated test button is clicked', async () => {
    const wrapper = mountStep()
    const btn = wrapper.findAll('button').find(b =>
      b.text().includes('levelBuilder.reviewExport.testInAutomatedPlayground')
    )
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    expect(wrapper.emitted('test-in-automated-playground')).toHaveLength(1)
  })

  it('automated test button is disabled when canExport is false', () => {
    const wrapper = mountStep({
      validation: { ok: false, errors: [{ message: 'error' }], warnings: [], package: null }
    })
    const btn = wrapper.findAll('button').find(b =>
      b.text().includes('levelBuilder.reviewExport.testInAutomatedPlayground')
    )
    expect(btn.attributes('disabled')).toBeDefined()
  })
})

describe('ReviewExportStep · automated-playtest slot (block 2)', () => {
  it('renders slot content inside block 2', () => {
    const wrapper = mount(ReviewExportStep, {
      props: BASE_PROPS,
      slots: {
        'automated-playtest': '<div class="slot-content">panel</div>'
      },
      global: {
        mocks: { $t: key => key },
        stubs: { PackageValidationPanel: PackageValidationPanelStub }
      }
    })
    // Scope to block 2 so the test actually proves CONTAINMENT, not just
    // presence somewhere in the tree.
    const blocks = wrapper.findAll('.review-export-step__block')
    expect(blocks[1].find('.slot-content').exists()).toBe(true)
    expect(blocks[1].find('.slot-content').text()).toBe('panel')
  })
})

describe('ReviewExportStep · export emit (block 3)', () => {
  it('emits export when Export split files button is clicked', async () => {
    const wrapper = mountStep()
    const btn = wrapper.findAll('button').find(b =>
      b.text().includes('levelBuilder.reviewExport.exportSplitDebug')
    )
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    expect(wrapper.emitted('export')).toHaveLength(1)
  })
})

describe('ReviewExportStep · import-files emit (block 3)', () => {
  it('Import level button exists in block 3', () => {
    const wrapper = mountStep()
    const btn = wrapper.findAll('button').find(b =>
      b.text().includes('levelBuilder.reviewExport.importLevel')
    )
    expect(btn).toBeTruthy()
  })

  it('emits import-files when a file change event fires on the hidden input', async () => {
    const wrapper = mountStep()
    const fileInput = wrapper.find('input[type="file"]')
    expect(fileInput.exists()).toBe(true)
    // vue-test-utils cannot set event.target for file inputs; dispatch via
    // the raw DOM element to reach the @change handler directly.
    fileInput.element.dispatchEvent(new Event('change'))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('import-files')).toHaveLength(1)
  })
})

describe('ReviewExportStep · blocked hint', () => {
  it('shows the blocked hint when canExport is false', () => {
    const wrapper = mountStep({
      validation: { ok: false, errors: [{ message: 'error' }], warnings: [], package: null }
    })
    expect(wrapper.find('.review-export-step__hint--blocked').exists()).toBe(true)
  })

  it('hides the blocked hint when canExport is true', () => {
    const wrapper = mountStep()
    expect(wrapper.find('.review-export-step__hint--blocked').exists()).toBe(false)
  })
})

describe('ReviewExportStep · update:level-id emit', () => {
  it('emits update:level-id on input change', async () => {
    const wrapper = mountStep()
    const input = wrapper.find('input[type="text"]')
    await input.setValue('new_level_name')
    expect(wrapper.emitted('update:level-id')).toBeTruthy()
    expect(wrapper.emitted('update:level-id')[0][0]).toBe('new_level_name')
  })
})
