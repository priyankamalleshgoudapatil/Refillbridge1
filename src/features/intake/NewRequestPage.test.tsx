import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoutes, setupDemo } from '@/test/render';
import NewRequestPage from './NewRequestPage';

const routes = [
  { path: '/pharmacy/requests/new', element: <NewRequestPage /> },
  { path: '/cases/:caseId', element: <div>Case page</div> },
];

afterEach(() => window.history.pushState({}, '', '/'));

describe('Pharmacy intake (fax → AI → confirm → send)', () => {
  it('the magic moment: sample fax is read, sent, and lands with the provider as urgent', async () => {
    const eng = setupDemo('omar');
    const user = userEvent.setup();
    renderRoutes(routes, '/pharmacy/requests/new');
    await user.click(await screen.findByRole('button', { name: 'Use sample fax' }));
    await user.click(screen.getByRole('button', { name: /Read fax with AI/ }));
    expect(await screen.findByDisplayValue('Maria')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1000 mg')).toBeInTheDocument();
    // Sig is extracted at 70% confidence → must be confirmed individually.
    const send = screen.getByRole('button', { name: /Send request/ });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Please confirm this field/ }));
    await user.click(send);
    expect(await screen.findByText(/sent$/)).toBeInTheDocument();
    const created = eng.db.cases[eng.db.cases.length - 1];
    expect(created.status).toBe('WAITING_ON_PROVIDER');
    expect(created.priority).toBe('URGENT');
    expect(created.blockers.map((b) => b.code)).toEqual(expect.arrayContaining(['NO_REFILLS_REMAINING', 'CLINICAL_REVIEW']));
  });

  it('AI down → falls back to manual entry with the fax alongside', async () => {
    setupDemo('omar');
    window.history.pushState({}, '', '/?mockError=extractIntake');
    const user = userEvent.setup();
    renderRoutes(routes, '/pharmacy/requests/new');
    await user.click(await screen.findByRole('button', { name: 'Use sample fax' }));
    await user.click(screen.getByRole('button', { name: /Read fax with AI/ }));
    expect(await screen.findByText(/Auto-fill unavailable; please type the details./)).toBeInTheDocument();
    expect(screen.getByText('Original fax')).toBeInTheDocument();
  });

  it('flags suspicious instructions in a fax', async () => {
    setupDemo('grace');
    const user = userEvent.setup();
    renderRoutes(routes, '/pharmacy/requests/new');
    await user.click(await screen.findByRole('button', { name: 'Suspicious sample' }));
    await user.click(screen.getByRole('button', { name: /Read fax with AI/ }));
    expect(await screen.findByText(/This document contains unusual instructions/)).toBeInTheDocument();
  });

  it('manual form validates required fields', async () => {
    setupDemo('omar');
    const user = userEvent.setup();
    renderRoutes(routes, '/pharmacy/requests/new');
    await user.click(await screen.findByRole('tab', { name: /Type the details/ }));
    await user.click(screen.getByRole('button', { name: /Send request/ }));
    await waitFor(() => expect(screen.getAllByText('Required').length).toBeGreaterThan(2));
  });
});
