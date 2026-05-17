import Image from 'next/image';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  variant?: 'compact' | 'lockup' | 'mark';
};

export function BrandLogo({
  className,
  imageClassName,
  priority,
  variant = 'compact',
}: BrandLogoProps) {
  if (variant === 'lockup') {
    return (
      <div className={cn('flex items-center', className)}>
        <Image
          src="/oak-attest-logo-lockup.png"
          alt="OakAttest"
          width={800}
          height={605}
          priority={priority}
          className={cn('h-auto w-36 object-contain', imageClassName)}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Image
        src="/oak-attest-mark.png"
        alt="OakAttest"
        width={390}
        height={440}
        priority={priority}
        className={cn('h-10 w-auto object-contain', imageClassName)}
      />
      {variant === 'compact' && (
        <span className="text-xl font-semibold leading-none text-slate-950">OakAttest</span>
      )}
    </div>
  );
}
