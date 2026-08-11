#!/bin/sh
set -e

export MAPBOX_ACCESS_TOKEN=$(aws ssm get-parameter --name "/group-chat-solver/prod/mapbox-access-token" --with-decryption --query "Parameter.Value" --output text)
export TAVILY_API_KEY=$(aws ssm get-parameter --name "/group-chat-solver/prod/tavily-api-key" --with-decryption --query "Parameter.Value" --output text)
export LANGSMITH_API_KEY=$(aws ssm get-parameter --name "/group-chat-solver/prod/langsmith-api-key" --with-decryption --query "Parameter.Value" --output text)
export LANGSMITH_TRACING=true
export DEV_MODE=false
export LOG_DIR=/tmp/logs/runs

exec "$@"
