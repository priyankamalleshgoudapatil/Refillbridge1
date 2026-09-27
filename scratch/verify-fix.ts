import { buildSeededEngine } from '../src/services/mock/seed';
import { syncFromSupabase } from '../src/services/real/supabase-sync';
import { mockRefillService } from '../src/services/mock/mock-service';
import { setEngine } from '../src/services/mock/backend';
import { authService } from '../src/services';

async function check() {
  const eng = buildSeededEngine();
  setEngine(eng);
  authService.devSwitchUser('jordan', 'aal2');
  console.log('Before sync: total cases =', eng.db.cases.length);
  await syncFromSupabase(eng);
  console.log('After sync: total cases =', eng.db.cases.length);
  
  // Check duplicates in DB
  const caseNumbers = eng.db.cases.map(c => c.caseNumber);
  const duplicates = caseNumbers.filter((item, index) => caseNumbers.indexOf(item) !== index);
  console.log('Duplicate caseNumbers in eng.db.cases:', duplicates);

  // Check listCases
  const list = await mockRefillService.listCases({ status: 'OPEN', limit: 50 });
  console.log('Open cases returned in listCases:', list.data.length);
  const openNumbers = list.data.map(c => c.caseNumber);
  const openDupes = openNumbers.filter((item, index) => openNumbers.indexOf(item) !== index);
  console.log('Duplicate open cases in listCases:', openDupes);

  // Check cases from user screenshot:
  const rb1027 = list.data.filter(c => c.caseNumber === 'RB-1027');
  console.log('RB-1027 count:', rb1027.length, '| Patient:', rb1027[0]?.patientName, '| Next action:', rb1027[0]?.nextAction);
  
  const rb1022 = list.data.filter(c => c.caseNumber === 'RB-1022');
  console.log('RB-1022 count:', rb1022.length, '| Patient:', rb1022[0]?.patientName, '| Next action:', rb1022[0]?.nextAction);
  
  const rb1011 = list.data.filter(c => c.caseNumber === 'RB-1011');
  console.log('RB-1011 count:', rb1011.length, '| Patient:', rb1011[0]?.patientName, '| Next action:', rb1011[0]?.nextAction);

  authService.devSwitchUser('admin', 'aal2');
  // Check Analytics North Star
  const analytics = await mockRefillService.getAnalyticsSummary({ from: '2026-08-01', to: '2026-09-28' });
  console.log('North Star metric:', analytics.northStarPct + '%');
}
check();
