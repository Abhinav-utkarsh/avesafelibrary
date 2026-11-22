import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUp } from 'lucide-react';

const SCROLL_THRESHOLD_PX = 350;

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const { pathname } = useLocation();
  const prefersReducedMotion = useReducedMotion();

  // Lift slightly on Student Portal mobile viewports so it never overlaps the fixed bottom tab bar
  const isStudentPortal = pathname.startsWith('/student/') && pathname !== '/student/login' && pathname !== '/student/forgot-password';

  useEffect(() => {
    const checkScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setVisible(y > SCROLL_THRESHOLD_PX);
    };

    checkScroll();
    window.addEventListener('scroll', checkScroll, { passive: true });
    return () => window.removeEventListener('scroll', checkScroll);
  }, [pathname]);

  const handleScrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={handleScrollToTop}
          aria-label="Scroll back to top"
          title="Back to top"
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.82, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82, y: 12 }}
          whileHover={prefersReducedMotion ? undefined : { scale: 1.07, y: -2 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`no-print fixed left-1/2 -translate-x-1/2 z-40 w-11 h-11 rounded-full flex items-center justify-center bg-[#0B1F3A]/90 dark:bg-slate-800/90 text-white border border-white/15 dark:border-slate-600/70 backdrop-blur-md shadow-lg shadow-[#0B1F3A]/20 dark:shadow-black/50 hover:bg-[#132E54] dark:hover:bg-sky-500 dark:hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 transition-colors cursor-pointer ${
            isStudentPortal ? 'bottom-20 md:bottom-6' : 'bottom-6'
          }`}
        >
          <ArrowUp className="w-4 h-4 stroke-[2.25]" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
