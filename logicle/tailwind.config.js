/* eslint-disable @typescript-eslint/no-require-imports */
/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: 'jit',
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    fontSize: {
      h1: [
        '30px',
        {
          lineHeight: '39.69px',
          fontWeight: '700',
        },
      ],
      h2: [
        '24px',
        {
          lineHeight: '31.75px',
          fontWeight: '700',
        },
      ],
      h3: [
        '18px',
        {
          lineHeight: '23.81px',
          fontWeight: '500',
        },
      ],
      h4: [
        '14px',
        {
          lineHeight: '18.52px',
          fontWeight: '500',
        },
      ],
      h5: [
        '14px',
        {
          lineHeight: '18.52px',
          fontWeight: '700',
        },
      ],
      body1: [
        '18px',
        {
          lineHeight: '23.81px',
          fontWeight: '400',
        },
      ],
      body2: [
        '14px',
        {
          lineHeight: '18.52px',
          fontWeight: '500',
        },
      ],
      label: [
        '16px',
        {
          lineHeight: '18px',
          fontWeight: '500',
        },
      ],
      button: [
        '20px',
        {
          lineHeight: '25px',
          fontWeight: '700',
        },
      ],
      link: [
        '16px',
        {
          lineHeight: '19px',
          fontWeight: '500',
        },
      ],
      sm: ['14px', '20px'],
      base: ['16px', '24px'],
      bg: ['20px', '28px'],
      xl: ['24px', '32px'],
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          hover: 'var(--primary-hover)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary_text_color: 'var(--primary_text_color)',
        primary_color: 'var(--primary_color)',
        accent_color: 'var(--accent_color)',
        secondary_color: 'var(--secondary_color)',
        secondary_text_color: 'var(--secondary_text_color)',
        alert: 'var(--alert)',
        secondary_color_hover: 'hsl(var(--secondary_color_hover))',
        ring: 'var(--primary_color)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      typography: {
        DEFAULT: {
          css: {
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            // Optionally, you can also adjust code styling:
            code: {
              color: '#4B5563',
              borderRadius: '0.25rem',

              backgroundColor: '#F3F4F6',
              'padding-top': '0.3rem',
              'padding-bottom': '0.3rem',
              'padding-left': '0.15rem',
              'padding-right': '0.15rem',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
