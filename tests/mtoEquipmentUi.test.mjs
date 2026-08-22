import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [mtoSource, equipmentSource, css] = await Promise.all([
  readFile(new URL('../src/ui/mtoPage.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/ui/equipmentPage.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8'),
]);

test('MTO table exposes TAG and Equipment columns with resolution badges', () => {
  assert.match(mtoSource, /\['Identificação', 'TAG', 'Descrição', 'Equipamento', 'Qtd', 'Material', 'Status'\]/);
  assert.match(mtoSource, /Sem equipamento correspondente cadastrado/);
  assert.match(css, /\.mto-tag-badge\.success/);
  assert.match(css, /\.mto-tag-badge\.warning/);
});

test('By Equipment separates equipment type and TAG search', () => {
  assert.match(mtoSource, /renderSelect\('Tipo de equipamento'/);
  assert.match(mtoSource, /tagSearch\.placeholder = 'Ex\.: 32-WJ-10-3020'/);
  assert.match(mtoSource, /sem equipamento correspondente/);
});

test('bulk equipment linking exposes TAG, dimension, rich destination context and preselection', () => {
  assert.match(mtoSource, /item\.tag,[\s\S]*item\.description/);
  assert.match(mtoSource, /extractMtoDimension\(description\)/);
  assert.match(mtoSource, /equipment\.designDrawingNo/);
  assert.match(mtoSource, /commonResolvedEquipmentId\(modalItems, equipments\)/);
  assert.match(css, /\.mto-equipment-picker-option/);
});

test('Equipment register keeps drawing visible, catalogs all types and highlights TAG count differences', () => {
  assert.match(equipmentSource, /\.\.\.state\.equipmentTypes\.map\(\(type\) => type\.name\)/);
  assert.match(equipmentSource, /createBadge\(equipment\.equipmentType \|\| 'Tipo não informado', 'equipment-type-badge'\)/);
  assert.match(equipmentSource, /appendTextCell\(row, equipmentDesignReference\(equipment\) \|\| '-'\)/);
  assert.match(equipmentSource, /equipment-count-over/);
  assert.match(equipmentSource, /equipment-count-pending/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});
