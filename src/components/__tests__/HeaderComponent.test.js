// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { LOCALE_STORAGE_KEY } from '../../i18n'
import HeaderComponent from '../HeaderComponent.vue'

const routerLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

function mountHeader(i18nMock = { locale: 'en_US' }, props = {}) {
  return mount(HeaderComponent, {
    props,
    global: {
      mocks: {
        $route: { path: '/' },
        $i18n: i18nMock
      },
      stubs: {
        RouterLink: routerLinkStub
      }
    }
  })
}

afterEach(() => {
  window.localStorage.removeItem(LOCALE_STORAGE_KEY)
})

describe('HeaderComponent locale switcher', () => {
  it('renders all supported locale options and updates a string locale', async () => {
    const i18nMock = { locale: 'en_US' }
    const wrapper = mountHeader(i18nMock)

    const options = wrapper.findAll('.app-menubar__language-option')
    expect(options).toHaveLength(2)
    expect(options.map(option => option.text())).toEqual(['EN', 'UA'])
    expect(options.map(option => option.attributes('aria-pressed'))).toEqual(['true', 'false'])

    await options[1].trigger('click')

    expect(i18nMock.locale).toBe('uk_UA')
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('uk_UA')
  })

  it('updates a ref-like locale object without replacing it', async () => {
    const locale = { value: 'en_US' }
    const wrapper = mountHeader({ locale })

    await wrapper.findAll('.app-menubar__language-option')[1].trigger('click')

    expect(locale.value).toBe('uk_UA')
  })

  it('ignores unsupported locale values', () => {
    const i18nMock = { locale: 'en_US' }
    const wrapper = mountHeader(i18nMock)

    wrapper.vm.setLocale('missing')

    expect(i18nMock.locale).toBe('en_US')
  })
})

describe('HeaderComponent mobile menu', () => {
  it('toggles the compact menu and closes after link selection', async () => {
    const wrapper = mountHeader()
    const button = wrapper.find('.app-menubar__menu-button')

    expect(wrapper.classes()).not.toContain('app-menubar--menu-open')
    expect(button.attributes('aria-expanded')).toBe('false')

    await button.trigger('click')

    expect(wrapper.classes()).toContain('app-menubar--menu-open')
    expect(button.attributes('aria-expanded')).toBe('true')

    await wrapper.find('.app-menubar__link').trigger('click')

    expect(wrapper.classes()).not.toContain('app-menubar--menu-open')
    expect(button.attributes('aria-expanded')).toBe('false')
  })
})
