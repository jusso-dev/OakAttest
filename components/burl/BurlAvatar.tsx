import Image from 'next/image';
import { cn } from '@/lib/utils';

export function BurlAvatar({
  className,
  priority,
  variant = 'logo',
}: {
  className?: string;
  priority?: boolean;
  variant?: 'logo' | 'mascot';
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--oak-border)] bg-[var(--panel-surface)]',
        className,
      )}
    >
      <Image
        src={variant === 'mascot' ? '/burl-oakattest-mascot-transparent.svg' : '/burl-logo.png'}
        alt="Burl"
        width={96}
        height={96}
        priority={priority}
        className={cn('h-full w-full', variant === 'mascot' ? 'object-contain p-1' : 'object-cover')}
      />
    </span>
  );
}
