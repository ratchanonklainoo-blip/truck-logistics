'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  FileText, Upload, Download, Trash2, Plus, RefreshCw,
  Car, FileCheck, FileMinus, ChevronDown, AlertCircle, CheckCircle2, Clock,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────
interface Driver { id: string; name: string; nickname: string; license_plate: string; bank_account: string; base_salary: number; commission_rate: number; }
interface VehicleDoc { id: string; truck_license_plate: string; doc_type: string; doc_name: string; file_url: string | null; valid_from: string | null; valid_until: string | null; notes: string | null; created_at: string; }

const DOC_TYPE_LABEL: Record<string, string> = {
  power_of_attorney: 'หนังสือมอบอำนาจ',
  cross_border: 'หนังสือข้ามแดน',
  vehicle_reg: 'ทะเบียนรถ',
  insurance: 'ประกันภัย',
  other: 'อื่นๆ',
};

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function fmtDate(d: string | null): string {
  if (!d) return '-';
  const dt = new Date(d);
  return `${dt.getDate()} ${THAI_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`;
}
function fmtMoney(n: number): string { return new Intl.NumberFormat('th-TH').format(n); }

function isExpiringSoon(until: string | null): boolean {
  if (!until) return false;
  const diff = new Date(until).getTime() - Date.now();
  return diff > 0 && diff < 30 * 86400 * 1000;
}
function isExpired(until: string | null): boolean {
  if (!until) return false;
  return new Date(until).getTime() < Date.now();
}

// ─── Main Page ───────────────────────────────────────────────
export default function DocumentsPage() {
  const [tab, setTab] = useState<'vehicle' | 'contract' | 'termination'>('vehicle');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [docs, setDocs] = useState<VehicleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: d }, { data: v }] = await Promise.all([
      supabase.from('drivers').select('id,name,nickname,license_plate,bank_account,base_salary,commission_rate').eq('is_active', true).is('deleted_at', null),
      supabase.from('vehicle_documents').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    ]);
    setDrivers((d || []) as Driver[]);
    setDocs((v || []) as VehicleDoc[]);
    setLoading(false);
  }

  const tabs = [
    { key: 'vehicle',      label: 'เอกสารรถ',   icon: Car },
    { key: 'contract',     label: 'สัญญาจ้าง',  icon: FileCheck },
    { key: 'termination',  label: 'เลิกจ้าง',   icon: FileMinus },
  ] as const;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">เอกสาร</h1>
        <p className="text-sm text-slate-500 mt-1">เอกสารรถพ่วง • สัญญาจ้าง • เลิกจ้าง</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <button onClick={loadData} className="ml-auto mb-1 flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
          <RefreshCw className="w-3.5 h-3.5" /> รีเฟรช
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">กำลังโหลด...</div>
      ) : (
        <>
          {tab === 'vehicle'     && <VehicleDocsTab drivers={drivers} docs={docs} onRefresh={loadData} />}
          {tab === 'contract'    && <ContractTab drivers={drivers} />}
          {tab === 'termination' && <TerminationTab drivers={drivers} />}
        </>
      )}
    </div>
  );
}

// ─── Tab 1: Vehicle Documents ────────────────────────────────
function VehicleDocsTab({ drivers, docs, onRefresh }: { drivers: Driver[]; docs: VehicleDoc[]; onRefresh: () => void }) {
  const [showUpload, setShowUpload] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const supabase = createClient();

  // Group docs by plate
  const byPlate: Record<string, VehicleDoc[]> = {};
  docs.forEach(d => {
    if (!byPlate[d.truck_license_plate]) byPlate[d.truck_license_plate] = [];
    byPlate[d.truck_license_plate].push(d);
  });

  // All plates: from drivers + from docs
  const allPlates = Array.from(new Set([
    ...drivers.map(d => d.license_plate),
    ...Object.keys(byPlate),
  ])).filter(Boolean);

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch(`/api/vehicle-documents?id=${id}`, { method: 'DELETE' });
    setDeleting(null);
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-600">เอกสารรถพ่วงสำหรับข้ามแดน — อัปโหลดและดาวน์โหลดตามทะเบียนรถ</p>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> เพิ่มเอกสาร
        </button>
      </div>

      {allPlates.length === 0 && (
        <div className="text-center py-12 text-slate-400">ยังไม่มีเอกสาร — กด "เพิ่มเอกสาร" เพื่อเริ่มต้น</div>
      )}

      <div className="space-y-4">
        {allPlates.map(plate => {
          const plateDocs = byPlate[plate] || [];
          return (
            <div key={plate} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
                <Car className="w-4 h-4 text-slate-500" />
                <span className="font-semibold text-slate-800">{plate}</span>
                <span className="text-xs text-slate-400 ml-1">
                  {drivers.find(d => d.license_plate === plate)?.name}
                </span>
                <span className="ml-auto text-xs text-slate-400">{plateDocs.length} เอกสาร</span>
              </div>

              {plateDocs.length === 0 ? (
                <div className="px-5 py-4 text-sm text-slate-400">ยังไม่มีเอกสาร</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {plateDocs.map(doc => {
                    const expired = isExpired(doc.valid_until);
                    const soon = isExpiringSoon(doc.valid_until);
                    return (
                      <div key={doc.id} className="flex items-center gap-4 px-5 py-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800">{doc.doc_name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {DOC_TYPE_LABEL[doc.doc_type] || doc.doc_type}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {doc.valid_until && (
                              <span className={`text-xs flex items-center gap-1 ${
                                expired ? 'text-red-600' : soon ? 'text-amber-600' : 'text-slate-500'
                              }`}>
                                {expired ? <AlertCircle className="w-3 h-3" /> : soon ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                หมดอายุ {fmtDate(doc.valid_until)}
                                {expired && ' (หมดแล้ว)'}
                                {soon && ' (ใกล้หมด)'}
                              </span>
                            )}
                            {doc.notes && <span className="text-xs text-slate-400">{doc.notes}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {doc.file_url && (
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg">
                              <Download className="w-3.5 h-3.5" /> ดาวน์โหลด
                            </a>
                          )}
                          <button onClick={() => handleDelete(doc.id)} disabled={deleting === doc.id}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showUpload && <UploadDocModal drivers={drivers} onClose={() => setShowUpload(false)} onSaved={onRefresh} />}
    </div>
  );
}

// ─── Upload Modal ────────────────────────────────────────────
function UploadDocModal({ drivers, onClose, onSaved }: { drivers: Driver[]; onClose: () => void; onSaved: () => void }) {
  const [plate, setPlate] = useState(drivers[0]?.license_plate || '');
  const [customPlate, setCustomPlate] = useState('');
  const [docType, setDocType] = useState('power_of_attorney');
  const [docName, setDocName] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const finalPlate = plate === '__custom__' ? customPlate : plate;

  async function handleSave() {
    if (!finalPlate || !docName) { setError('กรุณากรอกทะเบียนรถและชื่อเอกสาร'); return; }
    setSaving(true); setError('');
    let fileUrl: string | null = null;
    let filePath: string | null = null;

    if (file) {
      const ext = file.name.split('.').pop();
      const path = `vehicle-docs/${finalPlate}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('vehicle-docs').upload(path, file);
      if (upErr) { setError(`อัปโหลดไฟล์ไม่สำเร็จ: ${upErr.message}`); setSaving(false); return; }
      filePath = path;
      const { data: urlData } = supabase.storage.from('vehicle-docs').getPublicUrl(path);
      fileUrl = urlData.publicUrl;
    }

    const res = await fetch('/api/vehicle-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        truck_license_plate: finalPlate, doc_type: docType,
        doc_name: docName, file_url: fileUrl, file_path: filePath,
        valid_from: validFrom || null, valid_until: validUntil || null, notes: notes || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || 'บันทึกไม่สำเร็จ'); setSaving(false); return; }
    onSaved(); onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">เพิ่มเอกสารรถ</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ทะเบียนรถ *</label>
            <select value={plate} onChange={e => setPlate(e.target.value)} className="form-input">
              {drivers.map(d => (
                <option key={d.id} value={d.license_plate}>{d.license_plate} — {d.name}</option>
              ))}
              <option value="__custom__">กรอกเอง...</option>
            </select>
            {plate === '__custom__' && (
              <input className="form-input mt-2" placeholder="ทะเบียนรถ" value={customPlate} onChange={e => setCustomPlate(e.target.value)} />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ประเภทเอกสาร *</label>
            <select value={docType} onChange={e => { setDocType(e.target.value); setDocName(DOC_TYPE_LABEL[e.target.value] || ''); }} className="form-input">
              {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อเอกสาร *</label>
            <input className="form-input" placeholder="เช่น หนังสือมอบอำนาจ ปี 2568" value={docName} onChange={e => setDocName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">วันที่ออก</label>
              <input type="date" className="form-input" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">วันหมดอายุ</label>
              <input type="date" className="form-input" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">อัปโหลดไฟล์ (PDF / รูปภาพ)</label>
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
              {file ? (
                <p className="text-sm text-blue-700 font-medium">{file.name}</p>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <p className="text-sm text-slate-500">คลิกเพื่อเลือกไฟล์</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
            <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 2: Employment Contract ──────────────────────────────
function ContractTab({ drivers }: { drivers: Driver[] }) {
  const [driverId, setDriverId] = useState(drivers[0]?.id || '');
  const [startDate, setStartDate] = useState('');
  const [maxLiability, setMaxLiability] = useState('50000');
  const [workSchedule, setWorkSchedule] = useState('ตามที่นายจ้างกำหนด');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const driver = drivers.find(d => d.id === driverId);

  async function handleGenerate() {
    if (!driverId || !startDate) { setError('กรุณาเลือกคนขับและวันที่เริ่มงาน'); return; }
    setGenerating(true); setError('');

    // Parse bank info
    const bankParts = (driver?.bank_account || '').split(' ');
    const bankAccount = bankParts[0] || '';
    const bankName = bankParts.slice(1).join(' ') || '';

    const res = await fetch('/api/documents/employment-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driver_id: driver?.id,
        driver_name: driver?.name,
        license_plate: driver?.license_plate,
        start_date: startDate,
        base_salary: driver?.base_salary || 0,
        commission_rate: driver?.commission_rate || 0.10,
        bank_account: bankAccount,
        bank_name: bankName,
        max_liability: Number(maxLiability),
        work_schedule: workSchedule,
      }),
    });

    if (!res.ok) {
      const j = await res.json();
      setError(j.error || 'สร้างเอกสารไม่สำเร็จ');
      setGenerating(false);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `สัญญาจ้าง_${driver?.name}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    setGenerating(false);
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        สร้างสัญญาจ้างพนักงานขับรถบรรทุก — ข้อมูลจะดึงจากโปรไฟล์คนขับโดยอัตโนมัติ
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">คนขับ *</label>
          <select value={driverId} onChange={e => setDriverId(e.target.value)} className="form-input">
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.nickname}) — {d.license_plate}</option>)}
          </select>
        </div>

        {driver && (
          <div className="grid grid-cols-3 gap-3 bg-slate-50 rounded-lg p-3 text-sm">
            <div><span className="text-slate-500">เงินเดือน</span><div className="font-semibold">{fmtMoney(driver.base_salary)} บาท</div></div>
            <div><span className="text-slate-500">ค่าเที่ยว</span><div className="font-semibold">{Math.round((driver.commission_rate || 0.10) * 100)}%</div></div>
            <div><span className="text-slate-500">ธนาคาร</span><div className="font-semibold">{driver.bank_account || '-'}</div></div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">วันที่เริ่มงาน *</label>
          <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">วงเงินรับผิดชอบสูงสุด (บาท)</label>
          <input type="number" className="form-input" value={maxLiability} onChange={e => setMaxLiability(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">ตารางการทำงาน</label>
          <input className="form-input" value={workSchedule} onChange={e => setWorkSchedule(e.target.value)} />
        </div>
      </div>

      <button onClick={handleGenerate} disabled={generating}
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-60">
        <Download className="w-4 h-4" />
        {generating ? 'กำลังสร้าง...' : 'สร้างและดาวน์โหลด .docx'}
      </button>
    </div>
  );
}

// ─── Tab 3: Termination Letter ───────────────────────────────
function TerminationTab({ drivers }: { drivers: Driver[] }) {
  const [driverId, setDriverId] = useState(drivers[0]?.id || '');
  const [terminationDate, setTerminationDate] = useState('');
  const [lastWorkDate, setLastWorkDate] = useState('');
  const [reason, setReason] = useState('');
  const [finalSalary, setFinalSalary] = useState('');
  const [compensation, setCompensation] = useState('0');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const driver = drivers.find(d => d.id === driverId);

  const REASON_PRESETS = [
    'เจ็บป่วยด้วยโรคประจำตัวจนไม่สามารถปฏิบัติงานได้',
    'ลาออกโดยความสมัครใจ',
    'ครบสัญญาและไม่ต่อสัญญา',
    'ละทิ้งหน้าที่เกิน 3 วันทำการติดต่อกัน',
    'กระทำการทุจริตต่อนายจ้าง',
  ];

  async function handleGenerate() {
    if (!driverId || !terminationDate || !reason || !finalSalary) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน'); return;
    }
    setGenerating(true); setError('');

    const res = await fetch('/api/documents/termination-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driver_id: driver?.id,
        driver_name: driver?.name,
        termination_date: terminationDate,
        last_work_date: lastWorkDate || null,
        reason,
        final_salary: Number(finalSalary),
        compensation: Number(compensation),
        notes,
      }),
    });

    if (!res.ok) {
      const j = await res.json();
      setError(j.error || 'สร้างเอกสารไม่สำเร็จ');
      setGenerating(false);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `หนังสือเลิกจ้าง_${driver?.name}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    setGenerating(false);
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        สร้างหนังสือเลิกจ้างพนักงาน — ระบบจะบันทึกประวัติการเลิกจ้างไว้โดยอัตโนมัติ
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">คนขับ *</label>
          <select value={driverId} onChange={e => setDriverId(e.target.value)} className="form-input">
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.nickname})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">วันที่หยุดงาน</label>
            <input type="date" className="form-input" value={lastWorkDate} onChange={e => setLastWorkDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">วันที่มีผล (เลิกจ้าง) *</label>
            <input type="date" className="form-input" value={terminationDate} onChange={e => setTerminationDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">สาเหตุ *</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {REASON_PRESETS.map(r => (
              <button key={r} onClick={() => setReason(r)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  reason === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
                }`}>
                {r}
              </button>
            ))}
          </div>
          <textarea className="form-input" rows={3} placeholder="หรือพิมพ์สาเหตุเอง..." value={reason} onChange={e => setReason(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ค่าจ้างเดือนสุดท้าย (บาท) *</label>
            <input type="number" className="form-input" value={finalSalary} onChange={e => setFinalSalary(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">เงินชดเชย (บาท)</label>
            <input type="number" className="form-input" value={compensation} onChange={e => setCompensation(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุเพิ่มเติม</label>
          <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      <button onClick={handleGenerate} disabled={generating}
        className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 disabled:opacity-60">
        <Download className="w-4 h-4" />
        {generating ? 'กำลังสร้าง...' : 'สร้างและดาวน์โหลด .docx'}
      </button>
    </div>
  );
}
