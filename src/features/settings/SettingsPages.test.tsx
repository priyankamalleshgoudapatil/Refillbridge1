import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router-dom';
import { renderRoute, resetMockAndSignIn } from './test-utils';
import AuditLogPage from './AuditLogPage';
import PharmaciesPage from './PharmaciesPage';
import PoliciesPage from './PoliciesPage';
import ProfilePage from './ProfilePage';
import SettingsLayout from './SettingsLayout';

const settingsChildren = [
  { path: 'profile', element: <ProfilePage /> },
  { path: 'policies', element: <PoliciesPage /> },
];

describe('SettingsLayout', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  it('redirects /settings to the profile tab and shows every admin tab', async () => {
    resetMockAndSignIn('admin', 'aal2');
    const { router } = renderRoute(<SettingsLayout />, { path: '/settings', children: settingsChildren });
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/profile'));
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    for (const name of ['Profile', 'Team', 'Pharmacies', 'Policies', 'Audit log']) expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows only Profile to staff, and Practices (no Policies) to a pharmacy admin', async () => {
    resetMockAndSignIn('jordan', 'aal1');
    const first = renderRoute(<SettingsLayout />, { path: '/settings', initialEntry: '/settings/profile', children: settingsChildren });
    const nav = await screen.findByRole('navigation', { name: 'Settings' });
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    first.unmount();

    resetMockAndSignIn('lena', 'aal2');
    renderRoute(<SettingsLayout />, { path: '/settings', initialEntry: '/settings/profile', children: settingsChildren });
    const nav2 = await screen.findByRole('navigation', { name: 'Settings' });
    expect(within(nav2).getByRole('link', { name: 'Practices' })).toBeInTheDocument();
    expect(within(nav2).queryByRole('link', { name: 'Policies' })).not.toBeInTheDocument();
  });
});

describe('ProfilePage', () => {
  beforeEach(() => resetMockAndSignIn('admin', 'aal2'));

  it('shows account details and MFA status', () => {
    renderRoute(<ProfilePage />, { path: '/settings/profile' });
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Practice admin')).toBeInTheDocument();
    expect(screen.getByText(/enabled — verified this session/i)).toBeInTheDocument();
    expect(screen.getByText(/15 minutes idle or 12 hours total/i)).toBeInTheDocument();
  });

  it('updates the password checklist live and changes the password', async () => {
    const user = userEvent.setup();
    renderRoute(<ProfilePage />, { path: '/settings/profile' });
    const rules = screen.getByRole('list', { name: /password requirements/i });
    expect(within(rules).getByText('At least 8 characters')).toHaveTextContent('(not met)');

    await user.type(screen.getByLabelText(/current password/i), 'wrong-password');
    await user.type(screen.getByLabelText(/^new password/i), 'Brand-new-pass-42');
    expect(within(rules).getByText('At least 8 characters')).toHaveTextContent('(met)');
    await user.type(screen.getByLabelText(/confirm new password/i), 'Brand-new-pass-42');
    await user.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });
});

describe('PharmaciesPage', () => {
  beforeEach(() => resetMockAndSignIn('admin', 'aal2'));
  afterEach(() => window.history.pushState({}, '', '/'));

  it('lists linked pharmacies and invites a new one as pending', async () => {
    const user = userEvent.setup();
    renderRoute(<PharmaciesPage />, { path: '/settings/pharmacies' });
    expect(await screen.findByText('CityCare Pharmacy')).toBeInTheDocument();
    expect(screen.getByText(/join free and can only send requests to practices they're linked with/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /invite a pharmacy/i }));
    const dialog = await screen.findByRole('dialog', { name: /invite a pharmacy/i });
    await user.type(within(dialog).getByLabelText(/pharmacy name/i), 'Northside Drugs');
    await user.type(within(dialog).getByLabelText(/email/i), 'rx@northside.example.com');
    await user.click(within(dialog).getByRole('button', { name: /send invite/i }));

    expect(await screen.findByText('Northside Drugs')).toBeInTheDocument();
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });

  it('shows the empty state', async () => {
    window.history.pushState({}, '', '/settings/pharmacies?mockEmpty=listPharmacyLinks');
    renderRoute(<PharmaciesPage />, { path: '/settings/pharmacies' });
    expect(await screen.findByText(/no linked pharmacies yet/i)).toBeInTheDocument();
  });
});

describe('PoliciesPage', () => {
  beforeEach(() => resetMockAndSignIn('admin', 'aal2'));

  it('prefills, validates on blur, and saves', async () => {
    const user = userEvent.setup();
    renderRoute(<PoliciesPage />, { path: '/settings/policies' });
    expect(screen.getByText(/placeholders set by your practice, not clinical advice/i)).toBeInTheDocument();

    const bridge = await screen.findByLabelText(/max bridge supply/i);
    expect(bridge).not.toHaveValue(null);
    const save = screen.getByRole('button', { name: /save policies/i });
    expect(save).toBeDisabled();

    await user.clear(bridge);
    await user.type(bridge, '500');
    await user.tab();
    expect(await screen.findByText(/must be at most 90/i)).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.clear(bridge);
    await user.type(bridge, '10');
    await user.tab();
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    expect(await screen.findByText('Policies saved')).toBeInTheDocument();
    await waitFor(() => expect(save).toBeDisabled());
  });

  it('asks before leaving with unsaved changes', async () => {
    const user = userEvent.setup();
    renderRoute(
      <>
        <Link to="/elsewhere">Leave</Link>
        <PoliciesPage />
      </>,
      { path: '/settings/policies', extraRoutes: [{ path: '/elsewhere', element: <p>Elsewhere</p> }] },
    );
    const bridge = await screen.findByLabelText(/max bridge supply/i);
    await user.clear(bridge);
    await user.type(bridge, '12');
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    const dialog = await screen.findByRole('dialog', { name: /discard changes/i });
    await user.click(within(dialog).getByRole('button', { name: /discard changes/i }));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
  });
});

describe('AuditLogPage', () => {
  beforeEach(() => resetMockAndSignIn('admin', 'aal2'));

  it('shows the append-only note, entries and filters by action', async () => {
    const user = userEvent.setup();
    renderRoute(<AuditLogPage />, { path: '/settings/audit' });
    expect(screen.getByText(/append-only\. every view of patient data is recorded/i)).toBeInTheDocument();
    expect((await screen.findAllByText('auth.dev_switch')).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText(/filter by action/i), 'zzz-nothing');
    expect(await screen.findByText(/no matching entries/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear filter/i }));
    expect((await screen.findAllByText('auth.dev_switch')).length).toBeGreaterThan(0);
  });
});
