import { getInventoryAvailableLength } from './materialMatching.js';

export function uniqueLinkedRecords(ids = [], records = [], getId = (item) => item?.id) { const byId=new Map((Array.isArray(records)?records:[]).filter(Boolean).map((item)=>[String(getId(item)||''),item])); const seen=new Set(); const found=[]; const missing=[]; (Array.isArray(ids)?ids:[]).forEach((id)=>{const key=String(id||'');if(!key||seen.has(key))return;seen.add(key);const record=byId.get(key);if(record)found.push(record);else missing.push(key);}); return {found,missing}; }

export function linkedInventoryForPlanner(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => getInventoryAvailableLength(item) > 0);
}
export function resolvePlannerWorkpack(workpacks = [], id, legacy = '') { const record=(Array.isArray(workpacks)?workpacks:[]).find((item)=>item?.id===id)||null; return {record, workpackId:record?.id||'', workpack:record?.wpNo||legacy||'', stale:Boolean(id&&!record)}; }
