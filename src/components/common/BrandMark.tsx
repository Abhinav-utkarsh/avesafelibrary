interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
  lg: 'w-11 h-11',
};

/**
 * Geometric architectural emblem for Av_eSAFE Library.
 * Precision A-frame study arch + protective keystone in executive navy and gold.
 */
export function BrandMark({ size = 'md', inverted = false, className = '' }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-xl shrink-0 ${SIZE_MAP[size]} ${
        inverted
          ? 'bg-white/10 border border-white/20'
          : 'bg-[#0B1F3A] dark:bg-sky-500/15 border border-[#0B1F3A] dark:border-sky-400/30 shadow-xs'
      } ${className}`}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[62%] h-[62%]"
      >
        {/* Architectural A Pillars */}
        <path
          d="M7.5 24L16 7.5L24.5 24"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={!inverted ? 'dark:stroke-sky-300' : ''}
        />
        {/* Gold Safe-Shield Crossbar & Keystone */}
        <path
          d="M11.2 18.5H20.8"
          stroke="#C89B3C"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="16" cy="23.5" r="2" fill="#C89B3C" />
      </svg>
    </span>
  );
}
