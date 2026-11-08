import { useEffect, useMemo, useRef, useState } from 'react'
import { BackIcon, CheckIcon } from '../ui'

// 내 PC 글꼴: 이 PC에 깔린 글꼴 가운데 하나로 발표 전체의 글자를 바꾼다(회사 글꼴 같은). 크롬과 엣지의 Local Font Access
// (queryLocalFonts)로 이름 목록만 읽는다. 처음 누를 때 브라우저가 글꼴을 읽어도 되는지 묻는다. 글꼴 파일은 읽지도 넣지도 않고
// 이름만 테마에 적는다(theme.localFont). 바깥으로 아무것도 보내지 않는다

interface FontData {
  family: string
}

type QueryLocalFonts = () => Promise<FontData[]>

/** 이 브라우저가 이 PC의 글꼴 목록을 읽을 수 있는지 (크롬, 엣지 103부터) */
export const canListFonts = () => typeof (window as Window & { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts === 'function'

/** 한글 글꼴일 것 같은 이름. 한글을 쓰는 발표라 목록 위에 먼저 둔다(글꼴 파일을 열어 보지 않고 이름으로만 어림한다) */
const KOREAN = /[가-힣]|\b(KR|Korean|CJK|Gothic|Myeongjo|Myungjo|Malgun|Nanum|Batang|Gulim|Dotum|Gungsuh|Apple ?SD|Pretendard|Spoqa|SUIT|Source Han|KoPub|Binggrae|Gmarket|S-Core|LINE ?Seed|Wanted)/i

/** 고르는 줄에 보일 예시 글: 한글, 숫자, 영문이 그 글꼴로 어떻게 보이는지 */
const SAMPLE = '보고 요약 2026년 매출 18% 늘어요 Aa'

/** 그 글꼴에 없는 글자를 그릴 글꼴 (앱 글꼴) */
const FALLBACK = "'Pretendard Variable', Pretendard, sans-serif"
/** 그 글꼴로 쓴 글 (이름에 섞인 따옴표는 빼고) */
export const familyCss = (f: string) => `"${f.replace(/["\\]/g, '')}", ${FALLBACK}`

/** 한 번에 그리는 줄 수. 글꼴이 수백 개인 PC에서도 목록이 굼뜨지 않게 찾기로 좁힌다 */
const SHOWN = 60

/** 이 PC 글꼴 이름들 (가족 이름 하나씩, 한글 글꼴을 앞에) */
async function listFamilies(): Promise<string[]> {
  const query = (window as Window & { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts
  if (!query) return []
  const fonts = await query()
  const families = [...new Set(fonts.map((f) => f.family.trim()).filter(Boolean))]
  return families.sort((a, b) => Number(KOREAN.test(b)) - Number(KOREAN.test(a)) || a.localeCompare(b, 'ko'))
}

/**
 * 테마 메뉴 안에서 여는 글꼴 고르기: 찾기 칸과 글꼴마다 그 글꼴로 쓴 이름과 예시 글. 고르면 바로 슬라이드에 들고 메뉴로 돌아간다
 */
export function LocalFontPicker({ current, onPick, onBack }: { current: string | null; onPick(family: string): void; onBack(): void }) {
  const [families, setFamilies] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let live = true
    // 이 함수는 단추를 누른 그 손길 안에서 불려야 브라우저가 허락을 묻는다(열자마자 부른다)
    listFamilies()
      .then((list) => live && setFamilies(list))
      .catch(() => live && setFailed(true))
    inputRef.current?.focus()
    return () => {
      live = false
    }
  }, [])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (families ?? []).filter((f) => !q || f.toLowerCase().includes(q)).slice(0, SHOWN)
  }, [families, query])
  return (
    <div className="lf" role="group" aria-label="내 PC 글꼴 고르기">
      <div className="lf-top">
        <button type="button" className="icon-btn" aria-label="테마로 돌아가기" title="테마로 돌아가기" onClick={onBack}>
          <BackIcon />
        </button>
        <p className="lf-h">내 PC 글꼴</p>
      </div>
      <input
        ref={inputRef}
        className="input lf-find"
        type="search"
        placeholder="글꼴 이름으로 찾기"
        aria-label="글꼴 이름으로 찾기"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        // 첫 번째 글꼴을 Enter로 바로 고른다
        onKeyDown={(e) => {
          if (e.key === 'Enter' && shown[0]) onPick(shown[0])
        }}
      />
      {failed ? (
        <p className="lf-note">
          이 PC의 글꼴 목록을 읽지 못했어요. 브라우저가 글꼴을 읽어도 되는지 물으면 ‘허용’을 눌러 주세요. 이미 막았으면 사이트 설정의 ‘글꼴’을 허용한 뒤 다시 열어 주세요.
        </p>
      ) : !families ? (
        <p className="lf-note">글꼴 목록을 읽는 중이에요</p>
      ) : !shown.length ? (
        <p className="lf-note">‘{query.trim()}’이 들어간 글꼴이 없어요</p>
      ) : (
        <ul className="lf-list">
          {shown.map((f) => (
            <li key={f}>
              <button type="button" className={`lf-row${f === current ? ' is-on' : ''}`} aria-pressed={f === current} onClick={() => onPick(f)}>
                {/* 이름과 예시 글 모두 그 글꼴로. 글꼴에 없는 글자(한글이 없는 영문 글꼴)는 기본 글꼴로 보인다 */}
                <span className="lf-name" style={{ fontFamily: familyCss(f) }}>
                  {f}
                </span>
                <span className="lf-sample" style={{ fontFamily: familyCss(f) }}>
                  {SAMPLE}
                </span>
                {f === current && <CheckIcon />}
              </button>
            </li>
          ))}
          {families.length > shown.length && !query && <li className="lf-more">글꼴이 {families.length}개 있어요. 이름으로 찾으면 더 보여요.</li>}
        </ul>
      )}
    </div>
  )
}
