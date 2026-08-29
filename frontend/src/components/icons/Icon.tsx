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
