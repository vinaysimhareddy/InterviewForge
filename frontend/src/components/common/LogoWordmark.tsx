import React from 'react';
import { Logo } from './Logo';

interface LogoWordmarkProps {
  className?: string;
  variant?: 'light' | 'dark' | 'auto';
  showTagline?: boolean;
}

export const LogoWordmark: React.FC<LogoWordmarkProps> = ({
  className = '',
  variant = 'auto',
  showTagline = false,
}) => {
  const tagline = import.meta.env.VITE_APP_TAGLINE || 'Realistic AI Technical Interviews';
  const theme = variant === 'dark' ? 'dark' : variant === 'light' ? 'light' : 'auto';

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <Logo variant="full" theme={theme} size="md" responsive={true} />
      {showTagline && (
        <span
          className={`text-[10px] font-mono tracking-wider uppercase mt-1 pl-1 ${
            variant === 'dark' ? 'text-text-muted' : 'text-text-faint'
          }`}
        >
          {tagline}
        </span>
      )}
    </div>
  );
};
