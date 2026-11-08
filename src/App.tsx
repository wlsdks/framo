import { lazy, Suspense } from 'react'
import { presentKey } from './lib/presentKeys'
import { useRoute } from './lib/router'
import { Editor } from './screens/editor/Editor'
import { Home } from './screens/Home'
import { Presenter } from './screens/Presenter'
import { System } from './screens/System'
import { installTooltips } from './screens/tooltip'
import { Wizard } from './screens/Wizard'

// 단추의 title을 바로 보이는 말풍선으로 (화면마다 따로 달지 않게 한 번만)
installTooltips()

// Ctrl+S(맥은 ⌘S)는 어느 화면에서든 브라우저의 '다른 이름으로 저장'을 띄우지 않는다. 홈이나 프레임 잡기에서 습관처럼 누르면
// 그 창이 떠서 Framo 화면을 열리지도 않는 HTML로 저장하게 했다. 발표는 고칠 때마다 저장되고, 편집기에서는 바로 저장한다(shortcuts.ts)
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && presentKey(e).toLowerCase() === 's') e.preventDefault()
})

// 개발용 갤러리와 그 점검 도구(combos, checkEdit, checkFrame, measureBlocks)는 개발 서버에서만 불러온다.
// 빌드하면 import.meta.env.DEV가 false가 되어 import() 자체가 빠지므로 배포본에 들어가지 않는다.
// 쓰는 화면(프레임 잡기, 장 모음, 발표자 화면)은 나눠 불러오지 않는다: 새 버전으로 바꾼 뒤 열려 있던 창에서 넘어가면
// 예전 이름의 조각 파일을 찾지 못해 빈 화면이 되는데, 아끼는 크기는 편집기와 같이 쓰는 코드를 빼면 얼마 되지 않는다
const Gallery = import.meta.env.DEV ? lazy(() => import('./screens/Gallery').then((m) => ({ default: m.Gallery }))) : null

export function App() {
  const route = useRoute()
  if (route.name === 'new') return <Wizard />
  if (route.name === 'edit') return <Editor key={route.id} id={route.id} />
  if (route.name === 'presenter') return <Presenter key={route.id} id={route.id} />
  if (route.name === 'system') return <System />
  if (route.name === 'gallery' && Gallery) {
    return (
      <Suspense fallback={null}>
        <Gallery key={location.hash} />
      </Suspense>
    )
  }
  return <Home />
}
