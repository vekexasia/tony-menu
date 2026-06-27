import type { ReactNode } from "react";

// Full-screen centered spinner shared by the public pages.
// `as` lets callers keep their existing wrapper element (div vs main).
export function LoadingScreen({ as: Tag = "div" }: { as?: "div" | "main" }) {
  return (
    <Tag className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
    </Tag>
  );
}

// Full-screen error with a retry button. onRetry is supplied by the caller so
// each page keeps its own reload semantics (e.g. force refresh).
export function ErrorScreen({
  message,
  retryLabel,
  onRetry,
  as: Tag = "div",
}: {
  message: ReactNode;
  retryLabel: ReactNode;
  onRetry: () => void;
  as?: "div" | "main";
}) {
  return (
    <Tag className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="text-center">
        <p className="text-red-500 mb-4">{message}</p>
        <button onClick={onRetry} className="px-4 py-2 bg-primary text-white rounded-lg">
          {retryLabel}
        </button>
      </div>
    </Tag>
  );
}
