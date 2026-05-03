'use client';

import { motion } from 'framer-motion';
import { Dialog, DialogPanel } from '@headlessui/react';
import { useTranslations } from '@/lib/i18n';
import { useState, useCallback } from 'react';
import type { MenuEntry } from '@/lib/types';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';
import { useRestaurantStore, useLabels } from '@/stores/restaurantStore';
import { getContentDisplayText, getLocalizedContentValue } from '@/lib/content-presentation';
import { MenuItemDetailView } from './views/MenuItemDetailView';

interface MenuItemDetailProps {
  item: (MenuEntry & { description?: string; image?: string; priceUnit?: string; frozen?: boolean }) | null;
  onClose: () => void;
  locale: string;
  /** When true, price is hidden — used in AI chat context where pricing should not be displayed. */
  hidePrice?: boolean;
}

export function MenuItemDetail({ item, onClose, locale, hidePrice }: MenuItemDetailProps) {
  const t = useTranslations();
  const restaurantId = useRestaurantStore((state) => state.data?.id);
  const allLabels = useLabels();
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
                  ? allLabels.filter(l => item.labelIds!.includes(l.id))
                  : undefined,
                outOfStock: item.outOfStock,
                containsFrozenIngredient: item.frozen,
              }}
              hidePrice={hidePrice}
              allergyWarning={t('allergyWarning')}
              frozenWarning={t('frozenProduct')}
            />
          </DialogPanel>
        </motion.div>
      </div>
    </Dialog>
  );
}
