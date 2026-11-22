import React, { useEffect, useState } from 'react';
import type { StudentGender } from '../../types/domain';

export type StudentAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface StudentAvatarProps {
  name?: string;
  photoUrl?: string | null;
  gender?: StudentGender | string | null;
  size?: StudentAvatarSize;
  shape?: 'circle' | 'rounded';
  className?: string;
  ring?: boolean;
}

const SIZE_CLASSES: Record<StudentAvatarSize, string> = {
  xs: 'w-7 h-7',
  sm: 'w-9 h-9',
  md: 'w-11 h-11',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20',
  '2xl': 'w-28 h-28',
};

const SAFE_PHOTO_REGEX = /^(https:\/\/.+|data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/;

export function getSafeAvatarSrc(photoUrl?: string | null): string | null {
  if (!photoUrl || typeof photoUrl !== 'string') return null;
  const trimmed = photoUrl.trim();
  if (!trimmed) return null;
  return SAFE_PHOTO_REGEX.test(trimmed) ? trimmed : null;
}

export function formatGenderLabel(gender?: StudentGender | string | null): string {
  switch (gender) {
    case 'male':
      return 'Male';
    case 'female':
      return 'Female';
    case 'other':
      return 'Other';
    case 'prefer_not_to_say':
      return 'Prefer not to say';
    default:
      return 'Not specified';
  }
}

function MaleDefaultSvg() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="w-full h-full">
      <rect width="64" height="64" fill="#E8EFF8" />
      <circle cx="32" cy="24" r="11" fill="#1E406D" />
      {/* Subtle structured hair silhouette */}
      <path
        d="M21 22.5C21 15.8 25.9 11.5 32 11.5C38.1 11.5 43 15.8 43 22.5C41.2 19.6 38.4 18 32 18C25.6 18 22.8 19.6 21 22.5Z"
        fill="#0B1F3A"
      />
      {/* Broad shoulders + collar */}
      <path
        d="M11 60C11.8 46.8 20.5 39.5 32 39.5C43.5 39.5 52.2 46.8 53 60H11Z"
        fill="#143258"
      />
      <path d="M27.5 39.8L32 45.5L36.5 39.8" stroke="#E8EFF8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FemaleDefaultSvg() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="w-full h-full">
      <rect width="64" height="64" fill="#F8ECEF" />
      {/* Back hair silhouette */}
      <path
        d="M19.5 27.5C19.5 17 24.8 11.5 32 11.5C39.2 11.5 44.5 17 44.5 27.5C44.5 33.5 46 37.8 43 40.5H21C18 37.8 19.5 33.5 19.5 27.5Z"
        fill="#6D2842"
      />
      {/* Head */}
      <circle cx="32" cy="24.5" r="9.8" fill="#8C3757" />
      {/* Front fringe curve */}
      <path
        d="M22.2 23.2C23.5 18 27.2 15.2 32 15.2C36.8 15.2 40.5 18 41.8 23.2C39.2 20.5 36.1 19.3 32 19.3C27.9 19.3 24.8 20.5 22.2 23.2Z"
        fill="#5A1F36"
      />
      {/* Shoulders */}
      <path
        d="M13 60C14 47.4 21.8 40.2 32 40.2C42.2 40.2 50 47.4 51 60H13Z"
        fill="#8C3757"
      />
      <path d="M27 40.6C28.5 43.4 30.2 44.6 32 44.6C33.8 44.6 35.5 43.4 37 40.6" stroke="#F8ECEF" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

function NeutralDefaultSvg() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="w-full h-full">
      <rect width="64" height="64" fill="#EDF2F7" />
      <circle cx="32" cy="24.5" r="10.5" fill="#475569" />
      <path
        d="M12.5 60C13.6 47.2 21.5 40 32 40C42.5 40 50.4 47.2 51.5 60H12.5Z"
        fill="#334155"
      />
    </svg>
  );
}

/**
 * Single reusable StudentAvatar component displayed consistently everywhere student identity appears.
 * Priority:
 *   1. Validated uploaded student photograph
 *   2. Gender-based default vector avatar (male -> MaleDefaultSvg, female -> FemaleDefaultSvg, other/unknown -> NeutralDefaultSvg)
 */
export function StudentAvatar({
  name = 'Student',
  photoUrl,
  gender,
  size = 'md',
  shape = 'circle',
  className = '',
  ring = false,
}: StudentAvatarProps) {
  const safeSrc = getSafeAvatarSrc(photoUrl);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [safeSrc]);

  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
  const ringClass = ring
    ? 'ring-2 ring-white dark:ring-slate-900 shadow-sm'
    : 'border border-slate-200/80 dark:border-slate-700/80';

  const showPhoto = Boolean(safeSrc && !imgFailed);

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800 select-none ${SIZE_CLASSES[size]} ${shapeClass} ${ringClass} ${className}`}
      title={name}
    >
      {showPhoto ? (
        <img
          src={safeSrc!}
          alt={`${name} profile`}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover object-center block"
        />
      ) : gender === 'male' ? (
        <MaleDefaultSvg />
      ) : gender === 'female' ? (
        <FemaleDefaultSvg />
      ) : (
        <NeutralDefaultSvg />
      )}
    </div>
  );
}
