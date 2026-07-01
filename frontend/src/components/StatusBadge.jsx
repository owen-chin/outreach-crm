const labels = {
  not_contacted: 'Not Contacted',
  contacted: 'Contacted',
  responded: 'Responded',
  negotiating: 'Negotiating',
  confirmed: 'Confirmed',
  declined: 'Declined',
}

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{labels[status] ?? status}</span>
}
