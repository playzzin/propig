'use client';

import type { ComponentProps, FocusEventHandler, MouseEventHandler, TouchEventHandler } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type IntentPrefetchLinkProps = ComponentProps<typeof Link> & {
  intentPrefetch?: boolean;
};

function getPrefetchHref(href: IntentPrefetchLinkProps['href']): string | null {
  if (typeof href === 'string') return href;
  return href.pathname?.toString() ?? null;
}

export function IntentPrefetchLink({
  href,
  intentPrefetch = false,
  onFocus,
  onMouseEnter,
  onTouchStart,
  prefetch,
  ...props
}: IntentPrefetchLinkProps) {
  const router = useRouter();

  const prefetchOnIntent = () => {
    if (!intentPrefetch) return;
    const target = getPrefetchHref(href);
    if (target) router.prefetch(target);
  };

  const handleMouseEnter: MouseEventHandler<HTMLAnchorElement> = (event) => {
    onMouseEnter?.(event);
    if (!event.defaultPrevented) prefetchOnIntent();
  };

  const handleFocus: FocusEventHandler<HTMLAnchorElement> = (event) => {
    onFocus?.(event);
    if (!event.defaultPrevented) prefetchOnIntent();
  };

  const handleTouchStart: TouchEventHandler<HTMLAnchorElement> = (event) => {
    onTouchStart?.(event);
    if (!event.defaultPrevented) prefetchOnIntent();
  };

  return (
    <Link
      {...props}
      href={href}
      prefetch={intentPrefetch ? false : prefetch}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      onTouchStart={handleTouchStart}
    />
  );
}
