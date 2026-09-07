# Vehicle reports and public listings

Admins and managers can open **Reports** from the employee navigation. Choose a date range, report, and vehicle (or All vehicles). Click **Run report** after changing dates. **Download CSV** exports the selected report and vehicles with the applied dates and generation timestamp. Clicking a car in the table opens its details.

## Report definitions

- **Trip performance:** all imported trips whose start date falls within the inclusive date range in `America/Detroit`. Earnings include all statuses, including cancellations; completed miles include completed trips with nonnegative recorded mileage. Missing earnings and mileage are counted separately. Trips without start dates cannot be placed in a period and are excluded. There is no 100-trip limit.
- **Income & expenses:** ledger entries dated within the inclusive range. Ledger net is ledger income minus ledger expenses. This is not a consolidated profit calculation across all sources.
- **Maintenance costs:** services by date performed, recorded costs, and the number of services with missing costs.
- **Fleet inventory:** current saved status and odometer, regardless of the selected period.

Trip earnings and maintenance costs may also be recorded in the ledger. These sources remain separate to avoid counting the same transaction twice. Unassigned trips and ledger entries appear in an Unassigned row and remain part of fleet totals. Vehicles with no activity still appear with zero recorded totals; zero totals do not establish that all source data has been imported.

`GET /api/reports/vehicles?from=YYYY-MM-DD&to=YYYY-MM-DD` requires an active admin or manager. Invalid or reversed dates return 400. The query aggregates each source before joining to the fleet, preventing multiple trips, services, and ledger entries from multiplying each other's amounts.

## Public descriptions and photos

Edit a vehicle to enter its public description or choose **Generate from VIN** for a starting draft. Generation uses decoded vehicle specifications; it does not save or publish. Review the text and click **Save Changes** to publish it on the car detail page. Internal notes remain separate. VIN rescans preserve the saved description.

Fleet and detail pages share a photo carousel, including previous/next controls, photo selectors, swipe navigation, and empty-photo handling. Fleet autoplay pauses on interaction and respects reduced-motion preferences.

The photo utility requires PowerShell 7 and a current Firebase ID token in `KWESTKARZ_AUTH_TOKEN` or `-AuthToken`. Name images after the vehicle license plate, for example `ABC1234.jpg`. It matches plates through the authenticated API and uploads primary photos with the appropriate image content type. Ambiguous or unmatched plates are skipped and reported as failures.

```powershell
./upload-photos.ps1 -PhotosFolder 'D:\path\to\photos' -WhatIf
./upload-photos.ps1 -PhotosFolder 'D:\path\to\photos'
```

The default target is the local API. A remote target must use HTTPS. The script does not access the database or SSH host.

## Validation

Run `dotnet test src/tests/KwestKarz.Tests`. To include the PostgreSQL integration test, set `KWESTKARZ_TEST_DATABASE` to a local connection string first. That test creates an isolated schema inside a transaction and rolls it back. It covers more than 100 trips, inclusive Michigan date boundaries, cancellations, missing values, zero-activity cars, unassigned records, and independent source totals. Without a local connection string, only that integration test is skipped.

Frontend checks: `npm run build` and ESLint on the changed components and `src/reportCsv.ts`. CSV values are quoted, embedded quotes are escaped, and text that could become a spreadsheet formula is prefixed with an apostrophe.

Deployment adds a nullable `description` column through the existing startup initializer; it requires no data backfill. Production release follows the repository's develop-to-main approval flow.
