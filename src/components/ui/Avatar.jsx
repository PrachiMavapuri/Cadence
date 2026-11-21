import { useState } from 'react';

const SIZE_MAP = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
};

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export function Avatar({ name, src, size = 'sm' }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${SIZE_MAP[size]} rounded-full border border-slate-200 object-cover shrink-0 bg-slate-100`}
      />
    );
  }

  return (
    <span
      aria-label={name}
      className={`${SIZE_MAP[size]} inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-display font-semibold text-slate-700 shrink-0`}
    >
      {getInitials(name || 'U')}
    </span>
  );
}
