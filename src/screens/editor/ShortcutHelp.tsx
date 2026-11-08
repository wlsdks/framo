import { Fragment } from 'react'
import { keys } from '../../lib/keys'
import { Modal } from '../ui'
import { SHORTCUT_LIST } from './shortcuts'

/**
 * 단축키 보기: 위 막대의 키보드 단추나 ?(Ctrl+/)로 연다. 단축키는 말풍선에도 적혀 있지만, 처음 쓰는 분은 어떤 키가 있는지
 * 한눈에 볼 곳이 없었다. 목록은 단축키를 받는 곳과 같은 것(SHORTCUT_LIST)이라 둘이 따로 놀지 않는다
 */
export function ShortcutHelp({ onClose }: { onClose(): void }) {
  return (
    <Modal
      title="단축키"
      className="modal-keys"
      focusSelf
      onClose={onClose}
      actions={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          닫기
        </button>
      }
    >
      <div className="keys-groups">
        {SHORTCUT_LIST.map((g) => (
          <section key={g.group} className="keys-group">
            <h3 className="keys-h">{g.group}</h3>
            <dl className="keys-list">
              {g.rows.map((r) => (
                <div key={r.what + r.keys.join()} className="keys-row">
                  <dt>
                    {r.keys.map((k, i) => (
                      <Fragment key={k}>
                        {i > 0 && <span className="keys-or"> </span>}
                        <kbd>{keys(k)}</kbd>
                      </Fragment>
                    ))}
                  </dt>
                  <dd>{r.what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
