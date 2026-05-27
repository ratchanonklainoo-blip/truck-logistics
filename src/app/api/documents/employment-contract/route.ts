import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, HeadingLevel,
} from 'docx';

export const dynamic = 'force-dynamic';

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function thaiDate(d: Date): string {
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('th-TH').format(n);
}

function noBorder() {
  const s = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: s, bottom: s, left: s, right: s, insideHorizontal: s, insideVertical: s };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    driver_id, driver_name, license_plate, start_date,
    base_salary, commission_rate = 0.10, bank_name, bank_account,
    max_liability = 50000, work_schedule = 'ตามที่นายจ้างกำหนด',
    contract_location = 'จังหวัดเชียงราย',
  } = body;

  if (!driver_name || !start_date) {
    return NextResponse.json({ error: 'driver_name and start_date required' }, { status: 400 });
  }

  const dateObj = new Date(start_date);
  const thaiStartDate = thaiDate(dateObj);
  const todayThai = thaiDate(new Date());
  const commissionPct = Math.round(commission_rate * 100);

  function para(text: string, opts?: { bold?: boolean; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; indent?: number }) {
    return new Paragraph({
      alignment: opts?.align ?? AlignmentType.LEFT,
      indent: opts?.indent ? { left: opts.indent } : undefined,
      children: [new TextRun({ text, font: 'Sarabun', bold: opts?.bold, size: (opts?.size ?? 28) })],
    });
  }

  function bullet(text: string) {
    return new Paragraph({
      indent: { left: 720, hanging: 360 },
      children: [new TextRun({ text: `•  ${text}`, font: 'Sarabun', size: 28 })],
    });
  }

  function sectionHead(text: string) {
    return new Paragraph({
      spacing: { before: 200, after: 80 },
      children: [new TextRun({ text, font: 'Sarabun', bold: true, size: 28 })],
    });
  }

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: 'สัญญาจ้างพนักงานขับรถบรรทุก', font: 'Sarabun', bold: true, size: 36 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: 'หจก.ณสิริทรัพย์ การเกษตร', font: 'Sarabun', bold: true, size: 30 })],
    }),
    para(`สัญญาฉบับนี้ทำขึ้นที่ ${contract_location}`),
    para(`เมื่อวันที่ ${todayThai}`),
    new Paragraph({ spacing: { after: 100 } }),
    para('ระหว่าง', { bold: true }),
    para(`นายจ้าง  หจก.ณสิริทรัพย์ การเกษตร  ตั้งอยู่ที่ จังหวัดเชียงราย  (ต่อไปนี้เรียกว่า "นายจ้าง")`),
    new Paragraph({ spacing: { after: 60 } }),
    para('กับ', { bold: true }),
    para(`ลูกจ้าง  ${driver_name}  (ต่อไปนี้เรียกว่า "ลูกจ้าง")`),
    new Paragraph({ spacing: { after: 100 } }),
    para('คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญาจ้างงานพนักงานขับรถบรรทุก โดยมีข้อกำหนดและเงื่อนไขดังต่อไปนี้'),
    new Paragraph({ spacing: { after: 80 } }),

    sectionHead('ข้อ 1.  ลักษณะงานและหน้าที่ความรับผิดชอบ'),
    para('1.1  ลูกจ้างตกลงทำหน้าที่ขับรถบรรทุกของนายจ้าง ขนส่งสินค้าหรือวัสดุตามเส้นทางและจุดหมายปลายทางที่นายจ้างหรือผู้ได้รับมอบหมายกำหนด'),
    para('1.2  ลูกจ้างต้องดูแลรักษาสินค้าและพาหนะให้อยู่ในสภาพดี ปลอดภัย ตลอดเวลาที่ปฏิบัติงาน'),
    para('1.3  ลูกจ้างต้องปฏิบัติตามกฎหมายจราจรและกฎหมายขนส่งอย่างเคร่งครัด'),
    para('1.4  ลูกจ้างต้องปฏิบัติตามระเบียบ ข้อบังคับ และคำสั่งของนายจ้างโดยชอบด้วยกฎหมาย'),
    para('1.5  ลูกจ้างต้องรายงานสภาพรถ อุบัติเหตุ หรือเหตุผิดปกติใดๆ ให้นายจ้างทราบทันที'),

    sectionHead('ข้อ 2.  พาหนะและทรัพย์สินของนายจ้าง'),
    para(`2.1  รถบรรทุกที่ใช้ในการปฏิบัติงาน: ทะเบียน ${license_plate || '.....................'}`),
    para('2.2  พาหนะและอุปกรณ์ทุกชิ้นเป็นกรรมสิทธิ์ของนายจ้าง ลูกจ้างไม่มีสิทธินำไปใช้เพื่อประโยชน์ส่วนตัวโดยไม่ได้รับอนุญาต'),
    para('2.3  ลูกจ้างต้องนำรถเข้ารับการตรวจสภาพตามกำหนด และแจ้งนายจ้างเมื่อพบความบกพร่องของพาหนะ'),

    sectionHead('ข้อ 3.  ค่าจ้างและการจ่ายเงิน'),
    para(`3.1  นายจ้างตกลงจ่ายเงินเดือนพื้นฐาน ${formatMoney(base_salary)} บาท/เดือน`),
    para(`3.2  ค่าเที่ยวคำนวณจาก ${commissionPct}% ของค่าขนส่งที่นายจ้างเรียกเก็บจากลูกค้าในแต่ละเที่ยว`),
    para('3.3  นายจ้างจะจ่ายค่าจ้างรวม (เงินเดือนพื้นฐาน + ค่าเที่ยวสะสมทั้งเดือน) ทุกวันที่ 1 ของเดือน'),
    para(`3.4  โอนเงินเข้าบัญชี: ธนาคาร ${bank_name || '....................'}  เลขที่บัญชี ${bank_account || '....................'}`),

    sectionHead('ข้อ 4.  ค่าใช้จ่ายในการปฏิบัติงาน'),
    para('4.1  นายจ้างเป็นผู้รับผิดชอบค่าใช้จ่ายทุกรายการที่เกิดขึ้นจากการปฏิบัติงาน ได้แก่:'),
    bullet('ค่าน้ำมันเชื้อเพลิง'),
    bullet('ค่าทางด่วน / ค่าผ่านทาง'),
    bullet('ค่าจอดรถ'),
    bullet('ค่าซ่อมบำรุงตามวาระที่นายจ้างกำหนด'),
    bullet('ค่าใช้จ่ายอื่นๆ ที่เกี่ยวข้องกับงานและได้รับอนุมัติจากนายจ้าง'),
    para('4.2  ลูกจ้างต้องเก็บใบเสร็จ/หลักฐานค่าใช้จ่ายทุกรายการเพื่อเบิกคืนจากนายจ้างตามระเบียบที่กำหนด'),
    para('4.3  ค่าปรับจราจรหรือค่าเสียหายที่เกิดจากความประมาทเลินเล่อของลูกจ้าง ลูกจ้างต้องรับผิดชอบด้วยตนเอง'),

    sectionHead('ข้อ 5.  การรับผิดชอบความเสียหาย'),
    para(`5.1  กรณีสินค้าสูญหายหรือเสียหายจากความประมาทของลูกจ้าง ลูกจ้างรับผิดชอบชดใช้ตามมูลค่าจริง แต่ไม่เกิน ${formatMoney(max_liability)} บาท`),
    para('5.2  กรณีเกิดอุบัติเหตุ ลูกจ้างต้องแจ้งนายจ้างและบริษัทประกันภัยทันที ไม่เคลื่อนย้ายพาหนะก่อนได้รับอนุญาต เว้นแต่จำเป็นต้องระงับอันตราย'),

    sectionHead('ข้อ 6.  วันและเวลาทำงาน'),
    para(`6.1  ลูกจ้างทำงานตามตารางงานที่นายจ้างกำหนด: ${work_schedule}`),
    para('6.2  กรณีมีงานเร่งด่วนหรืองานนอกเวลา นายจ้างจะแจ้งล่วงหน้าและตกลงค่าตอบแทนพิเศษก่อนออกงาน'),
    para('6.3  ลูกจ้างมีสิทธิลาพักร้อน ลาป่วย ลากิจ ตามที่กฎหมายแรงงานกำหนด'),

    sectionHead('ข้อ 7.  ระยะเวลาสัญญาและการเลิกสัญญา'),
    `7.1  สัญญาฉบับนี้มีผลตั้งแต่วันที่ ${thaiStartDate} จนกว่าคู่สัญญาฝ่ายใดฝ่ายหนึ่งจะบอกเลิก`,
    '7.2  คู่สัญญาฝ่ายใดฝ่ายหนึ่งมีสิทธิบอกเลิกสัญญาได้โดยแจ้งเป็นลายลักษณ์อักษรล่วงหน้าไม่น้อยกว่า 30 วัน',
    '7.3  นายจ้างมีสิทธิเลิกจ้างทันทีหากลูกจ้างกระทำการทุจริต ขับรถขณะมึนเมา หรือละทิ้งหน้าที่เกิน 3 วันทำการ',

    sectionHead('ข้อ 8.  สวัสดิการและสิทธิประโยชน์'),
    para('8.1  ลูกจ้างได้รับสิทธิประกันสังคมตามกฎหมาย โดยนายจ้างเป็นผู้นำส่งเงินสมทบในส่วนของนายจ้าง'),
    para('8.2  นายจ้างจัดให้มีประกันอุบัติเหตุสำหรับลูกจ้างขณะปฏิบัติงาน'),

    sectionHead('ข้อ 9.  การรักษาความลับ'),
    para('9.1  ลูกจ้างต้องไม่เปิดเผยข้อมูลเส้นทาง ลูกค้า ราคา หรือข้อมูลทางธุรกิจของนายจ้างต่อบุคคลภายนอก ทั้งในระหว่างและหลังสิ้นสุดสัญญา'),

    new Paragraph({ spacing: { before: 300 } }),
    para('สัญญานี้ทำขึ้นสองฉบับมีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความในสัญญาโดยตลอดแล้ว จึงได้ลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน'),
    new Paragraph({ spacing: { before: 400 } }),
  ].flatMap(x => typeof x === 'string' ? [para(x)] : [x]);

  // Signature table
  const sigTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorder(),
    rows: [
      new TableRow({ children: [
        new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorder(), children: [
          para('(ลงชื่อ) ..................................... (นายจ้าง  หจก.ณสิริทรัพย์)'),
        ]}),
        new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorder(), children: [
          para(`(ลงชื่อ) ..................................... (ลูกจ้าง)`),
        ]}),
      ]}),
      new TableRow({ children: [
        new TableCell({ borders: noBorder(), children: [para('วันที่ ........ / ........ / ........')] }),
        new TableCell({ borders: noBorder(), children: [para(`( ${driver_name} )`)] }),
      ]}),
      new TableRow({ children: [
        new TableCell({ borders: noBorder(), children: [new Paragraph('')] }),
        new TableCell({ borders: noBorder(), children: [para('วันที่ ........ / ........ / ........')] }),
      ]}),
      new TableRow({ children: [
        new TableCell({ borders: noBorder(), children: [para('(ลงชื่อ) ..................................... (พยาน)')] }),
        new TableCell({ borders: noBorder(), children: [para('(ลงชื่อ) ..................................... (พยาน)')] }),
      ]}),
    ],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Sarabun', size: 28 } } } },
    sections: [{ children: [...children, sigTable] }],
  });

  const buffer = await Packer.toBuffer(doc);

  // Save audit record
  if (driver_id) {
    await supabase.from('employment_contracts').insert({
      driver_id, driver_name, license_plate, start_date, base_salary,
      commission_rate, bank_name, bank_account, max_liability, work_schedule,
      generated_by: user.id,
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`สัญญาจ้าง_${driver_name}.docx`)}`,
    },
  });
}
