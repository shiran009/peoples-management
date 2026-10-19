#!/usr/bin/env bash
set -euo pipefail
export AWS_REGION=ap-southeast-2
export EXPECTED_AWS_ACCOUNT=561633119560
STACK=peoples-management-auth-pilot-v2
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
ACTUAL="$(aws sts get-caller-identity --query Account --output text)"
if [ "$ACTUAL" != "$EXPECTED_AWS_ACCOUNT" ]; then echo "Wrong AWS account; stopped."; exit 1; fi
command -v sam >/dev/null || { echo "AWS SAM CLI is required. Install it before continuing."; exit 1; }
node --version
npm ci
npm test
sam validate --lint --region "$AWS_REGION"
sam build
sam deploy --stack-name "$STACK" --region "$AWS_REGION" --resolve-s3 --capabilities CAPABILITY_IAM --confirm-changeset
export AUTH_TABLE="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" --query "Stacks[0].Outputs[?OutputKey=='AuthTableName'].OutputValue | [0]" --output text)"
node scripts/import-auth.cjs ../auth-export.json
API="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" --query "Stacks[0].Outputs[?OutputKey=='PilotApiUrl'].OutputValue | [0]" --output text)"
curl --fail "$API/health"
echo
echo "Auth pilot deployed: $API"
echo "Do not switch the full frontend to this URL: non-auth HR modules are not migrated."
