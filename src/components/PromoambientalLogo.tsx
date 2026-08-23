import React from 'react';

interface PromoambientalLogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'icon-only' | 'compact';
  theme?: 'dark' | 'light';
  className?: string;
}

export const PromoEmblem: React.FC<{ size?: number; className?: string }> = ({ size = 44, className = '' }) => {
  return (
    <div 
      style={{ width: size, height: size }} 
      className={`shrink-0 rounded-full relative flex items-center justify-center select-none shadow-md overflow-hidden bg-[#1e293b] border-2 border-white/20 ${className}`}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Dark Circle Outer Background */}
        <circle cx="50" cy="50" r="48" fill="#1e293b" />
        
        {/* Outer White Rim */}
        <circle cx="50" cy="50" r="46" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        
        {/* Center white vertical division curve */}
        <path
          d="M50,4 A46,46 0 0,0 50,96 C62,75 38,25 50,4 Z"
          fill="#ffffff"
        />

        {/* Top-Right / Top Toucan Beak & Head (Golden Yellow / Orange) */}
        <path
          d="M50,6 C72,6 92,24 94,48 C76,46 60,32 50,6 Z"
          fill="#f59e0b"
          stroke="#111827"
          strokeWidth="2.5"
        />

        {/* Top Left Toucan Body (Vibrant Green) */}
        <path
          d="M6,50 C6,26 24,8 48,6 C44,28 26,44 6,50 Z"
          fill="#22c55e"
          stroke="#111827"
          strokeWidth="2.5"
        />

        {/* Top-Left Sky Blue Face area */}
        <path
          d="M28,12 C40,16 46,28 44,40 C34,38 24,28 28,12 Z"
          fill="#0284c7"
          stroke="#111827"
          strokeWidth="2"
        />
        {/* Eye */}
        <circle cx="37" cy="26" r="3.5" fill="#ffffff" />
        <circle cx="37" cy="26" r="1.8" fill="#0f172a" />

        {/* Top Black Accent Wing Feather */}
        <path
          d="M6,50 C18,52 38,62 50,50 C38,40 20,38 6,50 Z"
          fill="#0f172a"
        />

        {/* Bottom-Left Toucan Beak (Golden Yellow / Orange) */}
        <path
          d="M50,94 C28,94 8,76 6,52 C24,54 40,68 50,94 Z"
          fill="#f59e0b"
          stroke="#111827"
          strokeWidth="2.5"
        />

        {/* Bottom-Right Toucan Body (Vibrant Green) */}
        <path
          d="M94,50 C94,74 76,92 52,94 C56,72 74,56 94,50 Z"
          fill="#22c55e"
          stroke="#111827"
          strokeWidth="2.5"
        />

        {/* Bottom-Right Sky Blue Face area */}
        <path
          d="M72,88 C60,84 54,72 56,60 C66,62 76,72 72,88 Z"
          fill="#0284c7"
          stroke="#111827"
          strokeWidth="2"
        />
        {/* Eye */}
        <circle cx="63" cy="74" r="3.5" fill="#ffffff" />
        <circle cx="63" cy="74" r="1.8" fill="#0f172a" />

        {/* Bottom Black Accent Wing Feather */}
        <path
          d="M94,50 C82,48 62,38 50,50 C62,60 80,62 94,50 Z"
          fill="#0f172a"
        />
      </svg>
    </div>
  );
};

export const PromoambientalLogo: React.FC<PromoambientalLogoProps> = ({
  size = 'md',
  variant = 'full',
  theme = 'dark',
  className = '',
}) => {
  const emblemSize = size === 'sm' ? 36 : size === 'lg' ? 52 : 44;
  const isDarkTheme = theme === 'dark';

  if (variant === 'icon-only') {
    return <PromoEmblem size={emblemSize} className={className} />;
  }

  if (variant === 'compact') {
    return (
      <div className={`flex items-center space-x-2.5 ${className}`}>
        <PromoEmblem size={emblemSize} />
        <div>
          <div className={`font-bold tracking-tight text-sm leading-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
            Promoambiental
          </div>
          <div className={`text-[10px] font-bold tracking-widest uppercase ${isDarkTheme ? 'text-amber-400' : 'text-emerald-700'}`}>
            Distrito S.A.S. ESP
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-3.5 select-none ${className}`}>
      {/* Exact Emblem Icon */}
      <PromoEmblem size={emblemSize} />

      {/* Exact Typography matching the image:
          Promoambiental Distrito
          -----------------------
                         S.A.S. ESP
      */}
      <div className="flex flex-col">
        <div className="relative inline-block pb-0.5">
          <span className={`font-bold text-sm md:text-base tracking-tight leading-none ${
            isDarkTheme ? 'text-white' : 'text-slate-900'
          }`}>
            Promoambiental Distrito
          </span>
          <div className={`w-full h-[1.5px] mt-0.5 ${
            isDarkTheme ? 'bg-white/80' : 'bg-slate-800'
          }`} />
        </div>
        <div className="flex justify-end">
          <span className={`text-[10px] md:text-xs font-semibold tracking-wider ${
            isDarkTheme ? 'text-slate-200' : 'text-slate-600'
          }`}>
            S.A.S. ESP
          </span>
        </div>
      </div>
    </div>
  );
};
