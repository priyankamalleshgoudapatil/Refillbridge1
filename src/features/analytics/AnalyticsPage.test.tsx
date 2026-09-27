import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoute, resetMockAndSignIn } from '@/features/settings/test-utils';
import AnalyticsPage from './AnalyticsPage';

describe('AnalyticsPage', () => {
  beforeEach(() => resetMockAndSignIn('admin', 'aal2'));
  afterEach(() => window.history.pushState({}, '', '/'));

  it('renders the North Star and KPI tiles with units for a practice admin', async () => {
    renderRoute(<AnalyticsPage />, { path: '/analytics' });

    expect(await screen.findByText(/stuck refills resolved/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /refill performance/i })).toBeInTheDocument();

    const tiles = screen.getByRole('list', { name: /key metrics/i });
    expect(within(tiles).getByText(/median time to pharmacy confirmation/i)).toBeInTheDocument();
    expect(within(tiles).getByText(/touches per refill/i)).toBeInTheDocument();
    expect(within(tiles).getByText(/info-request round trips/i)).toBeInTheDocument();
    expect(within(tiles).getByText(/sla breach rate/i)).toBeInTheDocument();
    expect(within(tiles).getByText(/ai suggestion acceptance/i)).toBeInTheDocument();
    expect(within(tiles).getByText(/open vs resolved/i)).toBeInTheDocument();
    // Units are rendered next to values
    expect(within(tiles).getAllByText('h').length).toBeGreaterThan(0);
    expect(within(tiles).getAllByText('%').length).toBeGreaterThanOrEqual(2);

    // Charts have accessible names and a text alternative
    expect(screen.getByRole('figure', { name: /resolved per week/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /resolved per week/i })).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: /top blockers/i })).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: /cases by status/i })).toBeInTheDocument();
    expect(screen.getAllByText('CityCare Pharmacy').length).toBeGreaterThan(0);
  });

  it('shows the week tooltip on hover', async () => {
    const user = userEvent.setup();
    renderRoute(<AnalyticsPage />, { path: '/analytics' });
    await screen.findByText(/stuck refills resolved/i);
    const columns = screen.getAllByRole('img', { name: /resolved,.*within 48 hours/i });
    expect(columns).toHaveLength(8);
    await user.hover(columns[2]);
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });

  it('shows the empty state with a CTA when there is no data', async () => {
    window.history.pushState({}, '', '/analytics?mockEmpty=getAnalyticsSummary');
    renderRoute(<AnalyticsPage />, { path: '/analytics' });

    expect(await screen.findByText('No data yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /invite your pharmacy/i })).toHaveAttribute('href', '/settings/pharmacies');
  });

  it('shows an error state with retry', async () => {
    window.history.pushState({}, '', '/analytics?mockError=getAnalyticsSummary');
    renderRoute(<AnalyticsPage />, { path: '/analytics' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load analytics/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('uses pharmacy copy for a pharmacy admin', async () => {
    resetMockAndSignIn('lena', 'aal2');
    renderRoute(<AnalyticsPage />, { path: '/analytics' });
    expect(await screen.findByText(/requests you submitted/i)).toBeInTheDocument();
  });
});
