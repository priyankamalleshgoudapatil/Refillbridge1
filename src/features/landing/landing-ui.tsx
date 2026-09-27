import type { ReactNode } from 'react';
import { motion, type Variants } from 'motion/react';
import { cn } from '@/lib/format';

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger = (gap = 0.08, delay = 0): Variants => ({ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } });

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600', className)}>{children}</p>;
}

/** Section header: eyebrow + light/bold heading + lede, revealed once when scrolled into view. */
export function SectionHeading({ eyebrow, light, bold, lede, id, align = 'left' }: { eyebrow: string; light: string; bold: string; lede?: ReactNode; id?: string; align?: 'left' | 'center' }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={stagger(0.08)}
      className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}
    >
      <motion.div variants={fadeUp}>
        <Eyebrow>{eyebrow}</Eyebrow>
      </motion.div>
      <motion.h2 variants={fadeUp} id={id} className="mt-3 text-[32px] leading-[1.1] text-brand-900 sm:text-[42px]">
        <span className="font-light">{light}</span> <span className="font-bold">{bold}</span>
      </motion.h2>
      {lede && (
        <motion.p variants={fadeUp} className="mt-4 text-[16px] leading-relaxed text-ink-600 sm:text-[17px]">
          {lede}
        </motion.p>
      )}
    </motion.div>
  );
}

/** Reveal-on-scroll wrapper for a group of children that use `fadeUp` variants. */
export function RevealGroup({ children, className, gap = 0.08, as = 'div' }: { children: ReactNode; className?: string; gap?: number; as?: 'div' | 'ul' | 'ol' }) {
  const Comp = as === 'ul' ? motion.ul : as === 'ol' ? motion.ol : motion.div;
  return (
    <Comp initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} variants={stagger(gap)} className={className}>
      {children}
    </Comp>
  );
}
