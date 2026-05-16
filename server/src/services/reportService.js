const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

function addReportColumns(sheet) {
  sheet.columns = [
    { header: "Date", key: "attendance_date", width: 14 },
    { header: "Employee ID", key: "employee_id", width: 16 },
    { header: "Employee", key: "employee_name", width: 24 },
    { header: "Department", key: "department", width: 18 },
    { header: "Shift", key: "shift", width: 16 },
    { header: "Check In", key: "check_in", width: 22 },
    { header: "Check Out", key: "check_out", width: 22 },
    { header: "Status", key: "status", width: 14 },
    { header: "Overtime Minutes", key: "overtime_minutes", width: 18 }
  ];
  sheet.getRow(1).font = { bold: true };
}

async function buildExcel(records) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Time Attendance Reporting";
  const sheet = workbook.addWorksheet("Attendance");
  addReportColumns(sheet);
  records.forEach((record) => sheet.addRow(record));
  sheet.autoFilter = "A1:I1";
  return workbook.xlsx.writeBuffer();
}

function buildPdf(records) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(16).text("Attendance Report", { align: "left" });
    doc.moveDown();
    doc.fontSize(9);
    doc.text("Date", 36, 86);
    doc.text("Employee", 100, 86);
    doc.text("Department", 250, 86);
    doc.text("Shift", 360, 86);
    doc.text("In", 450, 86);
    doc.text("Out", 555, 86);
    doc.text("Status", 660, 86);
    doc.moveTo(36, 102).lineTo(800, 102).stroke();

    let y = 112;
    records.slice(0, 120).forEach((record) => {
      if (y > 540) {
        doc.addPage();
        y = 48;
      }
      doc.text(record.attendance_date || "", 36, y, { width: 58 });
      doc.text(record.employee_name || record.employee_id || "", 100, y, { width: 140 });
      doc.text(record.department || "", 250, y, { width: 100 });
      doc.text(record.shift || "", 360, y, { width: 80 });
      doc.text(record.check_in || "", 450, y, { width: 95 });
      doc.text(record.check_out || "", 555, y, { width: 95 });
      doc.text(record.status || "", 660, y, { width: 80 });
      y += 18;
    });

    if (records.length > 120) {
      doc.moveDown().text(`Showing first 120 of ${records.length} records. Use Excel export for full data.`);
    }
    doc.end();
  });
}

module.exports = { buildExcel, buildPdf };
