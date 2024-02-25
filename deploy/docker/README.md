# Deployment with Docker
The easiest method to try out Logicle is by using a Docker container.

## Prerequisites

- **Basic knowledge of Docker**
- **Docker Installation:** Ensure Docker is installed on your system. If it is not, please refer to the [installation guide](https://docs.docker.com/get-docker/).
- **RAM:**: 500 MB of free RAM
- **Storage:** 300 MB of free space on disk

## Deploy using SQLite as database
By default, the Docker container uses an embedded SQLite database, so no external database is required.

```bash
# Start Logicle with SQLite, without data persistence
docker run -d --name logicle \
-p 3000:3000 \
ghcr.io/logicleai/logicle:latest
```

After starting, the application will be accessible at http://localhost:3000, where you can create your first user.

To maintain the SQLite database data between container restarts, you should bind mount the directory that contains the SQLite database to your machine's filesystem using the command below:

```bash
# Start Logicle with SQLite, with data persistence
docker run -d --name logicle \
-v "$(pwd)"/logicle:/data/ \
-p 3000:3000 \
ghcr.io/logicleai/logicle:latest
```

This command ensures that your data persists across container restarts by storing it in a specified directory on your machine.