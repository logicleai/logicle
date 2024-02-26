# Logicle Self-Hosting Documentation

This document outlines the steps and requirements for self-hosting the Logicle application. Based on your infrastructure and scalability needs, select the appropriate hosting platform.

## Hosting Platforms Overview

### Docker
Deploy Logicle in a scalable and isolated environment using Docker.
- [Docker Deployment Guide](./docker/README.md) 🐳

### Docker Compose
For a simplified setup of multi-container Docker applications, leverage Docker Compose.
- [Docker Compose Setup Instructions](./docker-compose/README.md) 📦

### Kubernetes with Helm Chart
For deployment on Kubernetes clusters utilizing Helm Charts, please note this option is in development.
- [Status: Coming Soon](#) ⚓

## Supported Databases

Logicle is compatible with various database engines, allowing flexibility in data management:

### SQLite
- Recommended for individual, family, or small business applications.
- Offers a straightforward setup without the need for additional external dependencies.

### PostgreSQL
- Ideal for larger, enterprise-level environments.
- Capable of supporting hundreds of users simultaneously with robust performance.