import React from 'react'

export function PaystackLogo({ className = 'h-5 w-auto' }) {
  return (
    <svg
      viewBox="0 0 110 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Paystack"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <rect width="110" height="32" rx="6" fill="#0BA4DB" />
      <path
        d="M14 10H26M14 16H22M14 22H26"
        stroke="#FFFFFF"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <text
        x="34"
        y="21"
        fill="#FFFFFF"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="13"
        fontWeight="800"
        letterSpacing="-0.3"
      >
        paystack
      </text>
    </svg>
  )
}

export function PayPalLogo({ className = 'h-5 w-auto' }) {
  return (
    <svg
      viewBox="0 0 100 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="PayPal"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <path
        d="M9.1 20.3l3-18.7h5.9c3.9 0 6.6.8 7.3 4.5.6 3-1.1 6.5-4.2 7.7 2.4.7 3.5 3 2.9 6.2-.7 3.9-3.9 5.8-7.7 5.8H12l-2.9-5.5z"
        fill="#003087"
      />
      <path
        d="M12.9 22.8l2.2-13.8h4.4c2.9 0 4.9.6 5.4 3.3.5 2.2-.8 4.8-3.1 5.7 1.8.5 2.6 2.2 2.2 4.6-.5 2.9-2.9 4.3-5.7 4.3h-3.3l-2.1-4.1z"
        fill="#0079C1"
      />
      <path
        d="M17.4 9.1h3.7c1.7 0 3.2.4 3.5 2 .4 1.7-.8 3.5-2.6 3.5h-2.9l-1.7-5.5z"
        fill="#00457C"
      />
      <text
        x="32"
        y="18.5"
        fill="#003087"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="16"
        fontWeight="700"
        fontStyle="italic"
        letterSpacing="-0.5"
      >
        Pay<tspan fill="#0079C1">Pal</tspan>
      </text>
    </svg>
  )
}
