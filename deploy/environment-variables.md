# Logicle Environment Variables

Logicle has been crafted to simplify its adoption, emphasizing ease of use. A significant portion of system configurations, including the addition of LLM providers and setting up SSO integrations, can be managed through the admin web UI, eliminating the need for environment variable adjustments during deployment.

However, certain core configurations, particularly those related to the database, require explicit environment variable settings.

The following table outlines all available environment settings in Logicle:

## General
| Variable Name           | Description                                                                 | Default Value          |
|-------------------------|-----------------------------------------------------------------------------|------------------------|
| PORT                  | The port on which the Next.js production server runs.                       | 3000                 |
| NEXTAUTH_URL          | The URL for NextAuth, required for localhost setups.                        | `http://localhost:3000`|
| APP_URL               | The application URL, crucial for localhost environments.                    | `http://localhost:3000`|
| NEXTAUTH_SECRET       | A secret key for NextAuth, generated using `openssl rand -base64 32`.       |           |
| DB_ENGINE             | The database engine to use, options are `postgres` or `sqlite`.             | sqlite               |
| DATABASE_URL          | The database connection URL. For Docker, refer to `docker-compose.yml`.     | `file:///data/sqlite/logicle.sqlite`|
| FILE_STORAGE_LOCATION | The location for storing files on the server.                               | `/data/files`   |