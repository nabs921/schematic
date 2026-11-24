import type { ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends ComponentProps<typeof Loader2> {
  label?: string;
}

export function Spinner({ className, label, ...props }: SpinnerProps) {
  return (
    <>
      <Loader2
        aria-hidden="true"
        className={cn('h-3.5 w-3.5 animate-spin', className)}
        {...props}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}
