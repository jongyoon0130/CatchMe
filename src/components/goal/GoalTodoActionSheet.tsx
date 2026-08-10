import { createPortal } from 'react-dom'

interface Props {
  label: string
  tier: 'daily' | 'weekly' | 'monthly'
  onEdit: () => void
  onDelete: () => void
  onChangeDate?: () => void
  onSetTime?: () => void
  onClose: () => void
}

export function GoalTodoActionSheet({
  label,
  tier,
  onEdit,
  onDelete,
  onChangeDate,
  onSetTime,
  onClose,
}: Props) {
  const sheet = (
    <div className="goal-app goal-time-backdrop" onClick={onClose} role="presentation">
      <div
        className="goal-todo-action-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="할 일 메뉴"
      >
        <h2 className="goal-todo-action-title">{label}</h2>

        <div className="goal-todo-action-quick">
          <button type="button" className="goal-todo-action-quick-btn" onClick={onEdit}>
            <span className="goal-todo-action-icon edit" aria-hidden>
              ✎
            </span>
            수정하기
          </button>
          <button type="button" className="goal-todo-action-quick-btn danger" onClick={onDelete}>
            <span className="goal-todo-action-icon delete" aria-hidden>
              ×
            </span>
            삭제하기
          </button>
        </div>

        <ul className="goal-todo-action-list">
          {tier === 'daily' && onSetTime ? (
            <li>
              <button type="button" className="goal-todo-action-item" onClick={onSetTime}>
                <span className="goal-todo-action-dot time" aria-hidden />
                시간 설정
              </button>
            </li>
          ) : null}
          {tier === 'daily' && onChangeDate ? (
            <li>
              <button type="button" className="goal-todo-action-item" onClick={onChangeDate}>
                <span className="goal-todo-action-dot date" aria-hidden />
                날짜 바꾸기
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  )

  return createPortal(sheet, document.body)
}
