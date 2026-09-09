#!/bin/bash
# Builds and pushes the voice-agent container image via AWS CodeBuild — no
# local Docker required. Zips agent-app/, uploads it as the CodeBuild
# source (S3, ad-hoc — the CDK project has no fixed source), starts a
# build, and polls until it finishes.
#
# Prerequisites: `cdk deploy` has already created the ECR repo + CodeBuild
# project (see lib/voice-agent-infra-stack.ts), and this shell has AWS
# credentials with codebuild:StartBuild / s3:PutObject permissions.
set -euo pipefail

STACK_NAME="VoiceAgentInfraStack"
REGION="${AWS_REGION:-us-east-1}"

BUILD_PROJECT=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='BuildProjectName'].OutputValue" --output text)
REPO_URI=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" --output text)

if [ -z "$BUILD_PROJECT" ] || [ "$BUILD_PROJECT" == "None" ]; then
  echo "Could not find the CodeBuild project — has 'cdk deploy' been run yet?"
  exit 1
fi

SOURCE_BUCKET="voiceerp" # reusing the existing voice-capture bucket for build source staging
SOURCE_KEY="voice-agent-build-source/$(date +%s).zip"

echo "Zipping agent-app/ ..."
cd "$(dirname "$0")/agent-app"
ZIP_PATH="/tmp/voice-agent-source.zip"
rm -f "$ZIP_PATH"
zip -r -q "$ZIP_PATH" . -x "node_modules/*" -x "dist/*"

echo "Uploading to s3://$SOURCE_BUCKET/$SOURCE_KEY ..."
aws s3 cp "$ZIP_PATH" "s3://$SOURCE_BUCKET/$SOURCE_KEY" --region "$REGION"

echo "Starting CodeBuild build ($BUILD_PROJECT) ..."
BUILD_ID=$(aws codebuild start-build \
  --project-name "$BUILD_PROJECT" \
  --source-type-override S3 \
  --source-location-override "$SOURCE_BUCKET/$SOURCE_KEY" \
  --region "$REGION" \
  --query 'build.id' --output text)

echo "Build started: $BUILD_ID — polling..."
while true; do
  STATUS=$(aws codebuild batch-get-builds --ids "$BUILD_ID" --region "$REGION" --query 'builds[0].buildStatus' --output text)
  echo "  status: $STATUS"
  case "$STATUS" in
    SUCCEEDED) echo "Build succeeded. Image: $REPO_URI:latest"; exit 0 ;;
    FAILED|FAULT|STOPPED|TIMED_OUT) echo "Build did not succeed ($STATUS). Check CloudWatch Logs for the build project."; exit 1 ;;
    *) sleep 10 ;;
  esac
done
