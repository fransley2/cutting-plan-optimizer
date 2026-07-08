export const STOCK_COLUMNS = [
  { key: 'po', label: 'PO', type: 'text', width: '120px' },
  { key: 'item', label: 'Item', type: 'text', width: '90px' },
  { key: 'qty', label: 'Qty', type: 'number', isInt: true, default: 1, width: '72px' },
  { key: 'length', label: 'Length (mm)', type: 'number', width: '120px' },
  { key: 'materialGrade', label: 'Material', type: 'text', width: '150px', list: 'materials-catalog-list' },
  { key: 'heatNumber', label: 'Heat Number', type: 'text', width: '130px' },
  { key: 'description', label: 'Description', type: 'text', width: '300px' },
  { key: 'traceability', label: 'Traceability', type: 'text', width: '180px' },
];

export const PARTS_COLUMNS = [
  { key: 'dwgNumber', label: 'DWG Number', type: 'text', width: '190px' },
  { key: 'mark', label: 'Mark', type: 'text', width: '120px' },
  { key: 'pos', label: 'POS', type: 'text', width: '90px' },
  { key: 'qty', label: 'Qty', type: 'number', isInt: true, default: 1, width: '72px' },
  { key: 'length', label: 'Cut L. (mm)', type: 'number', width: '130px' },
  { key: 'material', label: 'Material', type: 'text', width: '150px', list: 'materials-catalog-list' },
  {
    key: 'priority', label: 'Priority', type: 'select', default: '2',
    options: [{ value: '1', label: '1 (High)' }, { value: '2', label: '2 (Medium)' }, { value: '3', label: '3 (Low)' }],
  },
];
