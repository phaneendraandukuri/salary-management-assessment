# ACME Salary Management — Product Requirements

## Goal and user
Enable ACME’s HR Manager to maintain salary records for 10,000 employees across multiple countries and answer basic organizational compensation questions through a web application.

## Functional scope
- **Employee directory:** Search by name or email; filter by country, department, and currency; sort and paginate. Display employee ID, name, department, role, country, currency, and current annual base salary.
- **Salary management:** Add employees and update salaries. Validate required fields, unique employee IDs, supported currencies, and positive salary amounts. Display salary-change history with old amount, new amount, and timestamp.
- **Compensation insights:** Show headcount and annual base salary totals, averages, medians, minima, and maxima, with country/department filters and breakdowns. Group every monetary figure by currency; overall headcount may span currencies.
- **Access:** Basic authentication for one HR demo user. Use synthetic employee data only.

## Decisions and assumptions
- **Compensation:** Salary means current annual base compensation; other compensation components are excluded.
- **Currencies:** Store salaries in their original currency and report separately by currency. This avoids exchange-rate and date assumptions and misleading mixed-currency aggregates, but provides no single cross-country compensation total.
- **History:** Record salary edits made through this application. History is not an effective-dated payroll ledger.
- **User:** One HR Manager can view and modify records; employee-facing access is excluded.

## Acceptance criteria
- The deployed frontend and backend support the primary workflows with 10,000 seeded employees.
- Search, filtering, sorting, and pagination run on the server and remain usable at the target size.
- Invalid inputs are rejected. Valid salary updates persist with a matching history record.
- Compensation calculations reflect current filters and never combine unlike currencies.
- Delivery includes a repeatable 10,000-employee seed script, local setup instructions, a functioning deployed application, and a short video demonstration.

## Deliberately excluded
Bonuses, equity, benefits, taxes, payroll/payslips, live or historical currency conversion, Excel import/export, bulk raises, multi-role permissions, approval flows, employee self-service, advanced analytics, and HR-system integrations. These require additional domain rules, security, or integration work beyond the focused salary-management scope. The seed script supplies demo data; it is not a spreadsheet migration tool.
