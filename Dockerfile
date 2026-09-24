FROM node:20-slim AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.11-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY --from=frontend-build /app/out ./out
EXPOSE 10000
CMD ["gunicorn","backend.main:app","-k","uvicorn.workers.UvicornWorker","--bind","0.0.0.0:10000","--timeout","300"]