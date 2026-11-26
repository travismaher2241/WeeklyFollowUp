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
  wb.calcProperties.fullCalcOnLoad = true;
  // Orders have a "Confirm all" box above the table, so their header sits one row lower.
  const headRow = quotes ? 3 : 5;
  const ws = wb.addWorksheet(quotes ? 'Quotes' : 'Orders', { views: [{ state: 'frozen', ySplit: headRow, showGridLines: true }] });
  // Prints on one page width, landscape.
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const cols = quotes
    ? [{ width: 16 }, { width: 60 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 50 }]
    : [{ width: 18 }, { width: 55 }, { width: 22 }, { width: 14 }, { width: 24 }];
  ws.columns = all ? [{ width: 36 }, ...cols] : cols;
  const o = all ? 1 : 0; // column offset when the Customer column is first

  ws.getCell('A1').value = all ? (quotes
        ? 'All customers: outstanding quotes'
        : `All customers: ${status === 'open' ? 'open' : status === 'inprogress' ? 'in-progress' : 'open and in-progress'} orders`) : customer;
  ws.getCell('A1').font = { bold: true, size: 14 };

  const green = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F6ED' } } as const;
  const yellow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } } as const;
  const thin = { style: 'thin', color: { argb: 'FF8A9AA5' } } as const;
  const confirmCol = 4 + o; // "Confirmed" (Yes/No)
  const reviseCol = 5 + o; // "Revised Required Date"
  const colLetter = (n: number) => String.fromCharCode(64 + n);

  if (!quotes) {
    // One box to confirm every line at once. Each line can still be changed on its own.
    // The box sits right above the Confirmed column, labelled from the cell to its left.
    const label = ws.getCell(2, confirmCol - 1);
    label.value = 'Confirm all dates?';
    label.font = { bold: true };
    label.alignment = { horizontal: 'right', vertical: 'middle' };
    const box = ws.getCell(2, confirmCol);
    box.fill = yellow;
    box.border = { top: thin, left: thin, bottom: thin, right: thin };
    box.alignment = { horizontal: 'center', vertical: 'middle' };
    box.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Yes,No"'],
      showInputMessage: true,
      promptTitle: 'Confirm all',
      prompt: 'Choose Yes to confirm every date below.',
    };
    ws.getCell('A3').value =
      'Choose Yes to confirm every date, or Yes / No on each line. If a date needs to change, type the new date (dd/mm/yyyy) under Revised Required Date.';
    ws.getCell('A3').font = { italic: true, color: { argb: 'FF667085' } };
  }

  const header = ws.getRow(headRow);
  const heads = quotes
    ? ['Quote Number', 'Description', 'Quote Date', 'Expiry Date', 'Value ex GST', 'Notes']
    : ['Purchase Order', 'Description', 'Current Required Date', 'Confirmed', 'Revised Required Date'];
  header.values = all ? ['Customer', ...heads] : heads;
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = green;
    c.border = { bottom: { style: 'thin', color: { argb: 'FF00A651' } } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });

  const first = headRow + 1;
  rows.forEach((r, i) => {
    const n = first + i;
    const row = ws.getRow(n);
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
      row.values = [...lead, r.po, r.description, r.required ? excelDate(r.required) : 'Not set'];
      row.getCell(3 + o).numFmt = 'dd/mm/yyyy';
      const rev = `${colLetter(reviseCol)}${n}`;
      // Yes when "Confirm all" is Yes; No as soon as a revised date is typed. Choosing Yes/No here overrides it.
      const conf = row.getCell(confirmCol);
      conf.value = { formula: `IF(${rev}<>"","No",IF($${colLetter(confirmCol)}$2="Yes","Yes",""))`, result: '' };
      conf.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
      conf.alignment = { horizontal: 'center', vertical: 'top' };
      conf.border = { top: thin, left: thin, bottom: thin, right: thin };
      const revise = row.getCell(reviseCol);
      revise.numFmt = 'dd/mm/yyyy';
      revise.border = { top: thin, left: thin, bottom: thin, right: thin };
      revise.dataValidation = {
        type: 'date',
        operator: 'greaterThan',
        allowBlank: true,
        formulae: [new Date(Date.UTC(2020, 0, 1))],
        showInputMessage: true,
        promptTitle: 'New date',
        prompt: 'Type the new delivery date as dd/mm/yyyy',
        showErrorMessage: true,
        errorTitle: 'Not a date',
        error: 'Please type the date as dd/mm/yyyy, for example 15/12/2026.',
      };
    }
    row.eachCell({ includeEmpty: true }, (c, col) => {
      if (!quotes && (col === confirmCol)) return;
      c.alignment = { vertical: 'top', wrapText: col === 2 + o || (quotes && col === 6 + o) || (all && col === 1) };
    });
  });
  if (!quotes && rows.length) {
    const last = first + rows.length - 1;
    const c = colLetter(confirmCol);
    ws.addConditionalFormatting({
      ref: `${c}${first}:${c}${last}`,
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"Yes"'], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"No"'], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C5700' } } } },
      ],
    });
  }
  if (rows.length === 0)
    ws.getCell(`A${headRow + 1}`).value = quotes ? 'No outstanding quotes.' : 'No orders to list.';

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
