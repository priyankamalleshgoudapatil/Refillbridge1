import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignInPage from './SignInPage';
import { renderRoute, resetMockState } from './test-utils';

const setup = (entry = '/sign-in') => renderRoute({ path: '/sign-in', element: <SignInPage />, initialEntry: entry });

beforeEach(() => resetMockState());

describe('SignInPage', () => {
  it('renders the form', () => {
    setup();
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password');
  });

  it('shows validation errors on empty submit', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('shows a generic error for a wrong password', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(/^email/i), 'staff@lakeside.example.com');
    await user.type(screen.getByLabelText(/^password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    setup();
    const pw = screen.getByLabelText(/^password/i);
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(pw).toHaveAttribute('type', 'text');
  });

  it('fills the form when a demo account is clicked', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /jordan ellis/i }));
    expect(screen.getByLabelText(/^email/i)).toHaveValue('staff@lakeside.example.com');
    expect(screen.getByLabelText(/^password/i)).toHaveValue('Refill!2026');
  });

  it('signs staff in and navigates to the queue', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText(/^email/i), 'staff@lakeside.example.com');
    await user.type(screen.getByLabelText(/^password/i), 'Refill!2026');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/queue'));
  });

  it('sends MFA roles to the MFA step and keeps next', async () => {
    const user = userEvent.setup();
    setup('/sign-in?next=%2Fanalytics');
    await user.type(screen.getByLabelText(/^email/i), 'dr.rao@lakeside.example.com');
    await user.type(screen.getByLabelText(/^password/i), 'Refill!2026');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/mfa?next=%2Fanalytics&mode=verify'));
  });

  it('shows banner messages from query params', () => {
    setup('/sign-in?reason=idle');
    expect(screen.getByText('You were signed out after 15 minutes of inactivity.')).toBeInTheDocument();
  });
});
