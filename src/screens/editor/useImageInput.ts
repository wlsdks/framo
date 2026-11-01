import { useEffect, useRef, useState } from 'react'
import { autoArranged, boardAreaH, imageBlock, withImage } from '../../deck/blocks'
import { LAYOUTS } from '../../deck/layouts'
import { imageToDataUrl } from '../../lib/imageFile'
import { useDeck } from '../../store/deckStore'
import { dialogOpen, isTyping, type Toast } from '../ui'
import type { BlockEditing } from './BlockEditor'

/** 끌어 온 것이 파일인지 (글이나 컴포넌트 카드가 아니라) */
const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')

/** 이 자리가 장 위인지: 장 둘레 24px까지 (컴포넌트를 끌어다 놓을 때와 같은 너그러움) */
function overFrame(x: number, y: number): boolean {
  const r = document.querySelector<HTMLElement>('.ed-canvas .slide-frame')?.getBoundingClientRect()
  return !!r && x >= r.left - 24 && x <= r.right + 24 && y >= r.top - 24 && y <= r.bottom + 24
}

/**
 * 이미지를 바로 넣는 두 길: 붙여 넣기(Ctrl+V)와 바탕 화면에서 이미지 파일을 끌어다 장 위에 놓기.
 * 회사에서 화면을 캡처해 바로 붙여 넣는 일이 가장 흔한데, 그동안은 이미지 컴포넌트를 먼저 찾아 넣고 그 칸을 눌러 파일을 골라야 했다.
 * 넣을 곳은 차례대로: 고른 이미지 컴포넌트, 비어 있는 이미지 칸(이미지와 설명 장의 이미지, 컴포넌트 장의 빈 이미지 컴포넌트),
 * 그 밖에는 새 이미지 컴포넌트를 컴포넌트를 넣을 때와 같은 길로(알아서 고른 자리, 놓은 자리. 자리가 없으면 넣지 않고 까닭과 '새 장에 넣기').
 * 장 밖에 파일을 놓으면 브라우저가 그 파일을 열어 편집기를 떠나서, 파일 놓기는 늘 막는다.
 * 돌려주는 값: 지금 이미지 파일을 장 위로 끌고 있는지 (놓으면 들어간다는 안내를 띄운다)
 */
export function useImageInput(blocks: BlockEditing, toast: Toast): boolean {
  const [over, setOver] = useState(false)
  const ref = useRef({ blocks, toast })
  ref.current = { blocks, toast }

  useEffect(() => {
    const put = async (file: File, at: { x: number; y: number } | null) => {
      if (!file.type.startsWith('image/')) {
        ref.current.toast.show('이미지 파일(PNG, JPG 같은)만 넣을 수 있어요.')
        return
      }
      let url: string
      try {
        url = await imageToDataUrl(file)
      } catch {
        ref.current.toast.show('이 이미지는 열 수 없어요. PNG나 JPG로 저장해서 다시 넣어 보세요.', undefined, 6000)
        return
      }
      const { blocks } = ref.current
      const st = useDeck.getState()
      const deck = st.deck
      const s = deck?.slides.find((x) => x.id === st.selectedId)
      if (!deck || !s) return
      if (s.layout === 'compose') {
        const all = s.blocks ?? []
        // 놓은 자리가 있으면 그 자리에 새로: 빈 이미지 칸을 채우는 것은 붙여 넣기와 칸 위에 놓기(칸이 스스로 받는다)뿐
        const target = all.find((b) => b.id === blocks.selected && b.type === 'image') ?? (at ? undefined : all.find((b) => b.type === 'image' && !b.fields.image?.trim()))
        if (target) {
          const h = boardAreaH(s, deck)
          st.setBlocks(s.id, withImage(all, target.id, url, h), undefined, autoArranged(all, s.arranged, h))
          blocks.select(target.id)
          return
        }
      } else {
        // 이미지와 설명 장처럼 이미지가 주인공인 칸이 비어 있으면 거기에 (표지의 로고처럼 덧붙이는 칸은 아니다)
        const slot = LAYOUTS[s.layout].fields.find((f) => f.image && !f.optional && !f.key.startsWith('$'))
        if (slot && !s.fields[slot.key]?.trim()) {
          st.setField(s.id, slot.key, url)
          return
        }
      }
      const block = imageBlock(url)
      if (at) blocks.dropBlock(block, at.x, at.y)
      else blocks.insertBlock(block, document.querySelector<HTMLElement>('.ed-canvas .slide-frame'))
    }

    const onPaste = (e: ClipboardEvent) => {
      if (dialogOpen() || !e.clipboardData) return
      const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
      if (!file) return
      // 글 칸에 글을 붙여 넣는 중이면 글로: 엑셀이나 문서에서 복사한 글에는 그 모습을 찍은 이미지도 함께 실려 온다
      if (isTyping(e) && e.clipboardData.getData('text/plain').trim()) return
      e.preventDefault()
      void put(file, null)
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      // 이미지 칸 위에서는 그 칸이 받는다 (칸이 파랗게 바뀐다)
      const here = overFrame(e.clientX, e.clientY) && !(e.target as HTMLElement | null)?.closest?.('.img-ed')
      e.dataTransfer!.dropEffect = overFrame(e.clientX, e.clientY) ? 'copy' : 'none'
      setOver(here)
    }
    const onDragLeave = (e: DragEvent) => {
      // 창 밖으로 나가면 relatedTarget이 없다
      if (hasFiles(e) && !e.relatedTarget) setOver(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setOver(false)
      if (dialogOpen() || !overFrame(e.clientX, e.clientY) || (e.target as HTMLElement | null)?.closest?.('.img-ed')) return
      const file = [...e.dataTransfer!.files].find((f) => f.type.startsWith('image/')) ?? e.dataTransfer!.files[0]
      if (file) void put(file, { x: e.clientX, y: e.clientY })
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return over
}
