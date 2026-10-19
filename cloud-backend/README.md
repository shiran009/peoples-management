# DynamoDB authentication pilot

This is a separate backend under staged migration, not a replacement for the complete HR API. Do not change Amplify's VITE_API_URL to this pilot yet. All non-authentication modules still require the existing MySQL backend. MySQL must stay available until every module and its data have migrated and passed validation.

## Implemented

- POST /api/auth/login
- GET /api/auth/me
- POST /api/auth/change-password (minimum 12 characters for new passwords)
- GET /health (liveness only; does not verify DynamoDB)
- Existing account IDs and bcrypt hashes, permissions and a snapshot of organizational identity.
- Other API paths return 501 MODULE_NOT_MIGRATED.

Identity and permissions are imported snapshots. Employee, hierarchy and permission editing must be migrated before these snapshots can support live administration. Password changes in the pilot do not sync back to MySQL; use the pilot only for testing before cutover. Password resets do not revoke already issued tokens yet.

## Local validation

From cloud-backend:

    npm ci
    npm test
    npm run migrate:auth

The last command reads backend/.env and the local MySQL database in a read-only consistent snapshot. It prints counts only. It does not upload data, create accounts, change passwords or require AWS credentials.

## AWS deployment (not executed)

Install AWS CLI v2 and AWS SAM CLI. Sign in with your AWS IAM Identity Center profile or another approved deployment role; do not put AWS access keys in this repository. Confirm the account is 561633119560 and region is ap-southeast-2.

    aws sts get-caller-identity
    sam validate --lint
    sam build
    sam deploy --guided --region ap-southeast-2 --stack-name peoples-management-auth-pilot

Review the CloudFormation changes before deployment. The stack creates an on-demand DynamoDB table with point-in-time recovery, an HTTP API, Lambda, a generated JWT secret, and logs. These AWS resources can incur charges. The table is retained if the stack is deleted. Lambda can only GetItem/UpdateItem on its auth table; the migration uses a separate operator identity.

The frontend origin defaults to https://main.d2lciijqwiwovz.amplifyapp.com. CORS includes the cache-control headers sent by the existing frontend.

After deployment, set AWS_REGION, AUTH_TABLE (stack output) and EXPECTED_AWS_ACCOUNT in your shell, then run:

    npm run migrate:auth -- --write

This checks the AWS account and requires an empty target table. It writes one user and one normalized-email lookup atomically per account. Existing hashes are copied, not decrypted or reset. A failure can leave a partial pilot import: inspect the failure and use a new empty pilot table rather than overwriting existing items. A MIGRATION#AUTH completion marker is written only after all accounts are imported.

## Remaining work before production

1. Validate the template with SAM and test against a disposable DynamoDB table in AWS.
2. Add integration tests covering transaction conditions, concurrent email changes, import interruption and real API Gateway CORS.
3. Migrate user/permission management, organization, employee information and onboarding.
4. Migrate leave, attendance, rosters, reporting, performance and assistant queries with explicit access patterns and indexes.
5. Move local uploads to S3 and preserve document links; test backups and restore.
6. Implement token revocation, account-based login throttling and operational alarms. Current API throttling is only an initial infrastructure limit.
7. Validate record counts and workflows, freeze writes for final migration, then switch Amplify VITE_API_URL and redeploy. Keep a tested rollback and SQL backup.
8. Remove mysql2, SQL routes and local MySQL only after the complete cutover is verified.

## Verified deployment progress

- Amplify hosting fixed and verified at https://main.d2lciijqwiwovz.amplifyapp.com/login (commit 6ece343).
- Auth stack peoples-management-auth-pilot-v2 deployed in ap-southeast-2; CloudShell confirmed 29 imported accounts.
- Auth endpoint: https://g8d9gmzyg5.execute-api.ap-southeast-2.amazonaws.com.
- Source inventory: 117 collections / 7,480 records. Private full export is excluded from Git under .migration/.
- People, invitation-list and organization-dashboard read routes are deployed to the existing v2 stack. Nine uploaded tests passed, and ten local tests include the CORS regression. The dashboard summary matches MySQL for the exported super-admin snapshot.
- Full collection import completed and verified: 117 collections / 7,480 records in peoples-management-hr-data-v1. An AWS read smoke check returned 29 users and 28 active employees.
- The v2 stack update completed successfully. Lambda has GetItem and Query access only on the HR data table. Public API checks: health 200, unauthenticated users/dashboard 401, login CORS preflight 204 with the exact Amplify origin.
- The AWS data smoke check exercised the service with an injected test actor; it does not prove a real user password login or end-to-end Lambda data reads.
- Production frontend API cutover is not complete. Other HR routes and all HR data writes remain unmigrated; keep MySQL and the SQL backup.

## Full collection export and import

Run node scripts/export-collections.cjs PRIVATE_OUTPUT_PATH to create a consistent read-only MySQL snapshot with primary-key metadata. It refuses to overwrite an export file.

Run node scripts/import-collections.cjs PRIVATE_INPUT_PATH with DATA_TABLE, EXPECTED_AWS_ACCOUNT, and AWS_REGION set to import into a pre-created DynamoDB table keyed by collection (HASH) and recordKey (RANGE). It refuses a nonempty target, retries unprocessed batch writes, verifies every collection count with strongly consistent queries, and writes a completion marker only after all counts match. A partial import must be inspected rather than overwritten.

Binary MySQL values retain their JSON Buffer representation in the export; a feature consuming such a value must explicitly decode it. Local uploaded files are not part of this export and still require an S3 migration.

## Separate DynamoDB tables (requested layout)

The new layout maps each original MySQL table to peopleshr-<source_table>. There are 117 target tables, including empty source tables. Original row attributes are top-level item fields; _hrRecordKey is a migration key derived from the exported SQL primary key. Composite SQL keys remain encoded without losing their component columns. SQL joins, foreign keys, uniqueness and auto-increment are not automatically implemented by DynamoDB.

scripts/separate-tables.py uses the previously uploaded private snapshot, checks AWS account and its digest, refuses unrelated existing tables, resumes only exact matching data, enables encryption, deletion protection and point-in-time recovery, and compares every imported item. It leaves the original combined table unchanged except for a separate completion marker.

HR_TABLE_PREFIX=peopleshr- switches the data repository to the separate tables. Its completion marker must identify every required table. Reads currently scan the 17 specific tables needed by the migrated modules; future modules should add appropriate access patterns/indexes. The template's conditional policy grants Scan on those exact 17 tables only. Applying this expanded Lambda data access requires user confirmation. Other HR modules and writes remain unmigrated.

### Separate-table deployment verified (2026-10-20)

- All 117 peopleshr- tables were created and every one of the 7,480 snapshot items compared with its source. Empty tables were created too. The original combined data table remains a snapshot/control table; PixeltechContacts was untouched.
- The v2 stack is UPDATE_COMPLETE with HR_TABLE_PREFIX=peopleshr-. Its inline Scan policy was read back and matched the exact 17 table ARNs needed by the implemented routes. Its only attached managed policy was AWSLambdaBasicExecutionRole. No HR-table writes or Pixeltech access were added.
- A real Lambda /health probe checked the migration marker and read a key-only, Limit=1 projection from each of the 17 separate tables. It returned HTTP 200 with storageReady=true. Successful probes cache for 30 seconds. Failed storage probes return generic HTTP 503 without data or AWS error details.
- Fifteen tests passed locally and in CloudShell. Service comparisons for people, invitations and dashboard matched the original imported layout, using an injected test actor; this is not a real password-login test.
- Post-switch public checks: health 200, unauthenticated people/dashboard 401, CORS 204 with the exact Amplify origin.
- IAM principal simulation reported an Organizations-level deny, including on the new Scan requests. No organization policies were modified. Actual Lambda storage probes succeeded, and the deployed role's exact policy scope was independently checked; do not treat the simulator output as a successful effective-permissions test.
- The DynamoDB console now lists 121 tables total: 117 separate HR tables plus the four pre-existing tables. Filter names by peopleshr- to see the 117 source-table copies over three pages at the current page size.
- Full frontend API cutover, remaining HR modules, write workflows and local file/S3 migration are still incomplete. Keep MySQL and the SQL backup.


## Current status (2026-10-20; supersedes earlier progress notes)

The production frontend has switched to the AWS API (frontend commit 43fa070).
The live health endpoint confirms storageReady=true and migrationComplete=false.
EIM configuration reads for 35 types and scoped writes for 15 lookup types were deployed.
The approved operator integration check created, edited and removed its temporary
membership record and retained three audit events. This does not prove a browser login
or an authenticated HTTP write. Self/admin profile and onboarding read routes are deployed.
The local backend listens on port 3002 and supports the frontend's localhost origins.
Each developer requires their own approved AWS profile and a private local JWT secret.
No developer credentials are distributed in this repository.

The legacy backend remains necessary for unmigrated workflows. Do not remove local
MySQL, SQL backups, or assume every HR feature works with DynamoDB yet.
