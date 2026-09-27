import React, { useId } from 'react';
import styles from './CapsuleAnimation.module.css';

export interface CapsuleAnimationProps {
  /**
   * Optional custom scaling multiplier. Defaults to 1.
   * Can be used to proportionally scale the capsule up or down.
   */
  scale?: number;
  /**
   * Optional custom unit scaling string (e.g. 'clamp(2.5px, 0.75vw, 3.5px)').
   * Overrides the internal `--capsule-unit` CSS variable.
   */
  unit?: string | number;
  /** Additional CSS class names */
  className?: string;
  /** Custom inline styles */
  style?: React.CSSProperties;
}

interface ParticleSpec {
  size: number;
  tx: number;
  ty: number;
  color: string;
  glow: string;
  delay: number;
  dur: number;
  opacity: number;
}

/**
 * 28 individually tuned medicine particles matching the healthcare palette:
 * Deep Teal: #063F42, Dark Teal: #075B5C, Primary Teal: #008F8C,
 * Bright Teal: #00C9C3, Cyan: #28E6DD, Light Cyan: #A8FFF7, White: #FFFFFF
 */
const PARTICLES: readonly ParticleSpec[] = [
  // Burst stream towards left / workflow card
  { size: 8, tx: -75, ty: 15, color: '#FFFFFF', glow: 'rgba(168, 255, 247, 0.95)', delay: 0, dur: 8, opacity: 0.95 },
  { size: 6, tx: -110, ty: -10, color: '#A8FFF7', glow: 'rgba(40, 230, 221, 0.85)', delay: 0.15, dur: 8, opacity: 0.9 },
  { size: 9, tx: -95, ty: 45, color: '#28E6DD', glow: 'rgba(40, 230, 221, 0.9)', delay: 0.25, dur: 8, opacity: 0.9 },
  { size: 5, tx: -130, ty: 25, color: '#00C9C3', glow: 'rgba(0, 201, 195, 0.8)', delay: 0.35, dur: 8, opacity: 0.85 },
  { size: 7, tx: -60, ty: 75, color: '#A8FFF7', glow: 'rgba(168, 255, 247, 0.9)', delay: 0.1, dur: 8, opacity: 0.9 },
  { size: 4, tx: -145, ty: 55, color: '#FFFFFF', glow: 'rgba(255, 255, 255, 0.95)', delay: 0.4, dur: 8, opacity: 0.8 },
  { size: 6, tx: -85, ty: -45, color: '#28E6DD', glow: 'rgba(40, 230, 221, 0.85)', delay: 0.2, dur: 8, opacity: 0.85 },

  // Upward dispersal
  { size: 8, tx: -25, ty: -90, color: '#FFFFFF', glow: 'rgba(168, 255, 247, 0.95)', delay: 0.05, dur: 8, opacity: 0.95 },
  { size: 6, tx: 20, ty: -105, color: '#A8FFF7', glow: 'rgba(40, 230, 221, 0.85)', delay: 0.2, dur: 8, opacity: 0.9 },
  { size: 7, tx: -50, ty: -75, color: '#28E6DD', glow: 'rgba(40, 230, 221, 0.85)', delay: 0.3, dur: 8, opacity: 0.85 },
  { size: 4, tx: 45, ty: -85, color: '#00C9C3', glow: 'rgba(0, 201, 195, 0.8)', delay: 0.4, dur: 8, opacity: 0.8 },
  { size: 5, tx: 0, ty: -125, color: '#FFFFFF', glow: 'rgba(255, 255, 255, 0.9)', delay: 0.25, dur: 8, opacity: 0.85 },

  // Rightward dispersal
  { size: 7, tx: 80, ty: -35, color: '#A8FFF7', glow: 'rgba(168, 255, 247, 0.9)', delay: 0.1, dur: 8, opacity: 0.9 },
  { size: 9, tx: 100, ty: 10, color: '#28E6DD', glow: 'rgba(40, 230, 221, 0.9)', delay: 0.2, dur: 8, opacity: 0.9 },
  { size: 5, tx: 75, ty: 50, color: '#00C9C3', glow: 'rgba(0, 201, 195, 0.8)', delay: 0.35, dur: 8, opacity: 0.8 },
  { size: 6, tx: 115, ty: -15, color: '#FFFFFF', glow: 'rgba(255, 255, 255, 0.9)', delay: 0.3, dur: 8, opacity: 0.85 },
  { size: 4, tx: 85, ty: 85, color: '#008F8C', glow: 'rgba(0, 143, 140, 0.75)', delay: 0.45, dur: 8, opacity: 0.75 },

  // Downward dispersal
  { size: 8, tx: -15, ty: 105, color: '#A8FFF7', glow: 'rgba(168, 255, 247, 0.9)', delay: 0.15, dur: 8, opacity: 0.9 },
  { size: 6, tx: 30, ty: 115, color: '#28E6DD', glow: 'rgba(40, 230, 221, 0.85)', delay: 0.25, dur: 8, opacity: 0.85 },
  { size: 7, tx: -40, ty: 95, color: '#00C9C3', glow: 'rgba(0, 201, 195, 0.85)', delay: 0.3, dur: 8, opacity: 0.8 },
  { size: 4, tx: 10, ty: 135, color: '#FFFFFF', glow: 'rgba(255, 255, 255, 0.9)', delay: 0.4, dur: 8, opacity: 0.8 },

  // Mid-orbit core cluster (molecular float)
  { size: 7, tx: -30, ty: 5, color: '#FFFFFF', glow: 'rgba(255, 255, 255, 0.95)', delay: 0.05, dur: 8, opacity: 0.95 },
  { size: 8, tx: 25, ty: -10, color: '#A8FFF7', glow: 'rgba(168, 255, 247, 0.95)', delay: 0.1, dur: 8, opacity: 0.95 },
  { size: 6, tx: -10, ty: 30, color: '#28E6DD', glow: 'rgba(40, 230, 221, 0.9)', delay: 0.18, dur: 8, opacity: 0.9 },
  { size: 5, tx: 35, ty: 20, color: '#00C9C3', glow: 'rgba(0, 201, 195, 0.85)', delay: 0.22, dur: 8, opacity: 0.85 },
  { size: 4, tx: -35, ty: -25, color: '#FFFFFF', glow: 'rgba(255, 255, 255, 0.9)', delay: 0.28, dur: 8, opacity: 0.85 },
  { size: 5, tx: 15, ty: 45, color: '#A8FFF7', glow: 'rgba(168, 255, 247, 0.85)', delay: 0.32, dur: 8, opacity: 0.85 },
  { size: 6, tx: -45, ty: -15, color: '#28E6DD', glow: 'rgba(40, 230, 221, 0.85)', delay: 0.38, dur: 8, opacity: 0.85 },
];

/**
 * Animated 3D pharmaceutical capsule component created entirely in HTML/CSS.
 *
 * Structure:
 * Capsule container
 *   ↓
 * Upper transparent capsule half (independent DOM element, animates upward)
 *   ↓
 * Inner glow & molecular medicine core
 *   ↓
 * 28 medicine / molecular particles (disperse outward when opening)
 *   ↓
 * Lower deep-teal capsule half (independent DOM element, animates downward)
 *
 * Sequence:
 * - 0% - 20%: Capsule closed, continuous slow rotation.
 * - 20% - 35%: Capsule halves begin separating smoothly.
 * - 35% - 50%: Capsule fully open, glowing molecular core revealed.
 * - 50% - 70%: Glowing particles flow outward and float naturally.
 * - 70% - 85%: Capsule halves smoothly close back together.
 * - 85% - 100%: Capsule closed, rotation continues seamlessly.
 *
 * Fully respects `prefers-reduced-motion` and is strictly decorative (`aria-hidden="true"`).
 */
export const CapsuleAnimation: React.FC<CapsuleAnimationProps> = ({
  scale,
  unit,
  className,
  style,
}) => {
  const gradientId = useId();

  const dynamicStyle: React.CSSProperties = {
    ...style,
    ...(unit !== undefined
      ? ({
          '--capsule-unit': typeof unit === 'number' ? `${unit}px` : unit,
        } as React.CSSProperties)
      : {}),
    ...(scale !== undefined
      ? ({
          '--capsule-scale': scale.toString(),
        } as React.CSSProperties)
      : {}),
  };

  return (
    <div
      className={`${styles.capsuleWrapper}${className ? ` ${className}` : ''}`}
      style={dynamicStyle}
      aria-hidden="true"
    >
      {/* Soft radial backdrop aura */}
      <div className={styles.backdropGlow} />

      {/* Main capsule container with 3D perspective */}
      <div className={styles.capsuleContainer}>
        {/* Continuous smooth rotator */}
        <div className={styles.rotator}>
          {/* Upper transparent glass capsule half */}
          <div className={styles.capUpper}>
            <div className={styles.glassHighlight} />
            <div className={styles.glassInnerShine} />
            <div className={styles.glassRim} />
            {/* Inner glow inside the transparent chamber */}
            <div className={styles.innerGlow} />
          </div>

          {/* Medicine & molecular particles chamber */}
          <div className={styles.particleChamber}>
            {/* Molecular medicine node graphic */}
            <div className={styles.molecularCore}>
              <svg
                viewBox="0 0 100 100"
                className={styles.molecularSvg}
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id={`${gradientId}-line`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#28E6DD" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#008F8C" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
                {/* Node connection lines */}
                <line x1="50" y1="50" x2="28" y2="35" stroke={`url(#${gradientId}-line)`} strokeWidth="1.5" />
                <line x1="50" y1="50" x2="72" y2="38" stroke={`url(#${gradientId}-line)`} strokeWidth="1.5" />
                <line x1="50" y1="50" x2="42" y2="72" stroke={`url(#${gradientId}-line)`} strokeWidth="1.5" />
                <line x1="72" y1="38" x2="80" y2="62" stroke={`url(#${gradientId}-line)`} strokeWidth="1.2" />
                <line x1="28" y1="35" x2="20" y2="58" stroke={`url(#${gradientId}-line)`} strokeWidth="1.2" />
                {/* Nodes */}
                <circle cx="50" cy="50" r="4.5" fill="#FFFFFF" filter="drop-shadow(0 0 4px #28E6DD)" />
                <circle cx="28" cy="35" r="3" fill="#A8FFF7" />
                <circle cx="72" cy="38" r="3.5" fill="#28E6DD" />
                <circle cx="42" cy="72" r="3" fill="#00C9C3" />
                <circle cx="80" cy="62" r="2.5" fill="#A8FFF7" />
                <circle cx="20" cy="58" r="2.2" fill="#28E6DD" />
              </svg>
            </div>

            {/* 28 dynamic CSS particles */}
            {PARTICLES.map((p, idx) => (
              <span
                key={idx}
                className={styles.particle}
                style={
                  {
                    '--tx': `${p.tx}px`,
                    '--ty': `${p.ty}px`,
                    '--size': `${p.size}px`,
                    '--color': p.color,
                    '--glow': p.glow,
                    '--delay': `${p.delay}s`,
                    '--dur': `${p.dur}s`,
                    '--opacity': p.opacity,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>

          {/* Lower deep-teal capsule half */}
          <div className={styles.capLower}>
            <div className={styles.tealSpecular} />
            <div className={styles.collarRidge} />
            <div className={styles.baseShadow} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapsuleAnimation;
