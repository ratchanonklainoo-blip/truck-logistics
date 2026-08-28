// Truck Logistics OS — TypeScript Types

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
  monthly_advance_limit: number;
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
  date: string;
  origin: string;
  destination: string;
  product: string;
  weight: string;
  transport_price: number;
  trip_pay: number;
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
  expense_notes: unknown | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
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
  fuel_efficiency: number;
}

export interface PayslipData {
  driver: Driver;
  month: string;
  year: string;
  month_index: number;
  year_ad: number;
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

export interface MonthFilter {
  month_index: number;
  year_be: number;
}

export type FuelEventStatus =
  | 'waiting_data'
  | 'waiting_ocr'
  | 'needs_review'
  | 'waiting_approval'
  | 'waiting_payment'
  | 'paid';

export interface FuelEvent {
  id: string;
  job_id: string | null;
  driver_id: string;
  trip_id: string | null;
  fuel_date: string | null;
  status: FuelEventStatus;
  photo_pump_url: string | null;
  photo_payment_url: string | null;
  photo_odometer_url: string | null;
  station_name: string | null;
  amount_baht: number | null;
  fuel_liters: number | null;
  price_per_liter: number | null;
  odometer: number | null;
  payment_method: string | null;
  ocr_confidence: number | null;
  verified_by: string | null;
  verified_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  is_anomaly: boolean;
  anomaly_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  driver?: Driver;
}

export interface OcrResult {
  id: string;
  fuel_event_id: string;
  image_url: string;
  image_type: 'pump' | 'payment' | 'odometer';
  raw_response: Record<string, unknown> | null;
  extracted_data: Record<string, unknown> | null;
  confidence: number | null;
  model_used: string;
  tokens_used: number | null;
  created_at: string;
}

export interface LineMessage {
  id: string;
  line_user_id: string;
  driver_id: string | null;
  message_type: 'text' | 'image' | 'location' | 'sticker' | null;
  content: string | null;
  image_url: string | null;
  intent: 'fuel_photo' | 'advance_request' | 'odometer' | 'job_accept' | 'unknown' | null;
  processed: boolean;
  fuel_event_id: string | null;
  advance_request_id: string | null;
  raw_payload: Record<string, unknown> | null;
  received_at: string;
  created_at: string;
}

export type AdvanceStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface AdvanceRequest {
  id: string;
  driver_id: string;
  amount: number;
  reason: string | null;
  status: AdvanceStatus;
  requested_via: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  month_year: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  driver?: Driver;
}

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
