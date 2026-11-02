import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import '@fontsource-variable/hahmlet'
import '@fontsource-variable/noto-serif-kr'
import './fonts/suit.css'
import './slides/slides.css'
import './slides/blocks.css'
import './motion/motion.css'
import './slides/edit.css'
import './app.css'
import { App } from './App'
import { watchFileDrop } from './lib/dropGuard'
import { watchScrollbar } from './lib/scrollbar'

watchScrollbar()
watchFileDrop()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
