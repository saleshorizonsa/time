const columns = [
  ["attendance_date", "Date"],
  ["employee_id", "Employee ID"],
  ["employee_name", "Employee"],
  ["department", "Department"],
  ["shift", "Shift"],
  ["check_in", "Check In"],
  ["check_out", "Check Out"],
  ["status", "Status"],
  ["overtime_minutes", "Overtime Minutes"]
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buildExcel(records) {
  const header = columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const rows = records
    .map((record) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(record[key])}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
    th { background: #e8eef8; font-weight: bold; }
    th, td { border: 1px solid #9ca3af; padding: 6px; white-space: nowrap; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${header}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  return Buffer.from(html, "utf8");
}

function escapePdfText(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfObjects(lines) {
  const content = [
    "BT",
    "/F1 16 Tf",
    "40 555 Td",
    "(Attendance Report) Tj",
    "/F1 8 Tf",
    "0 -24 Td",
    ...lines.map((line) => [`(${escapePdfText(line)}) Tj`, "0 -12 Td"]).flat(),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];

  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(parts.join("")));
    parts.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });
  const xrefOffset = Buffer.byteLength(parts.join(""));
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => {
    parts.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  });
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.from(parts.join(""), "binary");
}

function buildPdf(records) {
  const lines = [
    "Date | Employee | Department | Shift | Check In | Check Out | Status | OT",
    ...records.slice(0, 36).map((record) =>
      [
        record.attendance_date || "",
        record.employee_name || record.employee_id || "",
        record.department || "",
        record.shift || "",
        record.check_in || "",
        record.check_out || "",
        record.status || "",
        record.overtime_minutes || 0
      ].join(" | ")
    )
  ];
  if (records.length > 36) lines.push(`Showing first 36 of ${records.length} records. Use Excel export for full data.`);
  return buildPdfObjects(lines);
}

module.exports = { buildExcel, buildPdf };
