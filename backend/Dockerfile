FROM public.ecr.aws/docker/library/python:3.12-slim

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

RUN pip install --no-cache-dir uv awscli

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY src ./src
COPY sample-data ./sample-data
COPY lambda-entrypoint.sh ./
RUN chmod +x lambda-entrypoint.sh

ENV PATH="/app/.venv/bin:${PATH}"
ENV PORT=8000
ENV AWS_LWA_INVOKE_MODE=response_stream
ENV AWS_LWA_READINESS_CHECK_PATH=/api/people

ENTRYPOINT ["./lambda-entrypoint.sh"]
CMD ["uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8000"]
