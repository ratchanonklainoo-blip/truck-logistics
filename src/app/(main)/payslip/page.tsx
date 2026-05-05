'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Download, ImageIcon, Calendar, Users, Printer } from 'lucide-react';
import type { Driver, Trip, MonthFilter } from '@/types';
import {
  COMPANY, THAI_MONTHS, BUDDHIST_ERA_OFFSET, PDF_CONFIG,
} from '@/lib/constants';
import {
  formatThaiDate, formatNumber, formatCurrency,
  calculateTotals, calcNetPay,
  isDateInFilter, getCurrentMonthFilter, getThaiMonthLabel,
  floorToNearest10,
} from '@/lib/utils';

// ── PDF fix: company name is ALWAYS pulled from COMPANY.name constant
// ── Font sizes: 22px for header, 13px minimum for content
// ── html2canvas scale: 3, windowWidth: 794px (A4 at 96dpi)

export default function PayslipPage() {
  const supabase = createClient();

  const [drivers,        setDrivers]        = useState<Driver[]>([]);
  const [allTrips,       setAllTrips]        = useState<Trip[]>([]);
  const [selectedDriver, setSelectedDriver]  = useState<Driver | null>(null);
  const [monthFilter,    setMonthFilter]     = useState<MonthFilter>(getCurrentMonthFilter());
  const [isDownloadPDF,  setIsDownloadPDF]   = useState(false);
  const [isDownloadPNG,  setIsDownloadPNG]   = useState(false);
  const [loading,        setLoading]         = useState(true);

  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load html2pdf and html2canvas
    const loadScript = (src: string) => {
      return new Promise<void>(resolve => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = () => resolve();
        document.body.appendChild(s);
      });
    };
    Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
    ]);
  }, []);

  useEffect(() => {
    const load = async () => {
      const [{ data: driverData }, { data: tripData }] = await Promise.all([
        supabase.from('drivers').select('*').is('deleted_at', null).eq('is_active', true),
        supabase.from('trips').select('*').is('deleted_at', null),
      ]);
      if (driverData?.length) {
        setDrivers(driverData);
        setSelectedDriver(driverData[0]);
      }
      setAllTrips(tripData || []);
      setLoading(false);
    };
    load();
  }, []);

  const driverTrips = useMemo(() => {
    if (!selectedDriver) return [];
    return allTrips
      .filter(t => t.driver_id === selectedDriver.id && isDateInFilter(t.date, monthFilter))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allTrips, selectedDriver, monthFilter]);

  // Only trips with product or withdraw (billable)
  const billableTrips = useMemo(() =>
    driverTrips.filter(t => (t.product?.trim()) || t.withdraw > 0),
  [driverTrips]);

  const totals = useMemo(() => calculateTotals(driverTrips), [driverTrips]);

  const salary        = selectedDriver?.base_salary || 5000;
  const socialSec     = selectedDriver?.social_security || 0;
  const grossIncome   = totals.trip_pay + salary;
  const netPay        = calcNetPay(totals.trip_pay, salary, totals.withdraw, socialSec);
  const monthLabel    = getThaiMonthLabel(monthFilter);

  const emptyRowCount = Math.max(0, PDF_CONFIG.TABLE_MIN_ROWS - billableTrips.length);
  const yearOptions   = Array.from({ length: 5 }, (_, i) => {
    const now = new Date();
    return now.getFullYear() + BUDDHIST_ERA_OFFSET - i;
  });

  // ── Download PDF ──────────────────────────────────────────
  const handleDownloadPDF = async () => {
    if (typeof (window as any).html2pdf === 'undefined') {
      alert('ระบบ PDF กำลังโหลด... รอสักครู่แล้วลองใหม่');
      return;
    }
    setIsDownloadPDF(true);
    const el = document.getElementById('payslip-content');
    if (!el) return;

    const opt = {
      margin:     0,
      filename:   `ใบจ่ายเงิน_${selectedDriver?.nickname}_${monthLabel}.pdf`,
      image:      { type: 'jpeg', quality: 1.0 },
      html2canvas: {
        scale:       PDF_CONFIG.SCALE,         // 3 — คมชัด
        useCORS:     true,
        windowWidth: PDF_CONFIG.A4_WIDTH_PX,   // 794px — A4 at 96dpi
        logging:     false,
        onclone:     (doc: Document) => {
          // Ensure font loads in clone
          const link = doc.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap';
          doc.head.appendChild(link);
        },
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    await (window as any).html2pdf().set(opt).from(el).save();
    setIsDownloadPDF(false);
  };

  // ── Download PNG ──────────────────────────────────────────
  const handleDownloadPNG = async () => {
    if (typeof (window as any).html2canvas === 'undefined') {
      alert('ระบบกำลังโหลด... รอสักครู่แล้วลองใหม่');
      return;
    }
    setIsDownloadPNG(true);
    const el = document.getElementById('payslip-content');
    if (!el) return;

    const canvas = await (window as any).html2canvas(el, {
      scale:       PDF_CONFIG.SCALE,       // 3 — คุณภาพสูง
      useCORS:     true,
      windowWidth: PDF_CONFIG.A4_WIDTH_PX,
      backgroundColor: '#ffffff',
      logging:     false,
    });

    const a   = document.createElement('a');
    a.href    = canvas.toDataURL('image/png', 1.0);
    a.download = `ใบจ่ายเงิน_${selectedDriver?.nickname}_${monthLabel}.png`;
    a.click();
    setIsDownloadPNG(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-4 items-center justify-between no-print">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Printer className="w-6 h-6 text-blue-600" /> ใบจ่ายเงิน
          </h1>

          {/* Driver */}
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <select
              className="form-input w-56 text-sm"
              value={selectedDriver?.id || ''}
              onChange={e => setSelectedDriver(drivers.find(d => d.id === e.target.value) || null)}
            >
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.nickname} — {d.name}</option>
              ))}
            </select>
          </div>

          {/* Month/Year */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              className="form-input w-36 text-sm"
              value={monthFilter.month_index}
              onChange={e => setMonthFilter(f => ({ ...f, month_index: Number(e.target.value) }))}
            >
              {THAI_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              className="form-input w-24 text-sm"
              value={monthFilter.year_be}
              onChange={e => setMonthFilter(f => ({ ...f, year_be: Number(e.target.value) }))}
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Download buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleDownloadPNG}
            disabled={isDownloadPNG}
            className="btn-secondary text-sm"
          >
            {isDownloadPNG
              ? <><div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> กำลังบันทึก...</>
              : <><ImageIcon className="w-4 h-4 text-pink-500" /> PNG</>
            }
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={isDownloadPDF}
            className="btn-primary text-sm"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            {isDownloadPDF
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังสร้าง PDF...</>
              : <><Download className="w-4 h-4" /> PDF</>
            }
          </button>
        </div>
      </div>

      {/* A4 Preview */}
      <div className="flex justify-center">
        <div className="shadow-2xl">
          {/*
            ── PDF FIX NOTES ──────────────────────────────────────────
            1. COMPANY.name ดึงจาก constant เสมอ — ไม่ใช่ state ที่แก้ได้
            2. ชื่อบริษัท: font-size 22px, font-weight 800
            3. เนื้อหา: font-size 13px ขั้นต่ำ
            4. Font: Sarabun loaded via @font-face inline + Google Fonts
            ─────────────────────────────────────────────────────────── */}
          <div
            id="payslip-content"
            ref={invoiceRef}
            style={{
              fontFamily:      "'Sarabun', sans-serif",
              fontSize:        '11px',
              backgroundColor: '#ffffff',
              width:           `${PDF_CONFIG.A4_WIDTH_PX}px`,
              height:          '1123px',   // A4 height — force single page
              padding:         '28px 36px',
              boxSizing:       'border-box',
              lineHeight:      1.4,
              color:           '#111827',
              overflow:        'hidden',
            }}
          >
            {/* Embed font for PDF rendering */}
            <style>{`
              @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap');
              #payslip-content * { font-family: 'Sarabun', sans-serif !important; }
            `}</style>

            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 2px 0' }}>
                  {COMPANY.name}
                </h1>
                <p style={{ fontSize: '11px', color: '#374151', margin: 0 }}>
                  {COMPANY.address}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ borderBottom: '2px solid #111827', paddingBottom: '2px', marginBottom: '4px' }}>
                  <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>ใบจ่ายเงินเดือนรถพ่วง</h2>
                </div>
                <p style={{ fontSize: '11px', margin: '2px 0' }}><strong>ประจำเดือน:</strong> {monthLabel}</p>
                <p style={{ fontSize: '11px', margin: '2px 0' }}><strong>วันที่ออกเอกสาร:</strong> {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>

            {/* ── Info row ── */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '10px', fontSize: '11px', backgroundColor: '#F9FAFB', padding: '6px 10px', borderRadius: '4px', border: '1px solid #E5E7EB' }}>
              <p style={{ margin: 0 }}><strong>คนขับ:</strong> {selectedDriver?.name || '-'}</p>
              <p style={{ margin: 0 }}><strong>ทะเบียน:</strong> {selectedDriver?.license_plate || '-'}</p>
              <p style={{ margin: 0 }}><strong>เลขบัญชี:</strong> {selectedDriver?.bank_account || '-'}</p>
            </div>

            {/* ── Trip table ── */}
            <table style={{
              width:          '100%',
              borderCollapse: 'collapse',
              fontSize:       '11px',
              marginBottom:   '10px',
            }}>
              <thead>
                <tr style={{ backgroundColor: '#1E3A5F', color: '#fff' }}>
                  {['#','วันที่','สินค้า','ต้นทาง','ปลายทาง','ค่าเที่ยว','เบิก','หมายเหตุ'].map((h, i) => (
                    <th key={h} style={{
                      border:    '1px solid #374151',
                      padding:   '4px 5px',
                      fontWeight: 700,
                      textAlign: i === 5 || i === 6 ? 'right' : 'center',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {billableTrips.map((trip, idx) => (
                  <tr key={trip.id} style={{ backgroundColor: idx % 2 === 1 ? '#F9FAFB' : '#fff' }}>
                    <td style={{ border:'1px solid #D1D5DB', padding:'2px 5px', textAlign:'center' }}>{idx + 1}</td>
                    <td style={{ border:'1px solid #D1D5DB', padding:'2px 5px', textAlign:'center', whiteSpace:'nowrap' }}>
                      {formatThaiDate(trip.date, true)}
                    </td>
                    <td style={{ border:'1px solid #D1D5DB', padding:'2px 5px' }}>{trip.product || '-'}</td>
                    <td style={{ border:'1px solid #D1D5DB', padding:'2px 5px', textAlign:'center' }}>{trip.origin || '-'}</td>
                    <td style={{ border:'1px solid #D1D5DB', padding:'2px 5px', textAlign:'center' }}>{trip.destination || '-'}</td>
                    <td style={{ border:'1px solid #D1D5DB', padding:'2px 5px', textAlign:'right', fontWeight: 600 }}>
                      {trip.trip_pay > 0 ? formatNumber(trip.trip_pay) : '-'}
                    </td>
                    <td style={{ border:'1px solid #D1D5DB', padding:'2px 5px', textAlign:'right', color:'#DC2626' }}>
                      {trip.withdraw > 0 ? formatNumber(trip.withdraw) : '-'}
                    </td>
                    <td style={{ border:'1px solid #D1D5DB', padding:'2px 5px' }}>{trip.remarks || ''}</td>
                  </tr>
                ))}
                {/* Empty rows only when data is sparse */}
                {Array.from({ length: emptyRowCount }).map((_, i) => (
                  <tr key={`empty-${i}`} style={{ height: '20px' }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} style={{ border: '1px solid #D1D5DB' }} />
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#1E3A5F', color: '#fff', fontWeight: 700 }}>
                  <td colSpan={5} style={{ border:'1px solid #374151', padding:'4px 10px', textAlign:'right' }}>
                    รวมเป็นเงิน / Total
                  </td>
                  <td style={{ border:'1px solid #374151', padding:'4px 5px', textAlign:'right' }}>
                    {formatNumber(totals.trip_pay)}
                  </td>
                  <td style={{ border:'1px solid #374151', padding:'4px 5px', textAlign:'right', color:'#FCA5A5' }}>
                    {formatNumber(totals.withdraw)}
                  </td>
                  <td style={{ border:'1px solid #374151' }} />
                </tr>
              </tfoot>
            </table>

            {/* ── Summary box ── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                width:   '300px',
                border:  '2px solid #1E3A5F',
                borderRadius: '6px',
                overflow: 'hidden',
                fontSize: '11px',
              }}>
                <div style={{ backgroundColor: '#1E3A5F', color: '#fff', padding: '5px 12px', fontWeight: 700, fontSize: '12px' }}>
                  สรุปการจ่ายเงิน
                </div>
                <div style={{ padding: '10px 12px', backgroundColor: '#F9FAFB' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                    <span>รายรับรวม (ค่าเที่ยว):</span>
                    <strong>{formatNumber(totals.trip_pay)} บาท</strong>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px', color:'#059669' }}>
                    <span>+ เงินเดือน:</span>
                    <span>{formatNumber(salary)} บาท</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px', fontWeight:700, borderTop:'1px solid #D1D5DB', paddingTop:'4px' }}>
                    <span>รวมรายรับทั้งหมด:</span>
                    <span>{formatNumber(grossIncome)} บาท</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px', color:'#DC2626' }}>
                    <span>- หักเบิก:</span>
                    <span>{formatNumber(totals.withdraw)} บาท</span>
                  </div>
                  {socialSec > 0 && (
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px', color:'#DC2626' }}>
                      <span>- หักประกันสังคม:</span>
                      <span>{formatNumber(socialSec)} บาท</span>
                    </div>
                  )}
                  <div style={{
                    display:'flex', justifyContent:'space-between',
                    borderTop: '2px solid #1E3A5F', paddingTop:'6px', marginTop:'4px',
                    fontSize: '15px', fontWeight: 800,
                  }}>
                    <span>คงเหลือสุทธิ:</span>
                    <span style={{ color: '#1E3A5F', borderBottom: '3px double #1E3A5F' }}>
                      {formatNumber(netPay)} บาท
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Signatures ── */}
            <div style={{
              display: 'flex', justifyContent: 'space-around',
              marginTop: '28px', textAlign: 'center',
              fontSize: '11px', fontWeight: 600,
            }}>
              <div>
                <div style={{ borderBottom: '1px solid #111827', width: '160px', marginBottom: '6px' }} />
                <p style={{ margin: 0 }}>ผู้จ่ายเงิน / Authorized By</p>
              </div>
              <div>
                <div style={{ borderBottom: '1px solid #111827', width: '160px', marginBottom: '6px' }} />
                <p style={{ margin: 0 }}>ผู้รับเงิน / Recipient</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
