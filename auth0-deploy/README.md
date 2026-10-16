# Auth0 tenant deployment

This directory contains the Auth0 Deploy CLI configuration for the Kindred
tenant. The export is intended for reviewable, repeatable tenant changes; it
does not contain deployment credentials.

## Required configuration

Copy `.env.example` to `.env` and provide a dedicated Auth0 Deploy CLI
machine-to-machine application's client secret. Do not commit `.env` or any
other credential file.

The application runtime uses the same tenant values through the root
environment variables documented in `.env.example`:

- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID`
- `VITE_AUTH0_AUDIENCE`
- `AUTH0_DOMAIN`
- `AUTH0_AUDIENCE`

The API server also needs the **Kindred Account Deletion** machine-to-machine
application declared in `local/tenant.yaml`. Its only grant is the Management
API `delete:users` scope, which account deletion uses to remove the user's
Auth0 record. After importing, copy its client ID and secret into the runtime
`AUTH0_MGMT_CLIENT_ID` and `AUTH0_MGMT_CLIENT_SECRET`, and set
`AUTH0_MGMT_DOMAIN` to the tenant's canonical domain
(`dev-4c281gnuylq4hccq.ca.auth0.com`), because the Management API does not
answer on the custom sign-in domain.

The API audience configured by this export is
`https://kindred-asterling-ai-coaching.com/api`.

## Applying the export

Run the Auth0 Deploy CLI from this directory after reviewing the target
tenant and setting the required environment variables:

```sh
npx auth0-deploy-cli import \
  --config_file config.json \
  --input_file local/tenant.yaml
```

The focused configuration files are available for safer, scoped operations:

- `config.clients.json`
- `config.databases.json`
- `config.resources.json`
- `api-patch.yaml`

The tenant export intentionally omits the old custom database login scripts
from the attached bundle. Those scripts used localhost endpoints and embedded
credentials, and the current application authenticates through Auth0 Universal
Login and the Auth0 API.
