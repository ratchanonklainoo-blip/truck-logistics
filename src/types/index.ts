// ============================================================
// Truck Logistics OS — TypeScript Types
// หจก.ณสิริทรัพย์ การเกษตร
// ============================================================

export interface Driver {
  id: string;
  driver_key: string;
  name: string;
  nickname: string;
  license_plate: string;
  bank_account: string | null;
  social_security: number;
  base_salary: number;
  commission_rate: number;
  line_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Customer {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  payment_type: 'prepaid' | 'on_completion' | 'credit';
  credit_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Trip {
  id: string;
  driver_id: string;
  customer_id: string | null;
  date: string; // YYYY-MM-DD
  origin: string;
  destination: string;
  product: string;
  weight: string;
  transport_price: number;
  trip_pay: number;        // ค่ารอบ = transport_price * commission_rate
  odometer_start: number;
  odometer_end: number;
  distance: number;
  fuel_cost: number;
  fuel_litres: number;
  other_item: string;
  other_cost: number;
  withdraw: number;
  remarks: string;
  receipt_image_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // joined
  driver?: Driver;
  customer?: Customer;
}

export interface TripFormData {
  date: string;
  driver_id: string;
  customer_id?: string;
  origin: string;
  destination: string;
  product: string;
  weight: string;
  transport_price: number | '';
  trip_pay: number | '';
  odometer_start: number | '';
  odometer_end: number | '';
  distance: number | '';
  fuel_cost: number | '';
  fuel_litres: number | '';
  other_item: string;
  other_cost: number | '';
  withdraw: number | '';
  remarks: string;
  receipt_image_url?: string | null;
}

export interface TripTotals {
  trips: number;
  transport_price: number;
  trip_pay: number;
  fuel_cost: number;
  fuel_litres: number;
  other_cost: number;
  withdraw: number;
  distance: number;
}

export interface CompanyStats {
  total_revenue: number;
  total_trip_pay: number;
  total_fuel: number;
  total_other: number;
  total_expenses: number;
  net_profit: number;
  total_trips: number;
}

export interface DriverMonthStats {
  driver: Driver;
  revenue: number;
  trip_pay: number;
  fuel_cost: number;
  other_cost: number;
  trips: number;
  distance: number;
  fuel_litres: number;
  fuel_efficiency: number; // กม./ลิตร
}

export interface PayslipData {
  driver: Driver;
  month: string;       // "มกราคม"
  year: string;        // "2568"
  month_index: number; // 0-11
  year_ad: number;     // 2025
  trips: Trip[];
  totals: TripTotals;
  salary: number;
  social_security: number;
  net_pay: number;
}

export interface AppSettings {
  product_categories: string[];
  locations: string[];
  initial_odometers: Record<string, number>;
}

// ── Month/Year filter ──────────────────────────────────────
export interface MonthFilter {
  month_index: number; // 0-11
  year_be: number;     // พ.ศ. เช่น 2568
}

// ── Audit log ─────────────────────────────────────────────
export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
}
