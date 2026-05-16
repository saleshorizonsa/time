# Employee Master And Upload

The Admin panel includes **Master Data** for:

- Four company records
- Employee master records
- CSV employee upload

## Companies

No mock companies are created automatically. Admin creates up to four real company records from the Master Data page before adding or uploading employees.

## CSV Upload Format

Use UTF-8 CSV.

Required columns:

```csv
companyCode,employeeCode,fullName
```

Optional columns:

```csv
department,shift,email,phone,status
```

Recommended full header:

```csv
companyCode,employeeCode,fullName,department,shift,email,phone,status
```

Example:

```csv
companyCode,employeeCode,fullName,department,shift,email,phone,status
COMP1,1001,Ahmed Ali,Operations,Day,ahmed@example.com,0500000001,Active
COMP2,2001,Sara Omar,Finance,Night,sara@example.com,0500000002,Active
COMP3,3001,Mohammed Khan,Warehouse,Evening,mohammed@example.com,0500000003,Inactive
```

If the same `companyCode + employeeCode` already exists, the upload updates the employee.

## API

```text
GET  /api/master-data/companies
PUT  /api/master-data/companies/:id
GET  /api/master-data/employees
POST /api/master-data/employees
PUT  /api/master-data/employees/:id
PATCH /api/master-data/employees/:id/mobile-access
POST /api/master-data/employees/upload
```

## Mobile Punch Access

Each employee has a Mobile Punch toggle in the employee list.

When the toggle is enabled:

- A Viewer user is created if one does not already exist.
- The employee can log in with personal email or Employee ID.
- A temporary password is shown once to the Admin.

When the toggle is disabled:

- The employee record remains.
- The linked login is blocked from mobile access.
