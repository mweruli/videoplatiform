import { Link } from 'react-router-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import Icon from '../icons/Icon'

export type PillVariant = 'amber' | 'outline' | 'ghost'
export type PillSize = 'md' | 'sm'

const base =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-bold transition-[transform,box-shadow,background-color,color] duration-150 ease-brand active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50'

const sizeClasses: Record<PillSize, string> = {
  md: 'px-[18px] py-2.5 text-sm',
  sm: 'px-3.5 py-1.5 text-xs',
}

const variantClasses: Record<PillVariant, string> = {
  amber:
    'bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] text-amber-ink shadow-glow-amber hover:shadow-glow-amber-lg',
  outline: 'border-[1.5px] border-foreground text-foreground hover:bg-foreground hover:text-background',
  ghost: 'bg-panel text-foreground hover:bg-border/70',
}

interface PillContentProps {
  withArrow?: boolean
  children: ReactNode
}

function PillContent({ withArrow, children }: PillContentProps) {
  return (
    <>
      {children}
      {withArrow && (
        <span className="inline-flex transition-transform duration-150 ease-brand group-hover:translate-x-0.5 motion-reduce:transition-none">
          <Icon name="chevronRight" size={12} />
        </span>
      )}
    </>
  )
}

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant
  size?: PillSize
  withArrow?: boolean
}

export function Pill({ variant = 'ghost', size = 'md', withArrow, className = '', children, ...rest }: PillButtonProps) {
  return (
    <button
      type="button"
      className={`group ${base} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      <PillContent withArrow={withArrow}>{children}</PillContent>
    </button>
  )
}

interface PillLinkProps {
  to: string
  variant?: PillVariant
  size?: PillSize
  withArrow?: boolean
  className?: string
  children: ReactNode
}

export function PillLink({ to, variant = 'ghost', size = 'md', withArrow, className = '', children }: PillLinkProps) {
  return (
    <Link to={to} className={`group ${base} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>
      <PillContent withArrow={withArrow}>{children}</PillContent>
    </Link>
  )
}
