import { h, nextTick, watch } from 'vue'
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import { createMermaidRenderer } from 'vitepress-mermaid-renderer'
import './custom.css'

const MIN_FRAME = 320 // the renderer's own default frame height
const MAX_FRAME = 800

// The renderer shows every diagram in a frame of the same height, so a large diagram is
// squeezed until its labels cannot be read, and a small one gets less room than it could use.
// Give each frame the height its diagram needs at the page width, within limits.
// (Diagrams are drawn as they scroll into view, so this watches for new ones.)
function sizeFrames() {
  document.querySelectorAll('.mermaid-container').forEach((frame) => {
    const box = frame.querySelector('svg[id^="mermaid"]')?.viewBox?.baseVal
    if (!box || !box.width) return
    const wanted = Math.round((frame.clientWidth * box.height) / box.width)
    const height = `${Math.min(MAX_FRAME, Math.max(MIN_FRAME, wanted))}px`
    if (frame.style.minHeight !== height) frame.style.minHeight = height
  })
}

let watching = false
function watchFrames() {
  if (watching || typeof document === 'undefined') return
  watching = true
  let queued = false
  new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      sizeFrames()
    })
  }).observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', sizeFrames)
}

export default {
  extends: DefaultTheme,
  Layout: () => {
    const { isDark } = useData()

    // Diagrams are rendered in the browser after the page loads, and again when the
    // reader switches between light and dark mode.
    const initMermaid = () => {
      const mermaidRenderer = createMermaidRenderer({
        theme: isDark.value ? 'dark' : 'forest',
      })
      mermaidRenderer.setToolbar({
        showLanguageLabel: false,
        downloadFormat: 'svg',
        fullscreenMode: 'browser',
      })
    }

    nextTick(() => {
      initMermaid()
      watchFrames()
    })
    watch(() => isDark.value, () => initMermaid())

    return h(DefaultTheme.Layout)
  },
}
