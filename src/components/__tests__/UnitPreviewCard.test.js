// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UnitPreviewCard from '../UnitPreviewCard.vue'

function makePreview(overrides = {}) {
  return {
    id: 'p1a',
    unit: { id: 'p1a', type: 'infantry' },
    title: 'p1a - Infantry',
    progress: { normalizedMovement: 4, normalizedActions: 2, segmentCount: 4, filledCount: 2 },
    progressLabel: 'Actions 2/4',
    healthLabel: '80/100',
    healthPercent: 80,
    bodyIcon: 'body.svg',
    arrowIcon: 'arrow.svg',
    arrowTransform: 'rotate(210deg)',
    playerClass: 'is-player1',
    isSelected: false,
    isAlive: true,
    ...overrides
  }
}

function mountCard(preview = makePreview(), hexPoints = '0,0 1,1') {
  return mount(UnitPreviewCard, { props: { preview, hexPoints } })
}

describe('UnitPreviewCard', () => {
  it('renders the unit hex, HP and progress dots from the preview', () => {
    const wrapper = mountCard()

    const card = wrapper.find('.engine-unit-card')
    expect(card.exists()).toBe(true)
    expect(card.attributes('title')).toBe('p1a - Infantry')
    expect(card.attributes('aria-label')).toBe('p1a - Infantry')

    expect(wrapper.find('.engine-unit-card__hex').classes()).toContain('is-player1')
    expect(wrapper.find('.engine-unit-card__hex-polygon').attributes('points')).toBe('0,0 1,1')
    expect(wrapper.find('.engine-unit-card__body').attributes('src')).toBe('body.svg')
    expect(wrapper.find('.engine-unit-card__arrow').attributes('style')).toContain('rotate(210deg)')

    expect(wrapper.find('.engine-unit-card__hp').text()).toBe('80/100')
    expect(wrapper.find('.engine-unit-card__hp').attributes('style')).toContain('--unit-hp-fill: 80%')

    const progress = wrapper.find('.engine-unit-card__progress')
    expect(progress.attributes('aria-label')).toBe('Actions 2/4')
    const dots = progress.findAll('.engine-unit-card__dot')
    expect(dots).toHaveLength(4)
    expect(dots.filter(dot => dot.classes().includes('is-filled'))).toHaveLength(2)
  })

  it('reflects selected / depleted / dead state classes and disabled', () => {
    const selected = mountCard(makePreview({ isSelected: true }))
    expect(selected.find('.engine-unit-card').classes()).toContain('is-selected')

    const depleted = mountCard(makePreview({
      progress: { normalizedMovement: 4, normalizedActions: 0, segmentCount: 4, filledCount: 0 }
    }))
    expect(depleted.find('.engine-unit-card').classes()).toContain('is-depleted')

    const dead = mountCard(makePreview({ isAlive: false }))
    const deadCard = dead.find('.engine-unit-card')
    expect(deadCard.classes()).toContain('is-dead')
    expect(deadCard.element.disabled).toBe(true)
  })

  it('omits the body and arrow images when the preview has no icons', () => {
    const wrapper = mountCard(makePreview({ bodyIcon: null, arrowIcon: null }))
    expect(wrapper.find('.engine-unit-card__body').exists()).toBe(false)
    expect(wrapper.find('.engine-unit-card__arrow').exists()).toBe(false)
  })

  it('emits hover with the unit id on enter/focus and null on leave/blur', async () => {
    const wrapper = mountCard()
    const card = wrapper.find('.engine-unit-card')

    await card.trigger('mouseenter')
    await card.trigger('mouseleave')
    await card.trigger('focus')
    await card.trigger('blur')

    expect(wrapper.emitted('hover')).toEqual([['p1a'], [null], ['p1a'], [null]])
  })

  it('emits select with the unit id, unit and native event on click', async () => {
    const wrapper = mountCard()
    await wrapper.find('.engine-unit-card').trigger('click')

    const events = wrapper.emitted('select')
    expect(events).toHaveLength(1)
    const payload = events[0][0]
    expect(payload.unitId).toBe('p1a')
    expect(payload.unit).toEqual({ id: 'p1a', type: 'infantry' })
    // The native event is forwarded so callers can blur the button via
    // event.currentTarget DURING dispatch (GameEngineBlock behavior). The DOM
    // nulls currentTarget/target once dispatch finishes, so this only asserts
    // that a real Event instance is handed over; the blur side-effect itself is
    // covered by the GameEngineBlock turn-controls suite.
    expect(payload.event).toBeInstanceOf(Event)
  })

  it('emits deselect with the native event on right click', async () => {
    const wrapper = mountCard()
    await wrapper.find('.engine-unit-card').trigger('contextmenu')

    const events = wrapper.emitted('deselect')
    expect(events).toHaveLength(1)
    expect(events[0][0].event).toBeInstanceOf(Event)
  })
})
