# KwestKarz Architecture

## Design Philosophy

KwestKarz is a **data-driven, API-first application** with these core principles:

1. **All data flows through APIs** — The frontend does not directly access files or databases. It communicates exclusively via HTTP REST endpoints.
2. **Key-based entity relationships** — Entities are linked by foreign keys (GUIDs) in the database, not by file paths.
3. **Centralized document storage** — Photos, receipts, and reports are stored with metadata in a documents table, linked to owners by type and ID.
4. **Stateless backend** — The API is stateless; all state lives in PostgreSQL.
5. **Role-based access control** — Users have roles (admin/manager/worker) enforced via middleware on every request.

## Data Model

### Core Entities

**vehicles** table:
- `id` (UUID): Primary key
- `vin` (text): Vehicle Identification Number, unique
- `year`, `make`, `model`, `trim`: VIN decode results (from NHTSA)
- `body_class`, `transmission`: VIN decode results (from NHTSA)
- `color`, `license_plate`, `license_plate_state`: Vehicle identifiers
- `status`: One of Active/Inactive/InShop/Staging/Sold
- `current_odometer`: Latest recorded mileage
- `created_at`, `updated_at`: Timestamps

**documents** table:
- `id` (UUID): Primary key
- `owner_type` (text): Vehicle | MaintenanceRecord | DiagnosticReport | IncidentRecord
- `owner_id` (UUID): Foreign key to the owning entity
- `kind` (text): CarPhoto | Receipt | Obd2Report | Inspection | Registration | Insurance | LicensePlate | Other
- `original_file_name`: Name of the file when uploaded
- `content_type`: MIME type (e.g., image/jpeg, application/pdf)
- `storage_path`: Relative path to file on disk
- `size_bytes`: File size in bytes
- `content_bytes`: Binary content (BLOBs for smaller files)
- `created_at`: Upload timestamp

Supporting tables: `maintenance_records`, `tire_pressure_specs`, `tire_pressure_logs`, `vehicle_compliance_records`, `workflow_instances`, `workflow_steps`, `lock_boxes`, `scan_jobs`, `system_logs`.

## Document Storage Pattern

### Storing Images

1. User uploads a photo via the camera capture or file picker
2. Backend receives the file, stores it on disk (in `storage` directory), and records metadata in `documents` table:
   ```sql
   INSERT INTO documents (id, owner_type, owner_id, kind, original_file_name, content_type, storage_path, size_bytes, created_at)
   VALUES (uuid, 'Vehicle', vehicle_id, 'CarPhoto', 'IMG_001.jpg', 'image/jpeg', 'storage/vehicles/img-001.jpg', 12345, now())
   ```

### Retrieving Images

Frontend never constructs file paths. Instead:

1. Fetch document list: `GET /api/vehicles/{vehicleId}/documents`
   - Returns array of `DocumentRecord` with IDs and metadata
   - Example response:
     ```json
     [
       {
         "id": "550e8400-e29b-41d4-a716-446655440000",
         "kind": "CarPhoto",
         "contentType": "image/jpeg",
         "originalFileName": "IMG_001.jpg",
         "sizeBytes": 12345,
         "createdAt": "2026-07-21T10:30:00Z"
       }
     ]
     ```

2. Render image: `<img src="/api/documents/{documentId}/content" />`
   - Backend looks up the document, validates access, and serves the file content
   - The URL never exposes file paths, storage layout, or directory structure

### Why This Design?

- **Security**: File locations are opaque to clients; storage can be reorganized without breaking the API
- **Flexibility**: Documents can be stored on disk, in S3, in a CDN, or as BLOBs; the API layer abstracts this
- **Auditability**: Every document has metadata (creator, timestamp, mime type) in the database
- **Role-based access**: The backend can enforce who can download which documents

## API Structure

### Public Endpoints

These are accessible without authentication and serve the public-facing website:

- `GET /api/public/vehicles` — List all active vehicles for the public fleet page
- `GET /api/vehicles/{vehicleId}/documents` — Public: fetch images for car detail page

### Authenticated Endpoints

These require a valid Firebase JWT in the `Authorization: Bearer <token>` header and route through role-based middleware:

- `GET /api/vehicles` — List vehicles (all roles)
- `POST /api/vehicles` — Create vehicle (admin/manager)
- `PUT /api/vehicles/{vehicleId}` — Update vehicle (admin/manager)
- `POST /api/vehicles/decode-vin` — Decode single VIN via NHTSA (all roles)
- `POST /api/vehicles/rescan-vins` — Bulk rescan all VINs (admin only)

### Documents API

- `GET /api/vehicles/{vehicleId}/documents` — List images and documents for a vehicle
- `POST /api/vehicles/{vehicleId}/documents` — Upload a document
- `GET /api/documents/{documentId}/content` — Download document content
- `POST /api/vehicles/{vehicleId}/documents/receipt` — Upload receipt with auto-processing

## Authentication & Authorization

### JWT Flow

1. User authenticates via Firebase phone auth
2. Firebase returns a JWT signed by Google
3. Frontend includes JWT: `Authorization: Bearer <firebase-jwt>`
4. Backend validates JWT against Google's JWKS endpoint
5. JWT contains `user_id` claim; backend looks up user from `users` table
6. Middleware injects `X-Role` and `X-Operator` headers for the request

### Role Levels

- **admin**: Full access to all endpoints, including admin operations like rescan-vins
- **manager**: Operational access, can create/update vehicles and records
- **worker**: Read-most, can log maintenance and upload documents
- **pending**: Account registered but not yet approved (403 Forbidden)
- **suspended**: Account was approved but later suspended (403 Forbidden)

### Role Checking

Certain endpoints explicitly check the `X-Role` header:

```fsharp
let role = httpContext.Request.Headers["X-Role"].ToString()
if role <> "admin" then
    return Results.Forbid()  // Only admin can proceed
```

## Current Endpoints

See [README.md](README.md#current-backend-api) for the full list.

**New VIN endpoints (POST):**
- `/api/vehicles/decode-vin` — Decode a single VIN (all roles)
  - Request: `{ "vin": "XXXXXXXXXXXXXXXXX" }`
  - Response: `{ year, make, model, trim, bodyClass, transmission, errorMessage }`
  
- `/api/vehicles/rescan-vins` — Rescan all vehicle VINs and update database (admin only)
  - Returns: `{ totalScanned, successCount, failureCount, results: [...] }`
  - Each result includes: vehicleId, vin, bodyClass, transmission, success, error

## Frontend Architecture

### Typical Data Flow

1. **Load vehicle details**: `GET /api/vehicles`
2. **Fetch images**: `GET /api/vehicles/{vehicleId}/documents` → filter for contentType=image/*
3. **Render images**: `<img src="/api/documents/{documentId}/content" />`
4. **Update vehicle**: `PUT /api/vehicles/{vehicleId}` with updated fields
5. **Upload photo**: `POST /api/vehicles/{vehicleId}/documents` with FormData
6. **Check compliance**: `GET /api/vehicles/{vehicleId}/compliance` → returns records linked by ID

### No Path-Based Storage

❌ **DO NOT** store or construct paths:
```typescript
// WRONG - violates architecture
const imageUrl = `/var/www/kwestkarz/images/vehicles/${vin}.jpg`
vehicle.primaryImageUrl  // stored as a path — violates API design
```

✅ **DO** use IDs and API endpoints:
```typescript
// CORRECT
const docs = await fetch(`/api/vehicles/${vehicleId}/documents`)
const images = docs.filter(d => d.contentType?.startsWith('image/'))
const imageUrl = `/api/documents/${images[0].id}/content`
```

## VIN Decode System

The application integrates with the NHTSA free vehicle API to decode VINs.

### Single VIN Decode

Endpoint: `POST /api/vehicles/decode-vin`
- Request body: `{ "vin": "1HGBH41JXMN109186" }`
- Calls: `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/{vin}?format=json`
- Parses response and extracts: year, make, model, trim, bodyClass, transmission
- Returns parsed result or error

### Bulk VIN Rescan

Endpoint: `POST /api/vehicles/rescan-vins` (admin only)
- Fetches all vehicles from database
- For each vehicle, decodes its VIN via NHTSA
- Updates the vehicle record with decoded fields (bodyClass, transmission)
- Returns summary: { totalScanned, successCount, failureCount, results }

### Database Integration

After rescan, the vehicles table is updated:
```sql
UPDATE vehicles
SET body_class = 'SUV', transmission = 'Automatic'
WHERE id = vehicle_id
```

The frontend can then display these fields from the vehicle response without additional API calls.

## Common Issues & Solutions

### Issue: "How do I show a car image?"

**Solution**: Fetch documents, then use document ID in img src:
```typescript
const docs = await fetch(`/api/vehicles/${id}/documents`)
const images = docs.filter(d => d.contentType?.startsWith('image/'))
return <img src={`/api/documents/${images[0].id}/content`} />
```

For list views showing many vehicles, avoid N+1 queries. Options:
- Show no images on list, only on detail page (current approach)
- Add an API endpoint to return vehicle list with first image document ID
- Cache the document list in local storage after fetching on detail page

### Issue: "primaryImageUrl field is missing"

**Solution**: This field was removed to enforce API-based architecture. All images must be fetched from the documents API using `/api/documents/{id}/content` endpoints. This ensures:
- Security: URLs are opaque to clients
- Flexibility: Storage backend can change without breaking the API
- Auditability: All document access is logged and validated

### Issue: "Images aren't showing"

**Checklist**:
- [ ] Did you upload the image as a document? (check documents table)
- [ ] Did you fetch the documents API? (not constructing a path)
- [ ] Is the document's kind set to 'CarPhoto'?
- [ ] Is the contentType set to 'image/jpeg' or similar?
- [ ] Is the img src using `/api/documents/{id}/content`?

### Issue: "Admin endpoints return 403"

**Solution**: Check the `X-Role` header is being set by middleware. The user must be approved and have role='admin' in the users table.

## Deployment Notes

### Storage Layout

In production, `Storage:RootPath` is configured to point to a persistent volume. All uploaded files go there:
```
storage/
  vehicles/
    550e8400-e29b-41d4-a716-446655440000.jpg
    550e8400-e29b-41d4-a716-446655440001.pdf
  maintenance/
    ...
```

The storage_path column stores relative paths; the backend resolves them at serve time.

### No Hardcoded Paths

Never hardcode paths like `/var/www/kwestkarz/images/vehicles/{vin}.jpg`. The storage layer is abstracted; the API is the contract.

### Database Migrations

Schema changes go in `DatabaseInitializer.fs` and are applied on startup via `EnsureCreatedAsync()`. The initializer is idempotent and uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
