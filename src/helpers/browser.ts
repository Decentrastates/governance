export function scrollToAnchor(anchor: string, pixelsOverAnchor = 0) {
  if (typeof window === 'undefined') return
  const element = document.getElementById(anchor)
  if (element) {
    const bounding = element.getBoundingClientRect()
    const position = bounding.top + window.scrollY - pixelsOverAnchor
    window.scrollTo({
      top: position,
      behavior: 'smooth',
    })
  }
}

export function toGovernancePathname(pathname: string) {
  return pathname.replace('/governance', '')
}
