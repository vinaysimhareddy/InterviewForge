import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-1',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-ink shadow-sm',
        secondary:
          'border-card-border bg-bg-subtle text-text',
        destructive:
          'border-danger/30 bg-danger/10 text-danger',
        outline:
          'border-card-border text-text-muted bg-card',
        success:
          'border-success/30 bg-mint text-success',
        warning:
          'border-warning/30 bg-sand text-warning',
        accent:
          'border-accent/30 bg-peach text-accent font-semibold',
        peach:
          'border-accent/30 bg-peach text-accent font-semibold',
        sky:
          'border-info/30 bg-sky text-info',
        mint:
          'border-success/30 bg-mint text-success',
        sand:
          'border-warning/30 bg-sand text-warning',
        mono:
          'border-card-border bg-card text-text-faint font-mono uppercase tracking-wider text-[11px] px-2 py-0.5',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
