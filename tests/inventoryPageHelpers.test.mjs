import {
  normalizeInventorySearchText,
  inventoryRowMatchesSearch,
  getInventoryStatus,
  getInventoryCategoryKey,
  calculateInventoryDashboard,
} from '../src/ui/inventoryPage.js';

if (normalizeInventorySearchText('  Process   Pipe ') !== 'process pipe') {
  throw new Error('normalizeInventorySearchText failed');
}

const processPipe = { material: 'A106', desc: 'Process Pipe spool', trace: '1510481', status: 'available', category: 'Pipe', length: 6000, heat: 'H1' };
const structureBeam = { material: 'A36', desc: 'Structure Beam', trace: '', status: 'reserved', type: 'Beam', length: 3000, heat: '' };

if (!inventoryRowMatchesSearch(processPipe, 'Process Pipe')) throw new Error('Token search should match all tokens');
if (inventoryRowMatchesSearch(structureBeam, 'Process Pipe')) throw new Error('Token search matched missing token');
if (!inventoryRowMatchesSearch(processPipe, 'A106 1510481')) throw new Error('Search should match material and trace tokens');

if (getInventoryStatus({}) !== 'available') throw new Error('Missing status should default to available');
if (getInventoryStatus({ status: 'reserved' }) !== 'reserved') throw new Error('Reserved status mapping failed');
if (getInventoryCategoryKey({ type: 'Plate' }) !== 'Plate') throw new Error('Category fallback failed');
if (getInventoryCategoryKey({}) !== 'Uncategorized') throw new Error('Uncategorized fallback failed');

const dashboard = calculateInventoryDashboard([processPipe, structureBeam]);
if (dashboard.total !== 2) throw new Error('Dashboard total failed');
if (dashboard.available !== 1) throw new Error('Dashboard available failed');
if (dashboard.reserved !== 1) throw new Error('Dashboard reserved failed');
if (dashboard.missingTraceability !== 1) throw new Error('Dashboard missing traceability failed');
if (dashboard.missingHeat !== 1) throw new Error('Dashboard missing heat failed');
if (dashboard.availableLength !== 6000) throw new Error('Dashboard available length failed');

console.log('inventoryPage helper tests passed');
