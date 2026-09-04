/**
 * Deactivate/reactivate toggle — teal-when-on, deliberately not the
 * reject/danger red used elsewhere, because flipping this is a flag flip
 * (soft-delete), not a destructive action. See docs/design/prototype-v1.html's
 * `.toggle-switch` (v8 design pass) — used by Category Management's
 * active/inactive toggle and User Management's active/deactivated toggle.
 */
interface ToggleSwitchProps {
  on: boolean
  onToggle: () => void
  label: string
  disabled?: boolean
}

export default function ToggleSwitch({ on, onToggle, label, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-[22px] w-[38px] flex-none items-center rounded-full transition-colors duration-150 ease-brand disabled:pointer-events-none disabled:opacity-50 ${
        on ? 'bg-teal' : 'bg-border'
      }`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] flex-none translate-x-0.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-150 ease-brand ${
          on ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
