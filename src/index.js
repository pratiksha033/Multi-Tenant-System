import express from 'express';
import { PrismaClient } from '@prisma/client';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import apiRoutes from './routes.js'; // Note the .js extension for ES modules

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Global Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'Carboledger Multi-Tenant API (JS/ESM)' });
});

// Primary API Routes
app.use('/', apiRoutes);

// Server Startup Function
const startServer = async () => {
    try {
        await prisma.$connect();
        console.log('Database connection successful.');
        
        app.listen(port, () => {
            console.log(`Server is running at http://localhost:${port}`);
            console.log('---');
            console.log('Setup Endpoint: POST /tenants');
            console.log('Data Endpoints require Tenant-ID and User-ID headers.');
        });
    } catch (error) {
        console.error('Failed to start server or connect to DB:', error);
        process.exit(1);
    }
};

startServer();