import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { createQueryClient } from '@/app/query-client';
import { router } from '@/app/router';
import { ToastProvider } from '@/components/ui/Toast';
import { startWorkers } from '@/services/mock/backend';
import './index.css';

const queryClient = createQueryClient();
startWorkers(); // mock pg_cron: outbox + SLA workers

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </QueryClientProvider>
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
);
