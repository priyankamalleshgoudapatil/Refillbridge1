import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoute, resetMockAndSignIn } from './test-utils';
import TeamPage from './TeamPage';

describe('TeamPage', () => {
  beforeEach(() => resetMockAndSignIn('admin', 'aal2'));
  afterEach(() => window.history.pushState({}, '', '/'));

  it('lists members with role and status', async () => {
    renderRoute(<TeamPage />, { path: '/settings/team' });
    expect((await screen.findAllByText('Priyanka Patil')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vinod Kumar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('staff@lakeside.example.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    // Pharmacy users are never listed in a practice team
    expect(screen.queryByText('Lakshmi Rao')).not.toBeInTheDocument();
  });

  it('invites a member and shows the demo invite link', async () => {
    const user = userEvent.setup();
    renderRoute(<TeamPage />, { path: '/settings/team' });
    await screen.findAllByText('Priyanka Patil');

    await user.click(screen.getByRole('button', { name: /invite member/i }));
    const dialog = await screen.findByRole('dialog', { name: /invite a team member/i });

    // Only practice roles are offered to a practice admin
    const role = within(dialog).getByLabelText(/role/i);
    expect(within(role).queryByRole('option', { name: /pharmacy/i })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/email/i), 'new.person@lakeside.example.com');
    await user.selectOptions(role, 'provider');
    await user.click(within(dialog).getByRole('button', { name: /create invite/i }));

    const link = await within(dialog).findByDisplayValue(/\/accept-invite\?token=/);
    expect(link).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /copy/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/72 hours/i)).toBeInTheDocument();

    // The pending invite appears in the list
    await waitFor(() => expect(screen.getAllByText('new.person@lakeside.example.com').length).toBeGreaterThan(0));
  });

  it('validates the invite email inline', async () => {
    const user = userEvent.setup();
    renderRoute(<TeamPage />, { path: '/settings/team' });
    await screen.findAllByText('Priyanka Patil');
    await user.click(screen.getByRole('button', { name: /invite member/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/email/i), 'not-an-email');
    await user.click(within(dialog).getByRole('button', { name: /create invite/i }));
    expect(await within(dialog).findByText(/enter a valid email/i)).toBeInTheDocument();
  });

  it('surfaces the last-admin error as a toast', async () => {
    const user = userEvent.setup();
    renderRoute(<TeamPage />, { path: '/settings/team' });
    await screen.findAllByText('Priyanka Patil');
    await user.click(screen.getAllByRole('button', { name: /remove priyanka patil/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: /remove priyanka patil/i });
    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));
    expect(await screen.findByText(/needs at least one admin/i)).toBeInTheDocument();
  });

  it('shows an error state when members fail to load', async () => {
    window.history.pushState({}, '', '/settings/team?mockError=listMembers');
    renderRoute(<TeamPage />, { path: '/settings/team' });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
