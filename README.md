# Peoples Management

HR application with a React frontend and an AWS DynamoDB backend under active migration.

## Current connection

The hosted Amplify frontend uses https://g8d9gmzyg5.execute-api.ap-southeast-2.amazonaws.com.
The AWS API uses DynamoDB. Its health response reports storageReady=true and
migrationComplete=false. All 117 source tables were imported as peopleshr-* tables.
Authentication, people/profile and dashboard reads, and selected EIM configuration
operations have been migrated. Other workflows are not yet supported by the cloud API.

## Local development with DynamoDB

Use the codex/dynamodb-backend branch until the complete backend migration is merged.
Install a supported Node.js LTS release. Each developer must obtain separately approved,
scoped AWS access and configure their own AWS profile; cloning this repo grants no access.
Never commit AWS credentials or share production secrets. Prefer separate development tables.

```powershell
# Terminal 1
cd cloud-backend
npm ci
Copy-Item .env.example .env
# Configure your AWS profile, deployed table names, and your own local JWT secret.
npm start

# Terminal 2
cd frontend
npm ci --legacy-peer-deps
npm run dev
```

Frontend: http://localhost:5174. Local DynamoDB backend: http://localhost:3002.
The frontend defaults to this backend; VITE_API_URL overrides it.
Existing ignored local .env files may still contain older settings: review them privately.

## Migration boundary

cloud-backend/ is the DynamoDB implementation. backend/ and database/ contain the
legacy MySQL workflows and schema retained until their replacements are complete.
They are not the default setup. Do not uninstall MySQL or delete source data yet.
Employee writes, leave/attendance workflows, documents, and other remaining modules
need implementation and verification before full SQL removal. See cloud-backend/README.md.

## Verification

Run npm test in cloud-backend/ and npm run build in frontend/.
Secrets, exports, backups, installed dependencies and generated builds are excluded from Git.
