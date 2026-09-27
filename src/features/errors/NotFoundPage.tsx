import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Compass } from 'lucide-react';
import { homeRouteFor } from '@shared/domain/permissions.ts';
import { useAuth } from '@/app/auth-context';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Layout';

export default function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="hero-backdrop relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="window-light pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <Link to="/" className="absolute left-6 top-6">
        <Logo />
      </Link>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-[var(--shadow-soft)]">
          <Compass className="size-8 animate-float" aria-hidden />
        </div>
        <p className="font-mono text-sm text-brand-600">404</p>
        <h1 className="mt-2 text-4xl font-light text-brand-900 sm:text-5xl">
          This page <span className="font-bold">isn't here</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-ink-500">The link may be old, or the record belongs to another organisation.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to={user ? homeRouteFor(user.role) : '/'}>
            <Button size="lg">{user ? 'Back to my work' : 'Go to homepage'}</Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
