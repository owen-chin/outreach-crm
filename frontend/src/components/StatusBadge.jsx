export const STATUS_LABELS = {
  not_contacted: 'Not Contacted',
  contacted: 'Contacted',
  responded: 'Responded',
  negotiating: 'Negotiating',
  confirmed: 'Confirmed',
  declined: 'Declined',
}

export const STATUS_DOT_COLORS = {
  not_contacted: '#9ca3af',
  contacted: '#2563eb',
  responded: '#d97706',
  negotiating: '#ea580c',
  confirmed: '#059669',
  declined: '#dc2626',
}

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status] ?? status}</span>
}
