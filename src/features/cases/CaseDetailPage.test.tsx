import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoutes, setupDemo } from '@/test/render';
import CaseDetailPage from './CaseDetailPage';

const routes = [{ path: '/cases/:caseId', element: <CaseDetailPage /> }];

afterEach(() => window.history.pushState({}, '', '/'));

describe('CaseDetailPage — practice view', () => {
  it('shows the diagnosis panel, blockers with rule IDs and the timeline', async () => {
    const eng = setupDemo('jordan');
    renderRoutes(routes, `/cases/${eng.seedKeys.c3}`);
    expect(await screen.findByRole('heading', { name: /William Wilson/ })).toBeInTheDocument();
    expect(await screen.findByText('Why is this stuck?')).toBeInTheDocument();
    expect((await screen.findAllByText('No refills remaining')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('R6').length).toBeGreaterThan(0);
    expect(await screen.findByLabelText(/Case timeline/)).toBeInTheDocument();
  });

  it('staff cannot decide — they are told only providers can', async () => {
    const eng = setupDemo('jordan');
    renderRoutes(routes, `/cases/${eng.seedKeys.c1}`);
    expect(await screen.findByText('Why is this stuck?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review & decide/ })).not.toBeInTheDocument();
  });

  it('warns about prompt injection in a fax', async () => {
    const eng = setupDemo('jordan');
    renderRoutes(routes, `/cases/${eng.seedKeys.c28}`);
    expect(await screen.findByText(/This document contains unusual instructions/)).toBeInTheDocument();
  });

  it('shows conflicting values side by side', async () => {
    const eng = setupDemo('jordan');
    renderRoutes(routes, `/cases/${eng.seedKeys.c11}`);
    const panel = await screen.findByRole('region', { name: /Conflicting information/ });
    expect(within(panel).getByText('Refills remaining')).toBeInTheDocument();
  });

  it('returns a case to the pharmacy after confirmation (R10)', async () => {
    const eng = setupDemo('jordan');
    const user = userEvent.setup();
    renderRoutes(routes, `/cases/${eng.seedKeys.c8}`);
    await user.click(await screen.findByRole('button', { name: /Return to pharmacy/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Return to pharmacy/ }));
    await waitFor(() => expect(eng.db.cases.find((c) => c.id === eng.seedKeys.c8)?.status).toBe('CLOSED'));
  });

  it('adds an internal note optimistically', async () => {
    const eng = setupDemo('jordan');
    const user = userEvent.setup();
    renderRoutes(routes, `/cases/${eng.seedKeys.c1}`);
    await user.click(await screen.findByRole('tab', { name: /Notes/ }));
    await user.type(screen.getByLabelText('Internal note'), 'Left voicemail for patient');
    await user.click(screen.getByRole('button', { name: /Add note/ }));
    expect(await screen.findByText('Left voicemail for patient')).toBeInTheDocument();
  });

  it('shows an error state with retry when the API fails', async () => {
    const eng = setupDemo('jordan');
    window.history.pushState({}, '', '/?mockError=getCase');
    renderRoutes(routes, `/cases/${eng.seedKeys.c1}`);
    expect(await screen.findByText(/Couldn't load this case/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

describe('CaseDetailPage — pharmacy view & isolation', () => {
  it('CityCare sees a minimum-necessary view with initials only', async () => {
    const eng = setupDemo('omar');
    renderRoutes(routes, `/cases/${eng.seedKeys.c16}`);
    expect(await screen.findByText('A.P.')).toBeInTheDocument();
    expect(screen.queryByText(/Aisha/)).not.toBeInTheDocument();
    expect(screen.queryByText('Why is this stuck?')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Confirm receipt/ })).toBeInTheDocument();
  });

  it('GreenLeaf gets "Case not found" for a CityCare case', async () => {
    const eng = setupDemo('grace');
    renderRoutes(routes, `/cases/${eng.seedKeys.c16}`);
    expect(await screen.findByText('Case not found')).toBeInTheDocument();
  });

  it('pharmacy confirms receipt', async () => {
    const eng = setupDemo('omar');
    const user = userEvent.setup();
    renderRoutes(routes, `/cases/${eng.seedKeys.c16}`);
    await user.click(await screen.findByRole('button', { name: /Confirm receipt/ }));
    await waitFor(() => expect(eng.db.cases.find((c) => c.id === eng.seedKeys.c16)?.status).toBe('PHARMACY_CONFIRMED'));
  });
});
