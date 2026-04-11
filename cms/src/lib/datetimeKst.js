/** 한국 표준시(Asia/Seoul) 기준 표시·캠페인 datetime-local 해석 */

const TZ = 'Asia/Seoul'

/**
 * API ISO 문자열(UTC 또는 KST) → 화면용 날짜·시간
 */
export function formatKstDateTime(isoOrDate) {
  if (isoOrDate == null || isoOrDate === '') return ''
  const d =
    typeof isoOrDate === 'string' || typeof isoOrDate === 'number'
      ? new Date(isoOrDate)
      : isoOrDate
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ko-KR', { timeZone: TZ })
}

export function formatKstDate(isoOrDate) {
  if (isoOrDate == null || isoOrDate === '') return ''
  const d =
    typeof isoOrDate === 'string' || typeof isoOrDate === 'number'
      ? new Date(isoOrDate)
      : isoOrDate
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ko-KR', { timeZone: TZ })
}

/**
 * API에서 받은 시각 → datetime-local 값 (항상 KST 벽시계로 편집)
 */
export function utcIsoToDatetimeLocalKst(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
  const y = get('year')
  const m = get('month')
  const day = get('day')
  const h = get('hour')
  const min = get('minute')
  if (!y || !m || !day) return ''
  return `${y}-${m}-${day}T${h}:${min}`
}

/**
 * datetime-local 입력값을 KST 벽시계로 보고 UTC ISO 문자열로 전송
 */
export function datetimeLocalKstToUtcIso(localStr) {
  if (!localStr || !localStr.includes('T')) return ''
  const [date, time] = localStr.split('T')
  const [hh, mm] = (time || '').split(':')
  if (!date || hh === undefined || mm === undefined) return ''
  return new Date(`${date}T${hh}:${mm}:00+09:00`).toISOString()
}
