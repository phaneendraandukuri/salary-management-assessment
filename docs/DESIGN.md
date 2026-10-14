# Engineering decisions

## Annual salary input — Task 2

- Support uppercase INR, USD, EUR, and GBP. Each uses two fractional digits in this scope.
- Accept a positive decimal string with digits before the decimal point and, if present,
  one or two fractional digits. Reject signs, scientific notation, separators, whitespace,
  non-string values, and excess precision. Do not trim or round invalid input into validity.
- Normalize the fractional part to exactly two digits: `75000` → `75000.00`,
  `75000.5` → `75000.50`. Remove redundant leading whole-part zeros, retaining one zero
  for amounts below one: `00100.5` → `100.50`, `000.01` → `0.01`.
  This gives equivalent amounts the same string representation without changing their value.
- Keep the amount as a string throughout validation and normalization. After checking its
  syntax, any nonzero digit establishes positivity without floating-point conversion.
  There is no application-defined maximum salary; finite runtime resources still apply.
- Return an explicit success/error result. Check currency first; if both inputs are invalid,
  return `unsupported_currency`. The function is pure and has no I/O or framework dependency.

Decimal strings preserve exact values and serialize directly to JSON. Integer minor units
are an alternative, but JavaScript numbers require safe-integer bounds and `bigint` needs
explicit JSON serialization. A decimal library is unnecessary for validation without arithmetic.

Storage representation, database limits, arithmetic, and aggregate rounding are not implemented
or settled here. They require decisions before their respective increments. The validator
does not convert currencies or establish that arbitrary-sized input will fit a future database.
