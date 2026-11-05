import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer touch-manipulation',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-ink shadow-sm hover:bg-primary-hover active:scale-[0.99]',
        primary:
          'bg-primary text-primary-ink shadow-sm hover:bg-primary-hover active:scale-[0.99]',
        destructive:
          'bg-danger text-white shadow-sm hover:opacity-90 active:scale-[0.99]',
        outline:
          'border border-card-border bg-card text-text shadow-sm hover:bg-bg-subtle hover:border-text-faint',
        secondary:
          'border border-card-border bg-card text-text hover:bg-bg-subtle shadow-sm',
        ghost:
          'text-text-muted hover:text-text hover:bg-bg-subtle',
        accent:
          'bg-accent text-white shadow-sm hover:opacity-95 active:scale-[0.99]',
        link:
          'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 sm:h-10 min-h-[44px] sm:min-h-0 px-4 py-2',
        sm: 'h-11 sm:h-8 min-h-[44px] sm:min-h-0 rounded-md px-3 text-xs',
        lg: 'h-12 min-h-[44px] rounded-lg px-7 text-base font-semibold',
        pill: 'h-11 min-h-[44px] rounded-full px-6 text-sm font-medium',
        icon: 'h-11 w-11 sm:h-10 sm:w-10 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
