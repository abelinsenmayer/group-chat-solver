# Infrastructure

CDK (TypeScript) app that deploys group-chat-solver to AWS: a CloudFront
distribution serving the built React SPA from S3, and routing `/api/*` to a
containerized FastAPI backend running on a Lambda Function URL
(response-streaming, for the multi-minute SSE `solve-restaurants` run).

## Prerequisites

- AWS CLI configured with credentials for the target account (`aws sts get-caller-identity` should succeed)
- Docker Desktop running (used to build the backend container image)
- Node.js 18+ with npm
- One-time per account/region: `cd infrastructure && npx cdk bootstrap`

## One-time secret setup

The backend and frontend read secrets from SSM `SecureString` parameters.
CloudFormation cannot create `SecureString` values, so create them once via
the AWS CLI before the first deploy:

```powershell
aws ssm put-parameter --name "/group-chat-solver/prod/mapbox-access-token" --type SecureString --value "<mapbox secret token>"
aws ssm put-parameter --name "/group-chat-solver/prod/tavily-api-key" --type SecureString --value "<tavily api key>"
aws ssm put-parameter --name "/group-chat-solver/prod/google-api-key" --type SecureString --value "<google api key>"
aws ssm put-parameter --name "/group-chat-solver/prod/langsmith-api-key" --type SecureString --value "<langsmith api key>"
aws ssm put-parameter --name "/group-chat-solver/prod/mapbox-public-token" --type SecureString --value "<mapbox public token>"
```

The `mapbox-access-token` is the server-side Mapbox token (isochrone
requests); `mapbox-public-token` is the browser-scoped token baked into the
frontend build. `google-api-key` is only required when `AI_PROVIDER` is set to
`gemini`; it can be a placeholder when running with Ollama.

## Install dependencies

```powershell
cd infrastructure
npm install
```

## Tests

Unit tests assert on the synthesized CloudFormation template (bucket policies, Lambda config, alarms, etc.) using `aws-cdk-lib/assertions`:

```powershell
cd infrastructure
npm test
```

## Synth / diff

Inspect the CloudFormation template that would be generated, or diff it against what's currently deployed, without deploying:

```powershell
cd infrastructure
npx cdk synth
npx cdk diff
```

## Deploy

```powershell
cd infrastructure
.\scripts\deploy.ps1
```

Cloud deploys always default to `AI_PROVIDER=gemini`, regardless of any
`ollama` default used for local development. To override this (e.g. to
deploy with `ollama` instead), set the `AI_PROVIDER` environment variable
before deploying — it takes precedence over the `gemini` default:

```powershell
$env:AI_PROVIDER = "ollama"
cd infrastructure
.\scripts\deploy.ps1
```

Unset `$env:AI_PROVIDER` (or open a fresh shell) to go back to the `gemini`
default on the next deploy.

This builds `frontend/dist` with `VITE_MAPBOX_ACCESS_TOKEN` pulled from SSM
and `VITE_API_BASE_URL` set to same-origin (CloudFront serves both the site
and `/api/*`), then runs `cdk deploy`. The stack output includes the
CloudFront domain name — that's the app's URL.

Re-run the same command to redeploy after code changes; the backend image is
rebuilt, the frontend is rebuilt and re-uploaded, and CloudFront is
invalidated automatically.

## Verify a deployment

1. Open the CloudFront domain from the `cdk deploy` output — the landing page should load.
2. `GET https://<cloudfront-domain>/api/people` should return the sample people JSON.
3. Run a full "solve restaurants" flow through the UI and confirm SSE events stream in without truncation or a timeout, even if the run takes several minutes.

## Teardown

```powershell
cd infrastructure
npx cdk destroy
```

The S3 bucket has `removalPolicy: RETAIN`, so it survives `cdk destroy` and
must be emptied and deleted manually via the console or CLI if it's no
longer needed.

## Local development

This infrastructure is not used for local development. Keep using
`..\start-dev.ps1` (or `uv run uvicorn src.api:app --reload` and
`corepack yarn dev` directly) exactly as before.
