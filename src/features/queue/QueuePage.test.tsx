import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoutes, setupDemo } from '@/test/render';
import QueuePage from './QueuePage';

const routes = [
  { path: '/queue', element: <QueuePage /> },
  { path: '/cases/:caseId', element: <div>Case page</div> },
];

afterEach(() => window.history.pushState({}, '', '/'));

describe('Refill queue', () => {
  it('lists open cases with KPI tiles', async () => {
    setupDemo('jordan');
    renderRoutes(routes, '/queue');
    expect((await screen.findAllByText('Manjunath Rao')).length).toBeGreaterThan(0);
    expect(screen.getByText('Open cases')).toBeInTheDocument();
    expect(screen.getByText('Urgent (≤ 2 days supply)')).toBeInTheDocument();
  });

  it('reads filters from the URL (deep link)', async () => {
    setupDemo('jordan');
    renderRoutes(routes, '/queue?status=NEEDS_PATIENT_MATCH');
    expect((await screen.findAllByText('Harshitha Gowda')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Manjunath Rao')).not.toBeInTheDocument();
  });

  it('shows the no-match empty state and clears filters', async () => {
    setupDemo('jordan');
    const user = userEvent.setup();
    renderRoutes(routes, '/queue?q=zzzz-nobody');
    expect(await screen.findByText('No cases match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.queryByText('No cases match')).not.toBeInTheDocument());
  });

  it('shows the empty state for a practice with no open refills', async () => {
    setupDemo('jordan');
    window.history.pushState({}, '', '/?mockEmpty=listCases');
    renderRoutes(routes, '/queue');
    expect(await screen.findByText('No open refills')).toBeInTheDocument();
  });

  it('claims an unassigned case', async () => {
    const eng = setupDemo('jordan');
    const user = userEvent.setup();
    renderRoutes(routes, '/queue?status=NEEDS_PATIENT_MATCH');
    const buttons = await screen.findAllByRole('button', { name: /Claim/ });
    await user.click(buttons[0]);
    await waitFor(() => expect(eng.db.cases.some((c) => c.status === 'NEEDS_PATIENT_MATCH' && c.ownerUserId === 'u-jordan')).toBe(true));
  });
});
