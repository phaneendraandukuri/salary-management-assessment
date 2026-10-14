# ACME Salary Management — Product Requirements (v1.0)

## Goal and user
Help ACME's HR manager replace spreadsheet-based salary administration for 10,000 employees across multiple countries. The web application must make salary records easier to maintain and answer basic questions about organizational compensation.

## In scope
1. **Employee directory:** Search by name/email; filter by country, department and currency; sort and paginate. Display employee ID, name, department, role, country, currency and current annual base salary.
2. **Salary management:** Add employees and update salaries. Validate required fields, unique employee IDs, supported currencies and positive salary amounts. Show a history of salary changes (old amount, new amount, timestamp).
3. **Compensation insights:** Show headcount and annual base salary totals, averages, medians, minima and maxima, with country/department filters and breakdowns. **Group all monetary figures by currency.** Never combine different currencies in a single salary total or average; overall headcount can span currencies.
4. **Access:** Basic authentication for a single HR demo user; synthetic data only.
5. **Delivery:** Repeatable 10,000-employee seed script, local setup instructions, deployed functioning app and short video demo.

## Decisions and assumptions
- **Pay definition:** Current **annual base compensation**, explicitly accepted by Incubyte; excludes other compensation components.
- **Currency strategy:** Retain each employee's salary in its original currency and report by currency rather than normalizing to one. This avoids exchange-rate/date assumptions and misleading mixed-currency aggregates, while sacrificing a single cross-country compensation total.
- **Audit:** Change history captures edits made through this application; it is not an effective-dated payroll ledger.
- **User:** One HR manager who can view and modify data; no employee-facing access.

## Quality and acceptance criteria
- The deployed frontend and backend support the primary workflows with 10,000 seeded records.
- Search, sort, filter and paginate on the server; maintain usable performance at the target size.
- Reject invalid inputs; persist valid salary updates with a matching history record.
- Compensation calculations honor current filters and currency boundaries.
- Follow **Red → Green → Refactor**; include deterministic tests for validation, salary changes, analytics and critical API behavior. Make small, meaningful, manually reviewed commits.
- Document architecture, trade-offs, performance considerations, setup and actual AI assistance.

## Deliberately left out
Bonuses, equity, benefits, taxes, payroll/payslips, live or historical FX conversion, Excel import/export, bulk raises, multi-role permissions, approval flows, employee self-service, advanced analytics and HR-system integrations. These need substantial additional domain rules, security or integration work. The seed script supplies demo data, not a general spreadsheet migration tool.
