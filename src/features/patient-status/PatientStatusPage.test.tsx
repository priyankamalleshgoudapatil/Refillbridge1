import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getEngine } from '@/services/mock/backend';
import { renderRoute, resetMockState } from '@/features/auth/test-utils';
import PatientStatusPage from './PatientStatusPage';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const setup = (token: string) => renderRoute({ path: '/status/:token', element: <PatientStatusPage />, initialEntry: `/status/${token}` });

function tokenWithPatient() {
  const eng = getEngine();
  const db = eng.db;
  const now = eng.now().getTime();
  for (const t of db.statusTokens) {
    if (t.lockedAt || new Date(t.expiresAt).getTime() <= now + 60_000) continue;
    const c = db.cases.find((x) => x.id === t.caseId);
    const p = c && db.patients.find((x) => x.id === c.patientId);
    if (c && p) return { token: t.token, dob: p.dob, firstName: p.firstName };
  }
  throw new Error('no unexpired status token with a matched patient in the seed');
}

async function enterDob(dob: string) {
  const user = userEvent.setup();
  const [y, m, d] = dob.split('-');
  await user.selectOptions(screen.getByLabelText('Month'), MONTHS[Number(m) - 1]);
  await user.selectOptions(screen.getByLabelText('Day'), String(Number(d)));
  await user.selectOptions(screen.getByLabelText('Year'), y);
  await user.click(screen.getByRole('button', { name: /see my update/i }));
}

beforeEach(() => resetMockState());

describe('PatientStatusPage', () => {
  it('shows nothing about the request before the DOB is verified', () => {
    const { token } = tokenWithPatient();
    setup(token);
    expect(screen.getByRole('heading', { name: /check your prescription update/i })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /progress/i })).not.toBeInTheDocument();
  });

  it('shows a friendly error for an invalid token', async () => {
    setup('not-a-real-token');
    await enterDob('1961-04-12');
    expect(await screen.findByText('This link is not valid. Please call your clinic.')).toBeInTheDocument();
  });

  it('shows attempts left for a wrong date of birth', async () => {
    const { token } = tokenWithPatient();
    setup(token);
    await enterDob('1900-01-01');
    expect(await screen.findByText(/doesn't match\. 4 attempts left/i)).toBeInTheDocument();
  });

  it('shows the tracker after the correct date of birth', async () => {
    const { token, dob, firstName } = tokenWithPatient();
    setup(token);
    await enterDob(dob);
    expect(await screen.findByRole('heading', { name: `Hi ${firstName}` })).toBeInTheDocument();
    const tracker = screen.getByRole('list', { name: /progress/i });
    expect(tracker.querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByText(/what happens next/i)).toBeInTheDocument();
    expect(screen.getByText(/never shows medication names/i)).toBeInTheDocument();
  });
});
