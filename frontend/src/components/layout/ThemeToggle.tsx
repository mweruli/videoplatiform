import Icon from '../icons/Icon'
import { useTheme } from '../../lib/theme'

interface ThemeToggleProps {
  /** 'onDark' = translucent glass over a photographic/gradient background
   * (mobile hero). 'solid' = sits on flat chrome (desktop top nav). */
  variant?: 'onDark' | 'solid'
  className?: string
}

export default function ThemeToggle({ variant = 'solid', className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  const variantClasses =
    variant === 'onDark'
      ? 'border border-white/15 bg-white/10 text-ice backdrop-blur-md hover:bg-white/20'
      : 'border border-glass-border bg-glass text-foreground backdrop-blur-md hover:bg-border/60'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`flex h-9 w-9 flex-none items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-brand active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100 ${variantClasses} ${className}`}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={17} />
    </button>
  )
}
