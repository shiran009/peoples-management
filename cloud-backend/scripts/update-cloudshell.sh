#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_REGION=ap-southeast-2
ACTUAL="$(aws sts get-caller-identity --query Account --output text)"
[ "$ACTUAL" = "561633119560" ] || { echo "Wrong AWS account"; exit 1; }
npm ci
npm test
sam validate --lint --region "$AWS_REGION"
sam build
sam deploy --stack-name peoples-management-auth-pilot-v2 --region "$AWS_REGION" --resolve-s3 --capabilities CAPABILITY_IAM --parameter-overrides DataTableName=peoples-management-hr-data-v1 HRTablePrefix=peopleshr- EnableMasterData=true FrontendOrigin=https://main.d2lciijqwiwovz.amplifyapp.com --confirm-changeset
