function attendanceWhere(query) {
  const clauses = [];
  const params = [];

  if (query.startDate) {
    clauses.push("attendance_date >= ?");
    params.push(query.startDate);
  }
  if (query.endDate) {
    clauses.push("attendance_date <= ?");
    params.push(query.endDate);
  }
  if (query.employee) {
    clauses.push("(employee_id LIKE ? OR employee_name LIKE ?)");
    params.push(`%${query.employee}%`, `%${query.employee}%`);
  }
  if (query.department) {
    clauses.push("department = ?");
    params.push(query.department);
  }
  if (query.shift) {
    clauses.push("shift = ?");
    params.push(query.shift);
  }
  if (query.status) {
    clauses.push("status = ?");
    params.push(query.status);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

module.exports = { attendanceWhere };
