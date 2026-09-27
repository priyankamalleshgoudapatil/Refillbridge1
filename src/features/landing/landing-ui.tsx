import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type ElementType, forwardRef, type MutableRefObject, type HTMLAttributes } from 'react';
import { cn } from '@/lib/format';

export interface RevealContextValue {
  inView: boolean;
}

const RevealContext = createContext<RevealContextValue | undefined>(undefined);

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600', className)}>{children}</p>;
}

export function useInView(options: IntersectionObserverInit = { threshold: 0.2, rootMargin: '0px 0px -10% 0px' }) {
  const ref = useRef<HTMLElement | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        observer.unobserve(el);
      }
    }, options);

    observer.observe(el);
    return () => observer.disconnect();
  }, [options.threshold, options.rootMargin]);

  return { ref, isInView };
}

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  delay?: number;
  variant?: 'fade-up' | 'scale' | 'fade';
  inViewOverride?: boolean;
}

export const Reveal = forwardRef<HTMLElement, RevealProps>(
  ({ children, className, as: Comp = 'div', delay = 0, variant = 'fade-up', inViewOverride, ...props }, forwardedRef) => {
    const context = useContext(RevealContext);
    const { ref, isInView } = useInView();
    
    const active = inViewOverride !== undefined ? inViewOverride : (context !== undefined ? context.inView : isInView);
    
    const variantKey = (variant || 'fade-up') as 'fade-up' | 'scale' | 'fade';
    const variantClasses = {
      'fade-up': active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
      'scale': active ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4',
      'fade': active ? 'opacity-100' : 'opacity-0',
    }[variantKey];

    return (
      <Comp
        ref={(node: HTMLElement | null) => {
          if (context === undefined && inViewOverride === undefined) ref.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) (forwardedRef as MutableRefObject<HTMLElement | null>).current = node;
        }}
        className={cn('transition-all duration-[600ms] ease-out will-change-[transform,opacity]', variantClasses, className)}
        style={delay ? { transitionDelay: `${delay}ms` } : undefined}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);

export interface RevealSectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  inViewOverride?: boolean;
  id?: string;
  'aria-labelledby'?: string;
}

export const RevealSection = forwardRef<HTMLElement, RevealSectionProps>(
  ({ children, className, as: Comp = 'section', inViewOverride, ...props }, forwardedRef) => {
    const { ref, isInView } = useInView({ threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    const active = inViewOverride ?? isInView;

    return (
      <RevealContext.Provider value={{ inView: active }}>
        <Comp
          ref={(node: HTMLElement | null) => {
            if (!inViewOverride) ref.current = node;
            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) (forwardedRef as MutableRefObject<HTMLElement | null>).current = node;
          }}
          className={cn(
            'transition-all duration-[600ms] ease-out will-change-[transform,opacity]',
            active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
            className
          )}
          {...props}
        >
          {children}
        </Comp>
      </RevealContext.Provider>
    );
  }
);

export interface RevealGroupProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  inViewOverride?: boolean;
}

export const RevealGroup = forwardRef<HTMLElement, RevealGroupProps>(
  ({ children, className, as: Comp = 'div', inViewOverride, ...props }, forwardedRef) => {
    const parentContext = useContext(RevealContext);
    const { ref, isInView } = useInView();
    
    const active = inViewOverride !== undefined ? inViewOverride : (parentContext !== undefined ? parentContext.inView : isInView);

    return (
      <RevealContext.Provider value={{ inView: active }}>
        <Comp
          ref={(node: HTMLElement | null) => {
            if (parentContext === undefined && inViewOverride === undefined) ref.current = node;
            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) (forwardedRef as MutableRefObject<HTMLElement | null>).current = node;
          }}
          className={className}
          {...props}
        >
          {children}
        </Comp>
      </RevealContext.Provider>
    );
  }
);

export function SectionHeading({ eyebrow, light, bold, lede, id, align = 'left' }: { eyebrow: string; light: string; bold: string; lede?: ReactNode; id?: string; align?: 'left' | 'center' }) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')} id={id}>
      <Reveal delay={0}><Eyebrow>{eyebrow}</Eyebrow></Reveal>
      <Reveal delay={80} as="h2" className="mt-3 text-[32px] leading-[1.1] text-brand-900 sm:text-[42px]">
        <span className="font-light">{light}</span> <span className="font-bold">{bold}</span>
      </Reveal>
      {lede && (
        <Reveal delay={160} as="p" className="mt-4 text-[16px] leading-relaxed text-ink-600 sm:text-[17px]">
          {lede}
        </Reveal>
      )}
    </div>
  );
}

export function AnimatedNumber({ value, format, delay = 0 }: { value: number; format: (v: number) => ReactNode; delay?: number }) {
  const context = useContext(RevealContext);
  const { ref, isInView } = useInView();
  const [displayValue, setDisplayValue] = useState(0);
  const hasAnimatedRef = useRef(false);
  const currentValueRef = useRef(0);

  const active = context !== undefined ? context.inView : isInView;

  useEffect(() => {
    if (!active) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayValue(value);
      currentValueRef.current = value;
      hasAnimatedRef.current = true;
      return;
    }

    const startVal = hasAnimatedRef.current ? currentValueRef.current : 0;
    const endVal = value;
    const duration = hasAnimatedRef.current ? 400 : 750;
    const initialDelay = hasAnimatedRef.current ? 0 : delay;

    let startTimestamp: number | null = null;
    let rafId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = timestamp - startTimestamp;
      const t = Math.min(progress / duration, 1);
      
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const current = startVal + (endVal - startVal) * ease;
      
      currentValueRef.current = current;
      setDisplayValue(current);

      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        currentValueRef.current = endVal;
        setDisplayValue(endVal);
        hasAnimatedRef.current = true;
      }
    };

    const timeoutId = setTimeout(() => {
      rafId = requestAnimationFrame(step);
    }, initialDelay);

    return () => {
      clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [active, value, delay]);

  return <span ref={context === undefined ? ref : undefined}>{format(displayValue)}</span>;
}
