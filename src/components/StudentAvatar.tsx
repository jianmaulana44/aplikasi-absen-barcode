import { useState } from 'react';

interface StudentAvatarProps {
  src?: string;
  name: string;
  className?: string;
}

export function StudentAvatar({ src, name, className = 'w-10 h-10' }: StudentAvatarProps) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  if (!src || failed) {
    return (
      <div
        className={`${className} rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-display font-semibold text-xs shrink-0 select-none`}
        aria-label={name}
      >
        {initials || 'SW'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0`}
    />
  );
}
