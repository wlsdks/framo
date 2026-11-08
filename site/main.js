// 홍보 페이지의 작은 동작 둘. 스크립트가 없어도 내용은 다 보인다(팝업 단추만 듣지 않는다).

// 다운로드: 보고 있는 컴퓨터의 단추를 먼저 보인다. 맨 위에서는 그 단추를 앞에 짙게, 설치 방법 팝업에서는 그 쪽에
// '지금 쓰는 컴퓨터'를 붙인다. 알 수 없으면(휴대폰, 태블릿, 다른 운영체제) HTML 그대로 둔다
;(() => {
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  // 아이패드는 platform이 MacIntel이라 손가락 터치로 가른다
  const mine = /^mac/i.test(platform) && navigator.maxTouchPoints < 2 ? 'mac' : /^win/i.test(platform) ? 'win' : null
  if (!mine) return

  const cta = document.querySelector('.cta')
  const first = cta?.querySelector(`a[data-os="${mine}"]`)
  if (cta && first) {
    cta.prepend(first)
    for (const a of cta.querySelectorAll('a[data-os]')) {
      a.classList.toggle('btn-dark', a === first)
      a.classList.toggle('btn-line', a !== first)
    }
  }
  const row = document.querySelector('.dl-row')
  const mineDl = row?.querySelector(`a[data-os="${mine}"]`)
  if (row && mineDl) row.prepend(mineDl)

  for (const col of document.querySelectorAll('.pop-cols [data-os]')) {
    const label = col.querySelector('.os-mine')
    if (label) label.hidden = col.dataset.os !== mine
  }
})()

// 팝업(설치 방법, 보안 자세히): data-open="id"인 단추가 그 <dialog>를 연다. 닫기 단추, Esc, 바깥 누르기로 닫힌다
;(() => {
  for (const btn of document.querySelectorAll('[data-open]')) {
    btn.addEventListener('click', () => document.getElementById(btn.dataset.open)?.showModal())
  }
  for (const dlg of document.querySelectorAll('dialog.pop')) {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close()
    })
  }
})()
