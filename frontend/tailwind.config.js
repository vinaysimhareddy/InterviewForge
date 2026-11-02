/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Core editorial tokens */
        bg: {
          DEFAULT: "var(--bg)",
          subtle: "var(--bg-subtle)",
        },
        "bg-subtle": "var(--bg-subtle)",
        card: {
          DEFAULT: "var(--card)",
          border: "var(--card-border)",
          foreground: "var(--text)",
        },
        "card-border": "var(--card-border)",
        "muted-surface": "var(--muted-surface)",
        text: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          ink: "var(--primary-ink)",
          foreground: "var(--primary-ink)",
        },
        deep: {
          1: "var(--deep-1)",
          2: "var(--deep-2)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          dark: "var(--accent-dark)",
          soft: "var(--accent-soft)",
          foreground: "var(--accent)",
        },
        "accent-dark": "var(--accent-dark)",
        mint: "var(--mint)",
        peach: "var(--peach)",
        sky: "var(--sky)",
        sand: "var(--sand)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",

        /* shadcn/ui mappings */
        background: "var(--bg)",
        foreground: "var(--text)",
        popover: {
          DEFAULT: "var(--card)",
          foreground: "var(--text)",
        },
        secondary: {
          DEFAULT: "var(--bg-subtle)",
          foreground: "var(--text)",
        },
        muted: {
          DEFAULT: "var(--muted-surface)",
          foreground: "var(--text-muted)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "var(--primary-ink)",
        },
        border: "var(--card-border)",
        input: "var(--card-border)",
        ring: "var(--primary)",
      },
      fontFamily: {
        display: ['"Newsreader"', 'Georgia', 'serif'],
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        'mono-label': ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 30, 25, 0.04), 0 8px 24px rgba(20, 30, 25, 0.05)",
        soft: "0 2px 8px rgba(20, 30, 25, 0.04)",
        elevated: "0 12px 32px rgba(20, 30, 25, 0.08)",
      },
    },
  },
  plugins: [],
};
