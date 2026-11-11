FROM python:3.12-slim

WORKDIR /app
COPY . .
RUN python build.py

ENV PYTHONUNBUFFERED=1
CMD ["python", "serve.py"]
