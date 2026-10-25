// Test env — require FIRST in every smartcrop test file (before any app module).
// Fake credentials let the SDK presign URLs offline; no request ever leaves the
// process (every client is replaced by aws-sdk-client-mock).

Object.assign(process.env, {
  NODE_ENV: 'test',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST',
  AWS_SECRET_ACCESS_KEY: 'testsecrettestsecrettestsecrettestsecret',
  S3_BUCKET: 'legacy-bucket',
  SMARTCROP_ENABLED: 'true',
  SMARTCROP_IN_BUCKET: 'sc-in',
  SMARTCROP_JOBS_BUCKET: 'sc-jobs',
  SMARTCROP_OUT_BUCKET: 'sc-out',
  PIPELINE_JOBS_TABLE: 'pipeline-jobs',
  PROJECTS_TABLE: 'smartcrop-api-projects',
  RENDERS_TABLE: 'smartcrop-api-renders',
  STATE_MACHINE_ARN: 'arn:aws:states:us-east-1:123456789012:stateMachine:smartcrop',
  PLAN_LAMBDA_FUNCTION: 'smartcrop-plan',
  PIPELINE_FEATURES: process.env.TEST_PIPELINE_FEATURES || '',
  UPLOAD_PART_SIZE_BYTES: '16777216',
  UPLOAD_MAX_BYTES: '4294967296',
  STATUS_REFRESH_MIN_MS: '3000',
  PREVIEW_TIMEOUT_MS: '300',
})
