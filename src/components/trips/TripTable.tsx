'use client';

import { useState } from 'react';
import { Pencil, Trash2, ImageIcon, AlertTriangle, X, Eye } from 'lucide-react';
import type { Trip, TripTotals } from '@/types';
import { formatThaiDate, formatNumber } from '@/lib/utils';

interface TripTableProps {
  trips:   Trip[];
  totals:  TripTotals;
  loading: boolean;
  onEdit:   (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
}

export default function TripTable({ trips, totals, loading, onEdit, onDelete }: TripTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [previewImg,   setPreviewImg]   = useState<string | null>(null);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    onDelete(deleteTarget);
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mr-3" />
        กำลังโหลดข้อมูล...
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full data-table text-xs">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>สินค้า / เส้นทาง</th>
              <th className="text-center">ไมล์ต้น/ปลาย</th>
              <th className="text-right">ค่าน้ำมัน</th>
              <th className="text-right">ค่าขนส่ง</th>
              <th className="text-right">ค่าเที่ยว</th>
              <th className="text-right">เบิก</th>
              <th className="text-right">อื่นๆ</th>
              <th className="text-center">รูป</th>
              <th className="text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {trips.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-slate-300" />
                    </div>
                    <p>ยังไม่มีข้อมูลรายการสำหรับเดือนนี้</p>
                    <p className="text-xs text-slate-300">เพิ่มรายการแรกได้เลย</p>
                  </div>
                </td>
              </tr>
            ) : (
              trips.map(trip => (
                <tr key={trip.id} className="group">
                  <td className="font-medium text-slate-900 whitespace-nowrap">
                    {formatThaiDate(trip.date, true)}
                  </td>
                  <td>
                    <div className="font-medium text-slate-800">{trip.product || '-'}</div>
                    <div className="text-slate-400 text-[11px]">
                      {trip.origin} <span className="mx-1">→</span> {trip.destination}
                    </div>
                  </td>
                  <td className="text-center text-slate-500">
                    <span>{formatNumber(trip.odometer_start)}</span>
                    <span className="mx-1 text-slate-300">/</span>
                    <span>{formatNumber(trip.odometer_end)}</span>
                  </td>
                  <td className="text-right font-medium text-blue-600">
                    {trip.fuel_cost > 0 ? formatNumber(trip.fuel_cost) : '-'}
                  </td>
                  <td className="text-right font-medium text-purple-600">
                    {trip.transport_price > 0 ? formatNumber(trip.transport_price) : '-'}
                  </td>
                  <td className="text-right font-medium text-green-600">
                    {trip.trip_pay > 0 ? formatNumber(trip.trip_pay) : '-'}
                  </td>
                  <td className="text-right font-medium text-red-500">
                    {trip.withdraw > 0 ? formatNumber(trip.withdraw) : '-'}
                  </td>
                  <td className="text-right text-slate-500">
                    {trip.other_cost > 0 ? formatNumber(trip.other_cost) : '-'}
                  </td>
                  <td className="text-center">
                    {trip.receipt_image_url ? (
                      <button
                        onClick={() => setPreviewImg(trip.receipt_image_url)}
                        className="text-blue-400 hover:text-blue-600 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="text-slate-200">-</span>
                    )}
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEdit(trip)}
                        className="text-blue-400 hover:text-blue-600 transition-colors"
                        title="แก้ไข"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(trip)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>

          {trips.length > 0 && (
            <tfoot className="bg-slate-100 font-semibold text-slate-800 text-xs border-t-2 border-slate-300">
              <tr>
                <td colSpan={3} className="px-3 py-3 text-right">
                  รวม {formatNumber(totals.trips)} เที่ยว | {formatNumber(totals.distance)} กม.
                </td>
                <td className="px-3 py-3 text-right text-blue-700">
                  {formatNumber(totals.fuel_cost)}
                </td>
                <td className="px-3 py-3 text-right text-purple-700">
                  {formatNumber(totals.transport_price)}
                </td>
                <td className="px-3 py-3 text-right text-green-700">
                  {formatNumber(totals.trip_pay)}
                </td>
                <td className="px-3 py-3 text-right text-red-700">
                  {formatNumber(totals.withdraw)}
                </td>
                <td className="px-3 py-3 text-right text-slate-600">
                  {totals.other_cost > 0 ? formatNumber(totals.other_cost) : '-'}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-96 p-6 animate-fade-in-up border-l-4 border-red-500">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="font-bold text-lg text-red-700">ยืนยันการลบ</h3>
            </div>
            <p className="text-slate-600 mb-1">คุณต้องการลบรายการนี้ใช่หรือไม่?</p>
            <p className="text-sm text-slate-400 mb-6">
              {formatThaiDate(deleteTarget.date)} — {deleteTarget.origin} → {deleteTarget.destination}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="btn-secondary"
              >
                ยกเลิก
              </button>
              <button onClick={confirmDelete} className="btn-danger">
                <Trash2 className="w-4 h-4" /> ลบรายการ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
             onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-3xl max-h-full p-4" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg} alt="Receipt" className="max-h-[90vh] rounded-lg shadow-2xl" />
            <button
              className="absolute top-2 right-2 text-white bg-black/50 rounded-full p-1.5 hover:bg-black/80"
              onClick={() => setPreviewImg(null)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
