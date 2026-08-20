export const STOCK_COLUMNS = [
  { key: 'po', label: 'PO', type: 'text', width: '104px' },
  { key: 'poItem', label: 'Item', type: 'text', width: '64px' },
  { key: 'qty', label: 'Qty', type: 'number', isInt: true, default: 1, width: '60px', align: 'end' },
  { key: 'lengthMm', label: 'Length (mm)', type: 'number', width: '92px', align: 'end' },
  { key: 'materialGrade', label: 'Material', type: 'text', width: '156px', list: 'materials-catalog-list' },
  { key: 'heatNo', label: 'Heat Number', type: 'text', width: '132px' },
  { key: 'materialDescription', label: 'Description', type: 'text', width: '360px' },
  { key: 'traceability', label: 'Traceability', type: 'text', width: '180px' },
];

export const PARTS_COLUMNS = [
  { key: 'dwgNumber', label: 'DWG Number', type: 'text', width: '180px' },
  { key: 'mark', label: 'Mark', type: 'text', width: '130px' },
  { key: 'pos', label: 'POS', type: 'text', width: '92px' },
  { key: 'qty', label: 'Qty', type: 'number', isInt: true, default: 1, width: '72px', align: 'end' },
  { key: 'length', label: 'Cut L. (mm)', type: 'number', width: '136px', align: 'end' },
  { key: 'material', label: 'Material', type: 'text', width: '150px', list: 'materials-catalog-list' },
  {
    key: 'priority', label: 'Priority', type: 'select', default: '2', width: '128px',
    options: [{ value: '1', label: '1 (High)' }, { value: '2', label: '2 (Medium)' }, { value: '3', label: '3 (Low)' }],
  },
];
