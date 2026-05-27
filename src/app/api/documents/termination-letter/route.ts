import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';

export const dynamic = 'force-dynamic';

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function thaiDate(d: Date): string {
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('th-TH').format(n);
}

function numberToThaiWords(n: number): string {
  const ones = ['','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
  const tens = ['','สิบ','ยี่สิบ','สามสิบ','สี่สิบ','ห้าสิบ','หกสิบ','เจ็ดสิบ','แปดสิบ','เก้าสิบ'];
  if (n === 0) return 'ศูนย์';
  if (n >= 1000000) {
    return numberToThaiWords(Math.floor(n / 1000000)) + 'ล้าน' + (n % 1000000 > 0 ? numberToThaiWords(n % 1000000) : '');
  }
  if (n >= 100000) {
    return numberToThaiWords(Math.floor(n / 100000)) + 'แสน' + (n % 100000 > 0 ? numberToThaiWords(n % 100000) : '');
  }
  if (n >= 10000) {
    return numberToThaiWords(Math.floor(n / 10000)) + 'หมื่น' + (n % 10000 > 0 ? numberToThaiWords(n % 10000) : '');
  }
  if (n >= 1000) {
    return numberToThaiWords(Math.floor(n / 1000)) + 'พัน' + (n % 1000 > 0 ? numberToThaiWords(n % 1000) : '');
  }
  if (n >= 100) {
    return numberToThaiWords(Math.floor(n / 100)) + 'ร้อย' + (n % 100 > 0 ? numberToThaiWords(n % 100) : '');
  }
  if (n >= 10) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return tens[t] + (o > 0 ? ones[o] : '');
  }
  return ones[n];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    driver_id, driver_name, termination_date, last_work_date,
    reason, final_salary, compensation = 0, notes = '',
  } = body;

  if (!driver_name || !termination_date || !reason) {
    return NextResponse.json({ error: 'driver_name, termination_date, reason required' }, { status: 400 });
  }

  const termDate = new Date(termination_date);
  const lastWorkDate = last_work_date ? new Date(last_work_date) : null;

  function p(text: string, opts?: { bold?: boolean; center?: boolean; size?: number }) {
    return new Paragraph({
      alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [new TextRun({ text, font: 'Sarabun', bold: opts?.bold, size: opts?.size ?? 28 })],
    });
  }

  const finalSalaryWords = numberToThaiWords(final_salary) + 'บาทถ้วน';
  const compensationWords = compensation > 0 ? numberToThaiWords(compensation) + 'บาทถ้วน' : '';

  const mainText = `โดยหนังสือฉบับนี้ ข้าพเจ้าขอให้การแจ้งว่า ${driver_name} ลูกจ้างของ หจก.ณสิริทรัพย์ การเกษตร ${reason}${lastWorkDate ? ` ตั้งแต่วันที่ ${thaiDate(lastWorkDate)}` : ''} ทางบริษัทจึงได้เลิกจ้างลูกจ้าง มีผลตั้งแต่วันที่ ${thaiDate(termDate)} โดยลูกจ้างได้รับค่าตอบแทนในเดือนสุดท้ายเป็นเงิน ${formatMoney(final_salary)} บาท (${finalSalaryWords})${compensation > 0 ? ` และได้รับเงินชดเชย ${formatMoney(compensation)} บาท (${compensationWords})` : ''}${notes ? ` ${notes}` : ''}`;

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Sarabun', size: 28 } } } },
    sections: [{
      children: [
        new Paragraph({ spacing: { after: 200 } }),
        p(`วันที่  ${thaiDate(new Date())}`),
        new Paragraph({ spacing: { after: 100 } }),
        p('เรื่อง\tการเลิกจ้าง', { bold: true }),
        new Paragraph({ spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ text: mainText, font: 'Sarabun', size: 28 })],
        }),
        new Paragraph({ spacing: { after: 200 } }),
        p('จึงเรียนมาเพื่อทราบ'),
        new Paragraph({ spacing: { after: 400 } }),
        p('ลงชื่อ...................................................นายจ้าง'),
        p('(                                        )'),
        new Paragraph({ spacing: { after: 200 } }),
        p('ลงชื่อ...................................................ลูกจ้าง'),
        p(`( ${driver_name} )`),
        p('วันที่รับทราบ.........................................'),
        new Paragraph({ spacing: { after: 200 } }),
        p('ลงชื่อ...................................................พยาน'),
        p('ลงชื่อ...................................................พยาน'),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);

  if (driver_id) {
    await supabase.from('termination_records').insert({
      driver_id, driver_name, termination_date, last_work_date, reason,
      final_salary, compensation, notes, generated_by: user.id,
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`หนังสือเลิกจ้าง_${driver_name}.docx`)}`,
    },
  });
}
