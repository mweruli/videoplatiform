import type { SelfRegisterableRole } from '../../lib/api'
import { OTHER_ROLES, ROLE_META } from './roles'

interface RolePickerProps {
  value: SelfRegisterableRole
  onChange: (role: SelfRegisterableRole) => void
}

const cardBase =
  'flex flex-col items-start gap-1 rounded-2xl border-[1.5px] bg-panel px-3 py-3 text-left transition-all duration-150 ease-brand'
const cardInactive = 'border-border hover:border-teal'
const cardActive = 'border-brand bg-brand/10 shadow-[inset_0_0_0_1px_var(--color-brand)] dark:bg-brand/25'

/**
 * Selectable role cards — General User full-width/default, the other four
 * self-registerable roles in a 2x2 grid below. Cards (not a dropdown) to
 * stay consistent with the app's tactile chip/pill language, per the
 * approved design's own judgment call.
 */
export default function RolePicker({ value, onChange }: RolePickerProps) {
  return (
    <div className="mb-3.5">
      <label className="mb-1.5 block text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        I&apos;m signing up as
      </label>
      <button
        type="button"
        onClick={() => onChange('general_user')}
        aria-pressed={value === 'general_user'}
        className={`mb-2 flex w-full items-center gap-3 rounded-2xl border-[1.5px] bg-panel px-3.5 py-3 text-left transition-all duration-150 ease-brand ${
          value === 'general_user' ? cardActive : cardInactive
        }`}
      >
        <span className="text-2xl">{ROLE_META.general_user.emoji}</span>
        <span className={`text-sm font-bold ${value === 'general_user' ? 'text-brand dark:text-ice' : 'text-foreground'}`}>
          {ROLE_META.general_user.label}
        </span>
      </button>
      <div className="grid grid-cols-2 gap-2">
        {OTHER_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => onChange(role)}
            aria-pressed={value === role}
            className={`${cardBase} ${value === role ? cardActive : cardInactive}`}
          >
            <span className="text-xl">{ROLE_META[role].emoji}</span>
            <span className={`text-xs font-bold ${value === role ? 'text-brand dark:text-ice' : 'text-foreground'}`}>
              {ROLE_META[role].label}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{ROLE_META[value].description}</p>
    </div>
  )
}
