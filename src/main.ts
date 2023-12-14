import { createApp, defineComponent, h } from 'vue'
import './style.css'
import { App } from './app'

import { darkTheme } from 'naive-ui'
import { NConfigProvider, NMessageProvider } from 'naive-ui'

const meta = document.createElement('meta')
meta.name = 'naive-ui-style'
document.head.appendChild(meta)

const slots = { default: () => h(App) }

createApp(defineComponent({
  setup() {
    return () => h(NConfigProvider, {
      theme: darkTheme
    }, h(NMessageProvider, {}, slots))
  }
})).mount('#app')
