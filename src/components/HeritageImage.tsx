import { useState } from 'react';
import { Sparkles } from 'lucide-react';

interface HeritageImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export function HeritageImage({
  src,
  alt,
  className = '',
  fallbackTitle,
}: HeritageImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#F3ECE1] to-[#E5D7C3] text-[#6E5F54] p-6 text-center ${className}`}
      >
        <Sparkles className="w-6 h-6 text-[#A67C37] mb-2" aria-hidden="true" />
        <span className="font-display text-lg text-[#231B17]">
          {fallbackTitle || alt}
        </span>
        <span className="text-xs text-[#6E5F54] mt-1">VIRAASAT Archive</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
