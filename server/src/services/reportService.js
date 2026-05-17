const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const COLUMNS = [
  { header: "Date",            key: "attendance_date",  width: 13 },
  { header: "Employee ID",     key: "employee_id",       width: 15 },
  { header: "Employee Name",   key: "employee_name",     width: 26 },
  { header: "Department",      key: "department",        width: 18 },
  { header: "Shift",           key: "shift",             width: 14 },
  { header: "Check In",        key: "check_in",          width: 22 },
  { header: "Check Out",       key: "check_out",         width: 22 },
  { header: "Status",          key: "status",            width: 13 },
  { header: "Late (min)",      key: "late_minutes",      width: 11 },
  { header: "Early Out (min)", key: "early_out_minutes", width: 15 },
  { header: "OT (min)",        key: "overtime_minutes",  width: 10 }
];

async function buildExcel(records, meta = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Time Attendance System";
  wb.created = new Date();

  const ws = wb.addWorksheet("Attendance Report");
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FF1E3A5F" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E4F0" } };
  headerRow.border = {
    bottom: { style: "medium", color: { argb: "FF1E3A5F" } }
  };

  // Add meta rows at top if provided
  if (meta.dateRange || meta.generatedAt) {
    // Insert 2 rows before the header for metadata
    ws.spliceRows(1, 0, [`Report period: ${meta.dateRange || "All"}`], [`Generated: ${meta.generatedAt || new Date().toISOString()}`]);
    ws.getRow(1).font = { italic: true, color: { argb: "FF555555" } };
    ws.getRow(2).font = { italic: true, color: { argb: "FF555555" } };
    // Re-style the actual header (now row 3)
    const newHeader = ws.getRow(3);
    newHeader.font = { bold: true, color: { argb: "FF1E3A5F" } };
    newHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E4F0" } };
  }

  // Data rows with alternating fill
  records.forEach((r, i) => {
    const row = ws.addRow(COLUMNS.reduce((acc, c) => { acc[c.key] = r[c.key] ?? ""; return acc; }, {}));
    if (i % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
    }
  });

  // Totals row
  const totals = ws.addRow({
    attendance_date: `TOTAL (${records.length} records)`,
    late_minutes:       records.reduce((s, r) => s + (Number(r.late_minutes) || 0), 0),
    early_out_minutes:  records.reduce((s, r) => s + (Number(r.early_out_minutes) || 0), 0),
    overtime_minutes:   records.reduce((s, r) => s + (Number(r.overtime_minutes) || 0), 0)
  });
  totals.font = { bold: true };
  totals.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E4F0" } };

  // Auto-filter on data header row
  const headerRowNum = meta.dateRange ? 3 : 1;
  ws.autoFilter = { from: { row: headerRowNum, column: 1 }, to: { row: headerRowNum, column: COLUMNS.length } };

  return wb.xlsx.writeBuffer();
}

// PDF table column layout for A4 landscape
const PDF_COLS = [
  { label: "Date",       key: "attendance_date",  width: 68 },
  { label: "Employee",   key: "employee_name",    width: 100, fallback: "employee_id" },
  { label: "Dept",       key: "department",        width: 80 },
  { label: "Shift",      key: "shift",             width: 60 },
  { label: "Check In",   key: "check_in",          width: 78, fmt: (v) => v ? String(v).replace("T", " ").slice(0, 16) : "" },
  { label: "Check Out",  key: "check_out",         width: 78, fmt: (v) => v ? String(v).replace("T", " ").slice(0, 16) : "" },
  { label: "Status",     key: "status",            width: 60 },
  { label: "Late",       key: "late_minutes",      width: 34 },
  { label: "OT",         key: "overtime_minutes",  width: 34 }
];

function buildPdf(records, meta = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width - 60; // usable width (landscape A4 ≈ 782)
    const totalColW = PDF_COLS.reduce((s, c) => s + c.width, 0);
    const scale = pageW / totalColW;
    const cols = PDF_COLS.map((c) => ({ ...c, w: Math.floor(c.width * scale) }));

    const drawHeaderRow = (y) => {
      doc.font("Helvetica-Bold").fontSize(8);
      let x = 30;
      cols.forEach((c) => {
        doc.text(c.label, x + 2, y, { width: c.w - 4, ellipsis: true, lineBreak: false });
        x += c.w;
      });
      doc.moveTo(30, y + 12).lineTo(30 + cols.reduce((s, c) => s + c.w, 0), y + 12).lineWidth(0.5).stroke();
    };

    // Title
    doc.font("Helvetica-Bold").fontSize(14).text("Attendance Report", { align: "center" });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9);
    if (meta.dateRange) doc.text(`Period: ${meta.dateRange}`, { align: "center" });
    doc.text(`Generated: ${meta.generatedAt || new Date().toLocaleString()}`, { align: "center" });
    if (meta.department) doc.text(`Department: ${meta.department}`, { align: "center" });
    doc.moveDown(0.6);

    const ROW_H = 14;
    let y = doc.y;

    drawHeaderRow(y);
    y += ROW_H + 2;

    doc.font("Helvetica").fontSize(7.5);
    records.forEach((row, i) => {
      if (y + ROW_H > doc.page.height - 40) {
        doc.addPage();
        y = 30;
        drawHeaderRow(y);
        y += ROW_H + 2;
        doc.font("Helvetica").fontSize(7.5);
      }

      if (i % 2 === 0) {
        doc.rect(30, y - 1, cols.reduce((s, c) => s + c.w, 0), ROW_H).fill("#f4f7fb").fillColor("black");
      }

      let x = 30;
      cols.forEach((c) => {
        const raw = row[c.key] ?? (c.fallback ? row[c.fallback] : "");
        const val = c.fmt ? c.fmt(raw) : String(raw ?? "");
        doc.text(val, x + 2, y, { width: c.w - 4, ellipsis: true, lineBreak: false });
        x += c.w;
      });
      y += ROW_H;
    });

    // Totals
    y += 4;
    doc.font("Helvetica-Bold").fontSize(8);
    doc.text(
      `Total: ${records.length} records | ` +
      `Late: ${records.reduce((s, r) => s + (Number(r.late_minutes) || 0), 0)} min | ` +
      `OT: ${records.reduce((s, r) => s + (Number(r.overtime_minutes) || 0), 0)} min`,
      30, y
    );

    doc.end();
  });
}

module.exports = { buildExcel, buildPdf };
