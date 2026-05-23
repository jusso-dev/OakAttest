import Image from 'next/image';
import { cn } from '@/lib/utils';

export function BurlAvatar({
  className,
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--oak-border)] bg-[var(--panel-surface)]',
        className,
      )}
    >
      <Image
        src="/burl-oakattest-mascot-transparent.svg"
        alt="Burl"
        width={96}
        height={96}
        priority={priority}
        className="h-full w-full object-contain p-1"
      />
    </span>
  );
}
