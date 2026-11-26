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
  // No customer means the full list, with a Customer column on every row.
  const customer = req.nextUrl.searchParams.get('customer')?.trim() ?? '';
  const all = !customer;

  let data;
  try {
    data = await getFollowUpData();
  } catch (e) {
    const msg = e instanceof OstendoError ? e.message : 'Could not read Ostendo';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const quotes = req.nextUrl.searchParams.get('type') === 'quotes';
  // Which orders: status=open, status=inprogress, or both (status=all or missing). Quotes are always separate.
  const status = req.nextUrl.searchParams.get('status');
  const wantKind = (k: string) => (status === 'open' || status === 'inprogress' ? k === status : k === 'open' || k === 'inprogress');
  // Optional list of chosen orders (row ids). Without it, every order for the customer is included.
  const picked = req.nextUrl.searchParams.get('orders');
  const only = picked === null ? null : new Set(picked.split(',').map((s) => s.trim()).filter(Boolean));
  const rows = data.rows
    .filter((r) => (quotes ? r.kind === 'quote' : wantKind(r.kind)) && (all || r.customer === customer))
    .filter((r) => quotes || !only || only.has(r.id))
    .sort((a, b) =>
      (all ? a.customer.localeCompare(b.customer) : 0) ||
      (quotes
        ? (a.entered ?? '9999').localeCompare(b.entered ?? '9999')
        : (a.required ?? '9999').localeCompare(b.required ?? '9999')),
    );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Plasgain Weekly Follow-Up';
  const ws = wb.addWorksheet(quotes ? 'Quotes' : 'Orders', { views: [{ state: 'frozen', ySplit: 3, showGridLines: true }] });
  const cols = quotes
    ? [{ width: 16 }, { width: 60 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 50 }]
    : [{ width: 22 }, { width: 60 }, { width: 22 }, { width: 22 }, { width: 50 }];
  ws.columns = all ? [{ width: 36 }, ...cols] : cols;

  ws.getCell('A1').value = all ? (quotes
        ? 'All customers: outstanding quotes'
        : `All customers: ${status === 'open' ? 'open' : status === 'inprogress' ? 'in-progress' : 'open and in-progress'} orders`) : customer;
  ws.getCell('A1').font = { bold: true, size: 14 };

  const header = ws.getRow(3);
  const heads = quotes
    ? ['Quote Number', 'Description', 'Quote Date', 'Expiry Date', 'Value ex GST', 'Notes']
    : ['Purchase Order', 'Description', 'Current Required Date', 'Revised Required Date', 'Notes'];
  header.values = all ? ['Customer', ...heads] : heads;
  const o = all ? 1 : 0; // column offset when the Customer column is first
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F6ED' } };
    c.border = { bottom: { style: 'thin', color: { argb: 'FF00A651' } } };
    c.alignment = { vertical: 'middle' };
  });

  rows.forEach((r, i) => {
    const row = ws.getRow(4 + i);
    const lead = all ? [r.customer] : [];
    if (quotes) {
      row.values = [
        ...lead,
        r.number,
        r.description,
        r.entered ? excelDate(r.entered) : null,
        r.expiry ? excelDate(r.expiry) : null,
        r.valueExGst,
        null,
      ];
      row.getCell(3 + o).numFmt = 'dd/mm/yyyy';
      row.getCell(4 + o).numFmt = 'dd/mm/yyyy';
      row.getCell(5 + o).numFmt = '$#,##0.00';
    } else {
      row.values = [...lead, r.po, r.description, r.required ? excelDate(r.required) : 'Not set', null, null];
      row.getCell(3 + o).numFmt = 'dd/mm/yyyy';
      row.getCell(4 + o).numFmt = 'dd/mm/yyyy';
    }
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.alignment = { vertical: 'top', wrapText: col === 2 + o || col === (quotes ? 6 : 5) + o || (all && col === 1) };
    });
  });
  if (rows.length === 0)
    ws.getCell('A4').value = quotes ? 'No outstanding quotes.' : 'No orders to list.';

  const buf = await wb.xlsx.writeBuffer();
  const safe = all ? 'All customers' : customer.replace(/[^\w\s.&-]/g, '').trim().slice(0, 60) || 'customer';
  const filename = `${safe} - ${quotes ? 'quotes' : status === 'open' ? 'open orders' : status === 'inprogress' ? 'in-progress orders' : 'orders'} - ${showDate(todayMelbourne()).replace(/\//g, '-')}.xlsx`;
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
