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
        '24px',
        {
          lineHeight: '32px',
          fontWeight: '700',
        },
      ],
      h2: [
        '18px',
        {
          lineHeight: '25px',
          fontWeight: '700',
        },
      ],
      h3: [
        '14px',
        {
          lineHeight: '20px',
          fontWeight: '600',
        },
      ],
      h4: [
        '13px',
        {
          lineHeight: '18px',
          fontWeight: '500',
        },
      ],
      h5: [
        '13px',
        {
          lineHeight: '18px',
          fontWeight: '700',
        },
      ],
      body1: [
        '15px',
        {
          lineHeight: '24px',
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
        '13px',
        {
          lineHeight: '18px',
          fontWeight: '500',
        },
      ],
      button: [
        '14px',
        {
          lineHeight: '20px',
          fontWeight: '600',
        },
      ],
      link: [
        '14px',
        {
          lineHeight: '19px',
          fontWeight: '500',
        },
      ],
      xs: ['12px', '16px'],
      sm: ['14px', '20px'],
      base: ['16px', '24px'],
      bg: ['20px', '28px'],
      xl: ['24px', '32px'],
      lg: ['18px', '28px'],
      '2xl': ['24px', '32px'],
      '3xl': ['30px', '36px'],
      '4xl': ['36px', '40px'],
      '5xl': ['48px', '1'],
      '6xl': ['60px', '1'],
    },
    extend: {
      fontFamily: {
        sans: ['"Red Hat Text"', '"Red Hat Display"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      transitionProperty: {
        width: 'width',
        opacity: 'opacity',
      },
      colors: {
        border: 'hsl(var(--border))',
        'border-strong': 'var(--border-strong)',
        input: 'hsl(var(--input))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          hover: 'var(--primary-hover)',
          soft: 'var(--primary-soft)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
          hover: 'var(--secondary-hover)',
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
        accent_color: 'var(--accent_color)',
        alert: 'var(--alert)',
        ring: 'var(--primary)',
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
    ({ addUtilities }) => {
      addUtilities({
        '.table-striped': {
          '& tr:nth-child(odd)': { '@apply bg-muted/50': {} },
        },
      })
    },
    require('tailwindcss-animate'),
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
