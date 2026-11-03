import React from 'react';

export interface LogoProps {
  /**
   * Logo visual variant:
   * - 'full': mark + wordmark
   * - 'mark': symbol/tree icon only
   * - 'wordmark': text only
   */
  variant?: 'full' | 'mark' | 'wordmark';

  /**
   * Color theme:
   * - 'auto': adapts to system / context (defaults to high-contrast dark theme)
   * - 'light': dark text for light surfaces
   * - 'dark': crisp light text for dark surfaces
   * - 'mono': monochrome (white on dark, dark on light)
   */
  theme?: 'auto' | 'light' | 'dark' | 'mono';

  /**
   * Dimension size presets or explicit pixel height
   */
  size?: 'sm' | 'md' | 'lg' | number;

  /**
   * Automatically switches full logo to mark on viewports < 640 px
   */
  responsive?: boolean;

  /**
   * Additional wrapper / element classes
   */
  className?: string;

  /**
   * Optional navigation link wrapping the logo
   */
  href?: string;

  /**
   * Accessible image text
   */
  alt?: string;
}

export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  theme = 'auto',
  size = 'md',
  responsive = true,
  className = '',
  href,
  alt = 'InterviewForge',
}) => {
  // Height sizing
  const getHeight = (): number => {
    if (typeof size === 'number') return size;
    switch (size) {
      case 'sm':
        return variant === 'mark' ? 24 : 26;
      case 'lg':
        return variant === 'mark' ? 48 : 52;
      case 'md':
      default:
        return variant === 'mark' ? 36 : 38;
    }
  };

  const height = getHeight();

  // Determine base asset URL and srcset
  let src = '/brand/logo-full-dark.png';
  let srcSet = '/brand/logo-full-dark.png 1x, /brand/logo-full.png 2x';

  if (variant === 'mark') {
    src = '/brand/logo-mark-64.png';
    srcSet = '/brand/logo-mark-32.png 1x, /brand/logo-mark-64.png 2x, /brand/logo-mark-128.png 3x';
  } else if (variant === 'wordmark') {
    src = '/brand/logo-wordmark.png';
    srcSet = '/brand/logo-wordmark.png 1x';
  } else {
    // variant === 'full'
    if (theme === 'light') {
      src = '/brand/logo-full-light.png';
      srcSet = '/brand/logo-full-light.png 1x, /brand/logo-full.png 2x';
    } else {
      src = '/brand/logo-full-dark.png';
      srcSet = '/brand/logo-full-dark.png 1x, /brand/logo-full.png 2x';
    }
  }

  const themeFilterClass =
    theme === 'mono' ? 'brightness-0 invert opacity-90' : '';

  const imgElement = (
    <picture className={`inline-flex items-center select-none ${className}`}>
      {variant === 'full' && responsive && (
        <source
          media="(max-width: 639px)"
          srcSet="/brand/logo-mark-32.png 1x, /brand/logo-mark-64.png 2x, /brand/logo-mark-128.png 3x"
        />
      )}
      <img
        src={src}
        srcSet={srcSet}
        alt={alt}
        role="img"
        height={height}
        style={{ height: `${height}px`, width: 'auto' }}
        className={`object-contain transition-transform ${themeFilterClass}`}
        loading="eager"
        decoding="async"
      />
    </picture>
  );

  if (href) {
    return (
      <a
        href={href}
        aria-label={alt}
        className="inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-opacity hover:opacity-90"
      >
        {imgElement}
      </a>
    );
  }

  return imgElement;
};

export default Logo;

