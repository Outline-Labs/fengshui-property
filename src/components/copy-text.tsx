"use client";

import { useState } from "react";

export function CopyText({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. insecure context) — ignore
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy to clipboard"
      className={`group inline-flex items-center gap-1.5 ${className ?? ""}`}
    >
      <span>{label ?? value}</span>
      <span
        className={`text-[10px] tracking-wide uppercase ${
          copied ? "text-jade" : "text-current opacity-40 group-hover:opacity-70"
        }`}
      >
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}
