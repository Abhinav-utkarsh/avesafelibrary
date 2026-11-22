import { MessageCircle } from 'lucide-react';
import { buildWhatsAppUrl } from '../../lib/whatsapp';

interface WhatsAppButtonProps {
  phone?: string | null;
  message?: string;
  label?: string;
  title?: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'solid' | 'outline';
  className?: string;
}

/**
 * Renders a direct WhatsApp chat anchor redirecting to that student's WhatsApp conversation.
 * Uses a standard external anchor tag (avoiding window.open) with safe rel attributes.
 */
export function WhatsAppButton({
  phone,
  message,
  label = 'WhatsApp',
  title,
  size = 'sm',
  variant = 'solid',
  className = '',
}: WhatsAppButtonProps) {
  const href = buildWhatsAppUrl(phone, message);

  const sizeClasses =
    size === 'xs'
      ? 'min-h-[30px] px-2.5 py-1 text-[11px] gap-1.5 rounded-lg'
      : size === 'md'
        ? 'min-h-[40px] px-4 py-2 text-xs gap-2 rounded-xl'
        : 'min-h-[34px] px-3 py-1.5 text-xs gap-1.5 rounded-xl';

  const variantClasses =
    variant === 'outline'
      ? 'border border-emerald-600/40 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 dark:hover:text-white'
      : 'bg-[#16A34A] hover:bg-[#15803D] text-white shadow-xs';

  if (!href) {
    return (
      <span
        title="Valid student phone number not available"
        className={`inline-flex items-center justify-center font-semibold whitespace-nowrap shrink-0 opacity-45 cursor-not-allowed border border-slate-200 dark:border-slate-700 text-slate-400 ${sizeClasses} ${className}`}
      >
        <MessageCircle className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        {label && <span>{label}</span>}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title || `Chat with student on WhatsApp (${phone})`}
      className={`inline-flex items-center justify-center font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${sizeClasses} ${variantClasses} ${className}`}
    >
      <MessageCircle className={size === 'xs' ? 'w-3 h-3 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
      {label && <span>{label}</span>}
    </a>
  );
}
