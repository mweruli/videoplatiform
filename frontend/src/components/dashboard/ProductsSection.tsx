import type { UseQueryResult } from '@tanstack/react-query'

import Icon from '../icons/Icon'
import ProductManageCard from './ProductManageCard'
import EmptyState from '../ui/EmptyState'
import Skeleton from '../ui/Skeleton'
import type { Page, ProductDto } from '../../lib/api'

interface ProductsSectionProps {
  productsQuery: UseQueryResult<Page<ProductDto>>
  onAdd: () => void
  onEditProduct: (product: ProductDto) => void
}

export default function ProductsSection({ productsQuery, onAdd, onEditProduct }: ProductsSectionProps) {
  const products = productsQuery.data?.items ?? []

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight text-foreground">Products &amp; services</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Includes listings still pending review — buyers won&apos;t see those until they&apos;re approved.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex flex-none items-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-4 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
        >
          <Icon name="plus" size={13} /> Add product
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {productsQuery.isLoading && (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        )}

        {productsQuery.isError && (
          <EmptyState tone="error" title="Couldn't load your products" subtitle="Check your connection and try again." />
        )}

        {!productsQuery.isLoading && !productsQuery.isError && products.length === 0 && (
          <EmptyState
            icon="📦"
            title="No products or services yet"
            subtitle="Add your first listing — it'll go straight into moderator review before it's publicly visible."
          />
        )}

        {products.map((product) => (
          <ProductManageCard key={product.id} product={product} onEdit={() => onEditProduct(product)} />
        ))}
      </div>
    </div>
  )
}
