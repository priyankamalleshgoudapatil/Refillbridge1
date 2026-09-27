import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoutes, setupDemo } from '@/test/render';
import ProviderInboxPage from './ProviderInboxPage';

const routes = [
  { path: '/provider/inbox', element: <ProviderInboxPage /> },
  { path: '/provider/inbox/:caseId', element: <ProviderInboxPage /> },
];

describe('Provider inbox & decision panel', () => {
  it('lists cases waiting on a provider', async () => {
    setupDemo('rao');
    renderRoutes(routes, '/provider/inbox');
    const list = await screen.findByRole('list', { name: /Cases waiting on a provider/ });
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThanOrEqual(5);
  });

  it('approve → order-restating confirmation → case approved with MFA-verified decision', async () => {
    const eng = setupDemo('rao');
    const user = userEvent.setup();
    const id = eng.seedKeys.c1;
    renderRoutes(routes, `/provider/inbox/${id}`);
    await user.click(await screen.findByRole('button', { name: /Review order/ }));
    const dialog = await screen.findByRole('dialog', { name: /Confirm your decision/ });
    expect(within(dialog).getByText(/Manjunath Rao/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Lisinopril 20 mg/)).toBeInTheDocument();
    expect(within(dialog).getByText('CityCare Pharmacy')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Confirm & sign/ }));
    await waitFor(() => expect(eng.db.cases.find((c) => c.id === id)?.status).toBe('APPROVED'));
    expect(eng.db.decisions.find((d) => d.caseId === id)?.aal).toBe('aal2');
  });

  it('deny requires a reason and patient next step', async () => {
    const eng = setupDemo('rao');
    const user = userEvent.setup();
    renderRoutes(routes, `/provider/inbox/${eng.seedKeys.c1}`);
    await user.click(await screen.findByText('Do not approve'));
    await user.click(screen.getByRole('button', { name: /Review order/ }));
    expect(await screen.findByText('Choose a reason')).toBeInTheDocument();
    expect(screen.getByText('Tell the patient what to do next')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Confirm your decision/ })).not.toBeInTheDocument();
  });

  it('at aal1 the step-up MFA modal appears before the decision is saved', async () => {
    const eng = setupDemo('rao', 'aal1');
    const user = userEvent.setup();
    const id = eng.seedKeys.c2;
    renderRoutes(routes, `/provider/inbox/${id}`);
    await user.click(await screen.findByRole('button', { name: /Review order/ }));
    await user.click(within(await screen.findByRole('dialog', { name: /Confirm your decision/ })).getByRole('button', { name: /Confirm & sign/ }));
    const mfa = await screen.findByRole('dialog', { name: /Verify it's you/ });
    await user.type(within(mfa).getByLabelText('6-digit code'), '123456');
    await user.click(within(mfa).getByRole('button', { name: /Verify and continue/ }));
    await waitFor(() => expect(eng.db.cases.find((c) => c.id === id)?.status).toBe('APPROVED'));
  });
});
