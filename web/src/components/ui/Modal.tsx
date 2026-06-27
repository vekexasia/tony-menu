'use client';

import { type ReactNode } from 'react';
import {
  Dialog,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';

export interface ModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when the modal should close */
  onClose: () => void;
  /** Modal title (optional) */
  title?: string;
  /** Modal content */
  children: ReactNode;
  /** Additional CSS classes for the modal panel */
  className?: string;
  /** Whether to show the close button (default: true) */
  showCloseButton?: boolean;
}

/**
 * A simpler modal variant that centers content.
 * Useful for dialogs that don't need the full bottom sheet treatment.
 */
export interface CenteredModalProps extends Omit<ModalProps, 'className'> {
  /** Size of the modal */
  size?: 'sm' | 'md' | 'lg';
}

export function CenteredModal({
  open,
  onClose,
  title,
  children,
  showCloseButton = true,
  size = 'md',
}: CenteredModalProps) {
  // Close modal on browser back button press
  useBackButtonClose(open, onClose);

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  };

  return (
    <AnimatePresence>
      {open && (
        <Dialog
          as="div"
          className="relative z-50"
          open={open}
          onClose={onClose}
          static
        >
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50"
            aria-hidden="true"
          />

          {/* Modal container */}
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              {/* Centered modal panel */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <DialogPanel
                  className={cn(
                    'relative w-full',
                    sizeStyles[size],
                    'bg-white',
                    'rounded-2xl',
                    'shadow-xl',
                    'p-6'
                  )}
                >
                  {/* Close button */}
                  {showCloseButton && (
                    <button
                      type="button"
                      onClick={onClose}
                      className={cn(
                        'absolute right-3 top-3',
                        'rounded-full bg-black/10 p-1',
                        'text-black/45 transition-colors',
                        'hover:bg-black/20 hover:text-black/60',
                        'focus:outline-none focus-visible:ring-2',
                        'focus-visible:ring-[var(--color-primary,#cc9166)]'
                      )}
                      aria-label="Close modal"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}

                  {/* Title */}
                  {title && (
                    <DialogTitle
                      className={cn(
                        'text-xl font-bold tracking-tight mb-4',
                        'text-[var(--color-primary,#cc9166)]'
                      )}
                    >
                      {title}
                    </DialogTitle>
                  )}

                  {/* Content */}
                  {children}
                </DialogPanel>
              </motion.div>
            </div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
