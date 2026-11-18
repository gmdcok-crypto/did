import { useEffect, useMemo, useRef, useState } from 'react'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function pad2(n) {
  return String(n).padStart(2, '0')
}

function parseValue(value) {
  if (!value || !value.includes('T')) {
    return { date: '', time: '00:00' }
  }
  const [date, timeRaw] = value.split('T')
  const time = (timeRaw || '00:00').slice(0, 5)
  return { date: date || '', time: time || '00:00' }
}

function formatDisplay(value) {
  const { date, time } = parseValue(value)
  if (!date) return ''
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return value
  return `${y}-${m}-${d} ${time}`
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function buildMonthCells(year, monthIndex) {
  const firstDow = new Date(year, monthIndex, 1).getDay()
  const total = daysInMonth(year, monthIndex)
  const cells = []
  for (let i = 0; i < firstDow; i += 1) cells.push(null)
  for (let day = 1; day <= total; day += 1) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/**
 * datetime-local 대체: 날짜 클릭 선택 → 더블클릭 또는 확인으로 확정
 * value/onChange 형식: YYYY-MM-DDTHH:mm (기존 KST 헬퍼와 동일)
 */
export default function DatetimeConfirmPicker({
  value = '',
  onChange,
  className = '',
  inputClassName = '',
  disabled = false,
}) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const parsed = parseValue(value)
  const initial = useMemo(() => {
    if (parsed.date) {
      const [y, m] = parsed.date.split('-').map(Number)
      return { year: y, monthIndex: m - 1 }
    }
    const now = new Date()
    return { year: now.getFullYear(), monthIndex: now.getMonth() }
  }, [parsed.date])

  const [viewYear, setViewYear] = useState(initial.year)
  const [viewMonth, setViewMonth] = useState(initial.monthIndex)
  const [draftDate, setDraftDate] = useState(parsed.date)
  const [draftTime, setDraftTime] = useState(parsed.time)

  useEffect(() => {
    if (!open) return
    const { date, time } = parseValue(value)
    setDraftDate(date)
    setDraftTime(time || '00:00')
    if (date) {
      const [y, m] = date.split('-').map(Number)
      setViewYear(y)
      setViewMonth(m - 1)
    } else {
      const now = new Date()
      setViewYear(now.getFullYear())
      setViewMonth(now.getMonth())
    }
  }, [open, value])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth])

  const commit = (dateStr, timeStr) => {
    if (!dateStr) return
    const next = `${dateStr}T${timeStr || '00:00'}`
    onChange?.(next)
    setOpen(false)
  }

  const selectDay = (day) => {
    if (!day) return
    const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
    setDraftDate(dateStr)
  }

  const confirmDay = (day) => {
    if (!day) return
    const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
    setDraftDate(dateStr)
    commit(dateStr, draftTime)
  }

  const shiftMonth = (delta) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  return (
    <div className={`dt-confirm ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`dt-confirm-trigger ${inputClassName}`.trim()}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? '' : 'dt-confirm-placeholder'}>
          {value ? formatDisplay(value) : '날짜·시간 선택'}
        </span>
        <span className="dt-confirm-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="dt-confirm-panel" role="dialog" aria-label="날짜·시간 선택">
          <div className="dt-confirm-month">
            <button type="button" className="btn btn-sm" onClick={() => shiftMonth(-1)} aria-label="이전 달">
              ‹
            </button>
            <strong>
              {viewYear}년 {viewMonth + 1}월
            </strong>
            <button type="button" className="btn btn-sm" onClick={() => shiftMonth(1)} aria-label="다음 달">
              ›
            </button>
          </div>

          <div className="dt-confirm-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="dt-confirm-grid">
            {cells.map((day, idx) => {
              if (!day) return <span key={`e-${idx}`} className="dt-confirm-day empty" />
              const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
              const selected = draftDate === dateStr
              return (
                <button
                  key={dateStr}
                  type="button"
                  className={`dt-confirm-day${selected ? ' selected' : ''}`}
                  onClick={() => selectDay(day)}
                  onDoubleClick={() => confirmDay(day)}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="dt-confirm-time-row">
            <label htmlFor="dt-confirm-time">시간</label>
            <input
              id="dt-confirm-time"
              type="time"
              value={draftTime}
              onChange={(e) => setDraftTime(e.target.value || '00:00')}
            />
          </div>

          <p className="dt-confirm-hint">날짜 한 번 선택 후 확인, 또는 날짜 더블클릭으로 바로 확정</p>

          <div className="dt-confirm-actions">
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!draftDate}
              onClick={() => commit(draftDate, draftTime)}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
