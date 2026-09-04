/**
 * Small shared icon set (line icons, 24x24 viewBox), ported 1:1 from the
 * approved prototype's ICONS map so the app matches its visual vocabulary
 * exactly. Add new names here rather than pulling in an icon library — the
 * set is deliberately small and consistent.
 */
export type IconName =
  | 'search'
  | 'play'
  | 'pause'
  | 'sun'
  | 'moon'
  | 'pin'
  | 'plus'
  | 'chevronRight'
  | 'check'
  | 'clock'
  | 'home'
  | 'compare'
  | 'user'
  | 'filter'
  | 'heart'
  | 'menu'
  | 'close'
  | 'back'
  | 'phone'
  | 'share'
  | 'comment'
  | 'bookmark'
  | 'grid'
  | 'building'
  | 'box'
  | 'chart'
  | 'truck'
  | 'logout'
  | 'video'
  | 'upload'
  | 'volumeOn'
  | 'volumeOff'
  | 'tag'
  | 'edit'
  | 'lock'
  | 'externalLink'
  | 'sparkle'
  | 'megaphone'
  | 'alertTriangle'
  | 'cash'

const PATHS: Record<IconName, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
  pin: '<path d="M12 21s7-6.5 7-11a7 7 0 10-14 0c0 4.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  compare: '<path d="M8 3v18M16 3v18"/><path d="M4 8h8M4 16h8M12 8h8M12 16h8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  filter: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>',
  heart: '<path d="M12 20.6l-1.16-1.06C6.24 15.4 3 12.44 3 8.9 3 6.09 5.2 4 8 4c1.6 0 3.15.75 4 1.94A4.98 4.98 0 0116 4c2.8 0 5 2.09 5 4.9 0 3.54-3.24 6.5-7.84 10.64L12 20.6z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/>',
  comment:
    '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
  bookmark: '<path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  truck: '<rect x="1" y="7" width="13" height="9" rx="1"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="5.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  video: '<rect x="2.5" y="6" width="14" height="12" rx="2"/><path d="M21.5 9.2l-5 2.8 5 2.8z" fill="currentColor" stroke="none"/>',
  upload: '<path d="M12 16V4M12 4l-5 5M12 4l5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
  volumeOn:
    '<path d="M4 9v6h3.5l4.5 4V5l-4.5 4H4z" fill="currentColor" stroke="none"/><path d="M15.5 9a4 4 0 010 6"/><path d="M18 6.5a8 8 0 010 11"/>',
  volumeOff:
    '<path d="M4 9v6h3.5l4.5 4V5l-4.5 4H4z" fill="currentColor" stroke="none"/><line x1="15" y1="9" x2="20" y2="14"/><line x1="20" y1="9" x2="15" y2="14"/>',
  tag: '<path d="M20.6 13.4L13 21a2 2 0 01-2.8 0l-8-8A2 2 0 012 11.6V4a2 2 0 012-2h7.6a2 2 0 011.4.6l8 8a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  externalLink:
    '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
  sparkle:
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" fill="currentColor" stroke="none"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" fill="currentColor" stroke="none"/>',
  megaphone:
    '<path d="M3 11v2a2 2 0 002 2h1l2.5 5.5 1.8-.7L8.7 15H10l8 4V5l-8 4H5a2 2 0 00-2 2z"/><path d="M18 9.5a4 4 0 010 5"/>',
  alertTriangle: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4"/><circle cx="12" cy="17.3" r="0.4" fill="currentColor" stroke="none"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>',
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

export default function Icon({ name, size = 20, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  )
}
