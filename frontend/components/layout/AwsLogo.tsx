import type { CSSProperties } from "react";

interface AwsLogoProps {
  /** Rendered height in pixels; width scales proportionally. */
  height?: number;
  /** Wordmark color; the smile is always AWS orange. */
  color?: string;
  className?: string;
  style?: CSSProperties;
}

/** Simplified "aws" wordmark with the orange smile, drawn inline so it works in any theme. */
export function AwsLogo({ height = 24, color = "#ffffff", className, style }: AwsLogoProps) {
  const width = Math.round(height * (64 / 38));
  return (
    <svg
      role="img"
      aria-label="AWS"
      viewBox="0 0 64 38"
      width={width}
      height={height}
      className={className}
      style={style}
    >
      <text
        x="32"
        y="22"
        textAnchor="middle"
        fontFamily="'Amazon Ember', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="700"
        fontSize="24"
        letterSpacing="-1.2"
        fill={color}
      >
        aws
      </text>
      <path
        d="M6 29c13.5 7.6 35 8.4 50 1.4"
        fill="none"
        stroke="#ff9900"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M52.6 27.6l5.4 2.6-5 3.4"
        fill="none"
        stroke="#ff9900"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
