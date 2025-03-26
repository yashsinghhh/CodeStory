import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'blob': 'blob 7s infinite',
        'shimmer': 'shimmer 3s infinite',
      },
      keyframes: {
        fadeInUp: {
          '0%': { 
            opacity: '0', 
            transform: 'translateY(20px)' 
          },
          '100%': { 
            opacity: '1', 
            transform: 'translateY(0)' 
          },
        },
        blob: {
          '0%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
          '33%': {
            transform: 'translate(30px, -50px) scale(1.1)',
          },
          '66%': {
            transform: 'translate(-20px, 20px) scale(0.9)',
          },
          '100%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
        },
        shimmer: {
          '0%': {
            backgroundPosition: '-100% 0',
          },
          '100%': {
            backgroundPosition: '200% 0',
          },
        },
      },
      typography: {
        DEFAULT: {
          css: {
            color: '#d4d4d8', // zinc-300
            h1: { color: '#f9fafb' }, // gray-50
            h2: { color: '#f3f4f6' }, // gray-100
            h3: { color: '#e5e7eb' }, // gray-200
            h4: { color: '#d1d5db' }, // gray-300
            strong: { color: '#f9fafb' }, // gray-50
            p: { color: '#d4d4d8' }, // zinc-300
            a: { color: '#818cf8' }, // indigo-400
            blockquote: {
              color: '#d4d4d8',
              borderLeftColor: '#4f46e5', // indigo-600
            },
            code: {
              color: '#f9fafb',
              backgroundColor: '#27272a', // zinc-800
            },
            pre: {
              backgroundColor: '#18181b', // zinc-900
            },
          }
        }
      },
      opacity: {
        '15': '0.15',
        '10': '0.1',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography')
  ],
} satisfies Config;