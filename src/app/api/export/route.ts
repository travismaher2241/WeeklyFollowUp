// Spreadsheet of one customer's Open and InProgress orders, for the customer to confirm or revise dates.
// Uses the same hourly cache as the page, so it never makes an extra Ostendo read.
import ExcelJS from 'exceljs';
import { NextRequest, NextResponse } from 'next/server';
import { getFollowUpData } from '@/lib/followup';
import { OstendoError } from '@/lib/ostendo';
import { showDate, todayMelbourne } from '@/lib/rules';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function excelDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function GET(req: NextRequest) {
  const customer = req.nextUrl.searchParams.get('customer')?.trim();
  if (!customer) return NextResponse.json({ error: 'Choose a customer first' }, { status: 400 });

  let data;
  try {
    data = await getFollowUpData();
  } catch (e) {
    const msg = e instanceof OstendoError ? e.message : 'Could not read Ostendo';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const quotes = req.nextUrl.searchParams.get('type') === 'quotes';
  // Optional list of chosen orders (row ids). Without it, every order for the customer is included.
  const picked = req.nextUrl.searchParams.get('orders');
  const only = picked === null ? null : new Set(picked.split(',').map((s) => s.trim()).filter(Boolean));
  const rows = data.rows
    .filter((r) => (quotes ? r.kind === 'quote' : r.kind === 'open' || r.kind === 'inprogress') && r.customer === customer)
    .filter((r) => quotes || !only || only.has(r.id))
    .sort((a, b) =>
      quotes
        ? (a.entered ?? '9999').localeCompare(b.entered ?? '9999')
        : (a.required ?? '9999').localeCompare(b.required ?? '9999'),
    );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Plasgain Weekly Follow-Up';
  const ws = wb.addWorksheet(quotes ? 'Quotes' : 'Orders', { views: [{ state: 'frozen', ySplit: 3, showGridLines: true }] });
  ws.columns = quotes
    ? [{ width: 16 }, { width: 60 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 50 }]
    : [{ width: 22 }, { width: 60 }, { width: 22 }, { width: 22 }, { width: 50 }];

  ws.getCell('A1').value = customer;
  ws.getCell('A1').font = { bold: true, size: 14 };

  const header = ws.getRow(3);
  header.values = quotes
    ? ['Quote Number', 'Description', 'Quote Date', 'Expiry Date', 'Value ex GST', 'Notes']
    : ['Purchase Order', 'Description', 'Current Required Date', 'Revised Required Date', 'Notes'];
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F6ED' } };
    c.border = { bottom: { style: 'thin', color: { argb: 'FF00A651' } } };
    c.alignment = { vertical: 'middle' };
  });

  rows.forEach((r, i) => {
    const row = ws.getRow(4 + i);
    if (quotes) {
      row.values = [
        r.number,
        r.description,
        r.entered ? excelDate(r.entered) : null,
        r.expiry ? excelDate(r.expiry) : null,
        r.valueExGst,
        null,
      ];
      row.getCell(3).numFmt = 'dd/mm/yyyy';
      row.getCell(4).numFmt = 'dd/mm/yyyy';
      row.getCell(5).numFmt = '$#,##0.00';
    } else {
      row.values = [r.po, r.description, r.required ? excelDate(r.required) : 'Not set', null, null];
      row.getCell(3).numFmt = 'dd/mm/yyyy';
      row.getCell(4).numFmt = 'dd/mm/yyyy';
    }
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.alignment = { vertical: 'top', wrapText: col === 2 || col === (quotes ? 6 : 5) };
    });
  });
  if (rows.length === 0)
    ws.getCell('A4').value = quotes ? 'No outstanding quotes for this customer.' : 'No open or in-progress orders for this customer.';

  const buf = await wb.xlsx.writeBuffer();
  const safe = customer.replace(/[^\w\s.&-]/g, '').trim().slice(0, 60) || 'customer';
  const filename = `${safe} - ${quotes ? 'quotes' : 'orders'} - ${showDate(todayMelbourne()).replace(/\//g, '-')}.xlsx`;
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
