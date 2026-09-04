import { useState } from 'react'
import type { FormEvent } from 'react'

import Icon from '../icons/Icon'
import DashSection from '../dashboardshell/DashSection'
import EmptyState from '../ui/EmptyState'
import { Field, TextInput } from '../ui/FormControls'
import Modal from '../ui/Modal'
import Skeleton from '../ui/Skeleton'
import ToggleSwitch from '../ui/ToggleSwitch'
import { useAdminCategories, useCreateCategory, useUpdateCategory } from '../../hooks/useAdmin'
import { ApiError } from '../../lib/api'
import type { AdminCategoryDto } from '../../lib/api'
import { useToast } from '../../lib/toast'

/**
 * Client-side approximation of the server's `unique_slug(slugify(name))` —
 * shown as a live, read-only preview underneath the name field while adding
 * a category. The real slug always comes back from the server response;
 * this is never sent as input and never assumed to match exactly (the
 * server also de-duplicates collisions) — see CategoryCreate's docstring.
 */
function slugifyPreview(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
}

/**
 * Admin Panel → Category Management (`pages/Admin.tsx`'s "categories"
 * section). Real backend throughout: `GET/POST /admin/categories`,
 * `PATCH /admin/categories/{id}` — see hooks/useAdmin.ts. Matches
 * docs/design/prototype-v1.html's v8 design pass: a table with inline
 * rename (pencil -> text input, no modal) and a toggle-switch
 * deactivate/reactivate — there is deliberately no delete control anywhere,
 * matching the backend's deactivate-only design (categories stay referenced
 * by existing listings).
 */
export default function CategoryManagement() {
  const { showToast } = useToast()
  const categoriesQuery = useAdminCategories()
  const updateMutation = useUpdateCategory()
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [savingRename, setSavingRename] = useState(false)

  const categories = categoriesQuery.data ?? []
  const activeCount = categories.filter((c) => c.is_active).length

  function startRename(category: AdminCategoryDto) {
    setEditingId(category.id)
    setEditValue(category.name)
    setEditError(null)
  }

  function cancelRename() {
    setEditingId(null)
    setEditValue('')
    setEditError(null)
  }

  function saveRename(category: AdminCategoryDto) {
    const name = editValue.trim()
    if (!name) {
      setEditError('Give the category a name.')
      return
    }
    if (name === category.name) {
      cancelRename()
      return
    }
    setSavingRename(true)
    setEditError(null)
    updateMutation.mutate(
      { categoryId: category.id, payload: { name } },
      {
        onSuccess: () => {
          setSavingRename(false)
          cancelRename()
          showToast(`Renamed to ${name}`)
        },
        onError: (err) => {
          setSavingRename(false)
          setEditError(err instanceof ApiError ? err.message : 'Could not rename this category.')
        },
      },
    )
  }

  function toggleActive(category: AdminCategoryDto) {
    updateMutation.mutate(
      { categoryId: category.id, payload: { is_active: !category.is_active } },
      {
        onSuccess: () => showToast(category.is_active ? `${category.name} deactivated` : `${category.name} reactivated`),
        onError: (err) => showToast(err instanceof ApiError ? err.message : 'Could not update this category.'),
      },
    )
  }

  return (
    <DashSection
      title="Categories"
      subtitle={
        categoriesQuery.isSuccess
          ? `${categories.length} total · ${activeCount} active and shown to shoppers. Deactivating hides a category from search/upload pickers — it's never deleted, so existing listings keep it.`
          : undefined
      }
      action={
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex flex-none items-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-3.5 py-2 text-xs font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
        >
          <Icon name="plus" size={13} />
          Add category
        </button>
      }
    >
      {categoriesQuery.isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      )}

      {categoriesQuery.isError && (
        <EmptyState tone="error" title="Couldn't load categories" subtitle="Check your connection and try again.">
          <button
            type="button"
            onClick={() => categoriesQuery.refetch()}
            className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Retry
          </button>
        </EmptyState>
      )}

      {categoriesQuery.isSuccess && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
                <th className="py-2 pr-3 font-extrabold">Category</th>
                <th className="py-2 pr-3 font-extrabold">Used by</th>
                <th className="py-2 pr-3 font-extrabold">Status</th>
                <th className="py-2 pr-1 font-extrabold" />
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const editing = editingId === category.id
                return (
                  <tr key={category.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3">
                      {editing ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <TextInput
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveRename(category)
                                if (e.key === 'Escape') cancelRename()
                              }}
                              className="!py-1.5 text-sm font-bold"
                              error={Boolean(editError)}
                            />
                            <button
                              type="button"
                              onClick={() => saveRename(category)}
                              disabled={savingRename}
                              aria-label="Save"
                              title="Save"
                              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-teal text-white transition-opacity duration-150 ease-brand hover:opacity-90 disabled:opacity-60"
                            >
                              <Icon name="check" size={13} strokeWidth={3} />
                            </button>
                            <button
                              type="button"
                              onClick={cancelRename}
                              disabled={savingRename}
                              aria-label="Cancel"
                              title="Cancel"
                              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel text-foreground transition-colors duration-150 ease-brand hover:bg-border/70"
                            >
                              <Icon name="close" size={13} />
                            </button>
                          </div>
                          {editError && <p className="mt-1 text-xs font-semibold text-danger">{editError}</p>}
                        </div>
                      ) : (
                        <div className={`flex items-center gap-2.5 ${category.is_active ? '' : 'opacity-50 grayscale'}`}>
                          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-panel text-foreground">
                            <Icon name="tag" size={15} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-bold text-foreground">{category.name}</div>
                            <div className="truncate text-xs text-muted-foreground">/{category.slug}</div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-xs whitespace-nowrap text-muted-foreground">
                      {category.business_count} biz · {category.product_count} prod · {category.video_count} vid
                    </td>
                    <td className="py-2.5 pr-3">
                      {category.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2.5 py-1 text-[11px] font-bold text-teal">
                          <Icon name="check" size={10} strokeWidth={3} />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-panel px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-1">
                      <div className="flex items-center justify-end gap-2">
                        {!editing && (
                          <button
                            type="button"
                            onClick={() => startRename(category)}
                            aria-label={`Rename ${category.name}`}
                            title="Rename"
                            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 ease-brand hover:bg-panel hover:text-foreground"
                          >
                            <Icon name="edit" size={14} />
                          </button>
                        )}
                        <ToggleSwitch
                          on={category.is_active}
                          onToggle={() => toggleActive(category)}
                          label={category.is_active ? `Deactivate ${category.name}` : `Reactivate ${category.name}`}
                          disabled={updateMutation.isPending}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CategoryAddModal open={addOpen} onClose={() => setAddOpen(false)} />
    </DashSection>
  )
}

function CategoryAddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast()
  const createMutation = useCreateCategory()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleClose() {
    setName('')
    setError(null)
    onClose()
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the category a name.')
      return
    }
    setError(null)
    createMutation.mutate(
      { name: trimmed },
      {
        onSuccess: (category) => {
          showToast(`${category.name} added`)
          handleClose()
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not add this category.'),
      },
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add category">
      <p className="mb-4 text-sm text-muted-foreground">
        The slug is generated automatically from the name and can't be edited — it's the stable identifier used in URLs and
        filters.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <Field label="Category name" error={error ?? undefined}>
          <TextInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Logistics & Transport"
            error={Boolean(error)}
          />
        </Field>
        <Field label="Slug" hint="Auto-generated, not editable — an approximation shown live; the real slug comes from the server.">
          <div className="rounded-xl border-[1.5px] border-border bg-panel px-3.5 py-2.5 font-mono text-sm text-muted-foreground">
            {name.trim() ? slugifyPreview(name) || '—' : '—'}
          </div>
        </Field>
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-full border-[1.5px] border-border py-2.5 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-panel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex-1 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg disabled:pointer-events-none disabled:opacity-70"
          >
            {createMutation.isPending ? 'Adding…' : 'Add category'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
