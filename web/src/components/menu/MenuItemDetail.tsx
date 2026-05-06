'use client';

import { motion } from 'framer-motion';
import { Dialog, DialogPanel } from '@headlessui/react';
import { useTranslations } from '@/lib/i18n';
import { useState, useCallback } from 'react';
import type { MenuEntry } from '@/lib/types';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';
import { useRestaurantStore, useLabels } from '@/stores/restaurantStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { getContentDisplayText, getLocalizedContentValue } from '@/lib/content-presentation';
import { resolveLabel } from '@/lib/label-colors';
import { MenuItemDetailView } from './views/MenuItemDetailView';

interface MenuItemDetailProps {
  item: (MenuEntry & { description?: string; image?: string; priceUnit?: string; frozen?: boolean }) | null;
  onClose: () => void;
  locale: string;
  /** When true, price is hidden — used in AI chat context where pricing should not be displayed. */
  hidePrice?: boolean;
  /** When true, diners can add this item to their local menu selection. */
  selectionEnabled?: boolean;
}

export function MenuItemDetail({ item, onClose, locale, hidePrice, selectionEnabled }: MenuItemDetailProps) {
  const t = useTranslations();
  const restaurantId = useRestaurantStore((state) => state.data?.id);
  const allLabels = useLabels();
  const quantity = useSelectionStore((state) => item ? state.quantityFor(item.id) : 0);
  const addToSelection = useSelectionStore((state) => state.add);
  const incrementSelection = useSelectionStore((state) => state.increment);
  const decrementSelection = useSelectionStore((state) => state.decrement);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 250);
  }, [onClose]);

  useBackButtonClose(!!item, handleClose);

  if (!item) return null;

  const itemName = getContentDisplayText({ entity: item, field: 'name', locale, restaurantId });
  const description =
    getLocalizedContentValue({ description: item.description, i18n: item.i18n }, 'description', locale)
    || item.description;
  const canSelect = selectionEnabled && !item.outOfStock;

  return (
    <Dialog as="div" className="relative z-50" open={!!item} onClose={handleClose} static>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isClosing ? 0 : 1 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 bg-black/60"
        onClick={handleClose}
      />
      <div className="fixed inset-0 flex items-end justify-center pointer-events-none">
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: isClosing ? '100%' : 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-lg pointer-events-auto"
        >
          <DialogPanel className="relative min-h-[50vh] max-h-[85vh] overflow-y-auto">
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 bg-white/90 rounded-full p-2 shadow-lg hover:bg-white transition-colors z-30"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-6 h-6 text-gray-600"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <MenuItemDetailView
              item={{
                name: itemName.primary,
                nameSecondary: itemName.secondary,
                description,
                price: item.price,
                priceUnit: item.priceUnit,
                image: item.image,
                allergens: item.allergens,
                labels: item.labelIds?.length
                  ? allLabels.filter(l => item.labelIds!.includes(l.id)).map(l => resolveLabel(l, locale))
                  : undefined,
                outOfStock: item.outOfStock,
                containsFrozenIngredient: item.frozen,
              }}
              hidePrice={hidePrice}
              allergyWarning={t('allergyWarning')}
              frozenWarning={t('frozenProduct')}
            />
            {canSelect && (
              <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 shadow-[0_-6px_20px_rgba(0,0,0,0.08)]">
                {quantity > 0 ? (
                  <div className="flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={() => decrementSelection(item.id)}
                      aria-label="Decrease quantity"
                      className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 text-2xl font-semibold flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="min-w-10 text-center text-lg font-bold text-gray-800">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => incrementSelection(item.id)}
                      aria-label="Increase quantity"
                      className="w-12 h-12 rounded-full bg-primary text-white text-2xl font-semibold flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => addToSelection(item.id)}
                    className="w-full bg-primary text-white py-3 rounded-full font-semibold hover:opacity-90 transition-opacity"
                  >
                    Add to selection
                  </button>
                )}
              </div>
            )}
          </DialogPanel>
        </motion.div>
      </div>
    </Dialog>
  );
}
