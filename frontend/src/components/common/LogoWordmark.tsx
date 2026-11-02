import React from 'react';

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
  const appName = import.meta.env.VITE_APP_NAME || 'AdaptiveMock';
  const tagline = import.meta.env.VITE_APP_TAGLINE || 'Realistic AI Technical Interviews';

  const isDarkVariant = variant === 'dark';

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* SVG Icon Emblem */}
      <svg
        className="h-8 w-8 shrink-0 rounded-lg shadow-sm"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="8" fill={isDarkVariant ? '#F4F1EA' : '#0F4A3A'} />
        <circle
          cx="16"
          cy="16"
          r="6"
          stroke={isDarkVariant ? '#0F4A3A' : '#F4F1EA'}
          strokeWidth="2"
        />
        <circle cx="21" cy="11" r="2.5" fill="#C2410C" />
        <path
          d="M12 21a5 5 0 0 0 8 0"
          stroke={isDarkVariant ? '#14503F' : '#E3EFE8'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>

      {/* Typography Wordmark */}
      <div className="flex flex-col">
        <span
          className={`font-display text-lg font-semibold tracking-tight leading-none ${
            isDarkVariant ? 'text-primary-ink' : 'text-primary'
          }`}
        >
          {appName.includes('Mock') ? (
            <>
              {appName.replace('Mock', '')}
              <span className="italic font-normal text-accent ml-0.5">Mock</span>
            </>
          ) : (
            appName
          )}
        </span>
        {showTagline && (
          <span
            className={`text-[10px] font-mono tracking-wider uppercase mt-0.5 ${
              isDarkVariant ? 'text-mint/80' : 'text-text-faint'
            }`}
          >
            {tagline}
          </span>
        )}
      </div>
    </div>
  );
};

