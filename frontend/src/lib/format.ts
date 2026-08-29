export function formatKES(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE')}`
}

export function formatViews(count: number): string {
  if (count >= 1000) {
    const value = count / 1000
    return `${count % 1000 === 0 ? value.toFixed(0) : value.toFixed(1)}K`
  }
  return String(count)
}
