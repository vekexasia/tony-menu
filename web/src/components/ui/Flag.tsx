import { getBundledFlagSvg, svgToDataUrl } from "@/lib/locale-flags";

type FlagProps = {
  code: string;
  customUrl?: string | null;
  label?: string;
  className?: string;
  /** If true, the flag is treated as decorative (alt="" and aria-hidden) — use when adjacent text already names the language. */
  decorative?: boolean;
};

export function Flag({ code, customUrl, label, className, decorative }: FlagProps) {
  const alt = decorative ? "" : (label ?? code.toUpperCase());
  const cls = className ?? "h-3.5 w-5 rounded-sm object-cover ring-1 ring-black/10";
  const ariaHidden = decorative ? true : undefined;

  if (customUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={customUrl} alt={alt} className={cls} aria-hidden={ariaHidden} />;
  }

  const bundled = getBundledFlagSvg(code);
  if (bundled) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={svgToDataUrl(bundled)} alt={alt} className={cls} aria-hidden={ariaHidden} />;
  }

  return (
    <span
      aria-label={decorative ? undefined : alt}
      aria-hidden={ariaHidden}
      className="inline-block px-1 text-[10px] font-bold tracking-wide rounded-sm bg-gray-200 text-gray-600"
    >
      {code.toUpperCase()}
    </span>
  );
}
