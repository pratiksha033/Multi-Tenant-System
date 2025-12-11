# Carboledger Backend Intern Assignment – Multi-Tenant Material Inventory API

A fully functional multi-tenant Material Inventory backend, built using Node.js (ESM), Express, Prisma, and PostgreSQL.
This project demonstrates tenant isolation, RBAC, tenant-specific plan behavior, soft deletion, and analytics.

# 🚀 Tech Stack

Node.js (ES Modules)

Express.js

Prisma ORM

PostgreSQL (via Docker)

JavaScript

Nodemon (dev)



# Create .env file:
    ```bash
      DATABASE_URL="postgresql://postgres:password@localhost:5432/carboledger_mt?schema=public"
      PORT=3000

# Start PostgreSQL (Docker)

     Run PostgreSQL:

    docker run --name carboledger-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:latest


# Create the DB:

    docker exec -it carboledger-postgres bash
    psql -U postgres
    CREATE DATABASE carboledger_mt;
    \q
    exit

# Install Dependencies & Migrate
     npm install
    npx prisma migrate dev --name init
    npm run dev


# API runs at:
        
    http://localhost:3000

# 📌 API Endpoints

All APIs require headers (except /tenants):

    Tenant-ID: <tenant-id>
    User-ID: <user-id>
