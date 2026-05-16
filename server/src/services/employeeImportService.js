const { all, get, run } = require("../db/localDb");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function rowToObject(headers, row) {
  return headers.reduce((acc, header, index) => {
    acc[normalizeHeader(header)] = row[index] || "";
    return acc;
  }, {});
}

async function companyMap() {
  const companies = await all("SELECT * FROM companies");
  return companies.reduce((acc, company) => {
    acc[company.code.toLowerCase()] = company;
    acc[company.name.toLowerCase()] = company;
    return acc;
  }, {});
}

async function importEmployeesCsv(buffer) {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  if (rows.length < 2) return { imported: 0, skipped: 0, errors: ["Upload file has no employee rows."] };

  const headers = rows[0];
  const companies = await companyMap();
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (let index = 1; index < rows.length; index += 1) {
    const item = rowToObject(headers, rows[index]);
    const companyKey = String(item.companycode || item.company || "").toLowerCase();
    const company = companies[companyKey];
    const employeeCode = item.employeecode || item.employeeid || item.employee;
    const fullName = item.fullname || item.employeename || item.name;

    if (!company || !employeeCode || !fullName) {
      skipped += 1;
      errors.push(`Row ${index + 1}: company, employee code, and full name are required.`);
      continue;
    }

    await run(
      `INSERT INTO employees (
        company_id, employee_code, full_name, department, shift, email, phone, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(company_id, employee_code) DO UPDATE SET
        full_name = excluded.full_name,
        department = excluded.department,
        shift = excluded.shift,
        email = excluded.email,
        phone = excluded.phone,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP`,
      [
        company.id,
        employeeCode,
        fullName,
        item.department || "",
        item.shift || "",
        item.email || "",
        item.phone || "",
        item.status || "Active"
      ]
    );
    imported += 1;
  }

  return { imported, skipped, errors: errors.slice(0, 25) };
}

module.exports = { importEmployeesCsv, parseCsv };
