# ecommerce-gitops-app

Application code and CI for the Capstone 2 GitOps platform.
Full documentation lives in the config repo:
https://github.com/Thormie-Harshey/ecommerce-gitops-config

## Application

Three Node.js services communicate over HTTP:

- **gateway**: single entry point; forwards /products and /orders.
- **product**: product catalogue in PostgreSQL, cached in Redis (cache-aside).
- **order**: creates orders after checking the product with the product service.

Each service exposes /health and /metrics, writes JSON logs (pino),
and sends traces with OpenTelemetry.

Each service is split into `app.js` (routes) and `index.js` (start-up).
The routes receive their database, cache and service addresses as
inputs (dependency injection), so unit tests replace them with mocks.

## CI pipeline

On every push to main: lint, unit tests, Trivy scan of libraries and
secrets, build, Trivy scan of the image, push to Docker Hub. Any
CRITICAL finding stops the pipeline. Images are tagged with the commit ID.
