import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const plate = searchParams.get('plate');

  let query = supabase
    .from('vehicle_documents')
    .select('*')
    .is('deleted_at', null)
    .order('valid_until', { ascending: true });

  if (plate) query = query.eq('truck_license_plate', plate);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { truck_license_plate, doc_type, doc_name, file_url, file_path, valid_from, valid_until, notes } = body;

  if (!truck_license_plate || !doc_type || !doc_name) {
    return NextResponse.json({ error: 'truck_license_plate, doc_type, doc_name required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('vehicle_documents')
    .insert({ truck_license_plate, doc_type, doc_name, file_url, file_path, valid_from, valid_until, notes, uploaded_by: user.id })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('vehicle_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
