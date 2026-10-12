import type { SVGProps } from 'react';
import { brand } from '@/config/brand';

/** An architectural P: a connected plot, open courtyard, and forward corner. */
export function PropbrewMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 64 64"
      fill="none"
      {...props}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 6h32l16 16v16L40 54H24v8H8V6Zm16 16v16h10l6-6v-4l-6-6H24Z"
      />
      <path fill="currentColor" d="M46 6h10v10L46 6Z" />
    </svg>
  );
}

export function PropbrewLogo({
  className = '',
  light = false,
}: {
  className?: string;
  light?: boolean;
}) {
  return (
    <span className={`pb-logo${light ? ' pb-logo-light' : ''}${className ? ` ${className}` : ''}`}>
      <PropbrewMark className="pb-logo-mark" />
      <span className="pb-wordmark">{brand.name.toLowerCase()}</span>
    </span>
  );
}
