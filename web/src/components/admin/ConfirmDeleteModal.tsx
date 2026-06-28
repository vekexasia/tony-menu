"use client";

// Shared delete-confirmation modal for admin entry pages.
// `t` is the admin translator; the confirm copy interpolates {name} and bolds it.
export function ConfirmDeleteModal({
  name,
  deleting,
  onCancel,
  onConfirm,
  t,
  title,
  confirmText,
  error,
}: {
  name: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string) => string;
  // Optional overrides so non-entry deletes (categories, labels) can reuse this
  // modal with their own warning copy instead of native confirm()/alert().
  // confirmText is already interpolated except for {name}, which is bolded here.
  title?: string;
  confirmText?: string;
  error?: string | null;
}) {
  const parts = (confirmText ?? t("entries.delete.confirm")).split("{name}");
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-red-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">{title ?? t("entries.delete.title")}</h3>
          <p className="text-gray-500 mb-6">
            {parts.map((part, i) => (
              <span key={i}>
                {part}
                {i < parts.length - 1 && <strong>{name}</strong>}
              </span>
            ))}
          </p>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={deleting}
              className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? t("common.deleting") : t("common.delete")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
