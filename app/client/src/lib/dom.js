// Scroll a row into view within a scrollable container, keeping a small padding
// from the edges. (TranscriptionPanel, PlaygroundPage)
export function scrollRowIntoView(containerEl, rowEl, padding = 12) {
  if (!containerEl || !rowEl) return
  const containerRect = containerEl.getBoundingClientRect()
  const rowRect = rowEl.getBoundingClientRect()
  const topLimit = containerRect.top + padding
  const bottomLimit = containerRect.bottom - padding
  if (rowRect.top < topLimit) {
    containerEl.scrollTop = Math.max(0, containerEl.scrollTop - (topLimit - rowRect.top))
  } else if (rowRect.bottom > bottomLimit) {
    containerEl.scrollTop = Math.max(0, containerEl.scrollTop + (rowRect.bottom - bottomLimit))
  }
}

// Trigger a browser download for a URL via a transient <a download>. (ClipsPage)
export function triggerDownload(url) {
  const a = document.createElement('a')
  a.href = url
  a.setAttribute('download', '')
  document.body.appendChild(a)
  a.click()
  a.remove()
}
