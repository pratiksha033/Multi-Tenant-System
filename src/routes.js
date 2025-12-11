import { Router } from 'express';
import { createTenant } from './controllers/tenant.controller.js';
import { 
    createMaterial, 
    listMaterials, 
    getMaterialById, 
    createTransaction,
    softDeleteMaterial 
} from './controllers/material.controller.js';
import { getAnalyticsSummary } from './controllers/analytics.controller.js';
import { tenantAuthMiddleware, roleCheckMiddleware } from './middleware/tenant-auth.js';

const router = Router();

// --- 1. Tenant Setup (No Auth Required) ---
// POST /tenants -> Create a tenant and initial ADMIN user
router.post('/tenants', createTenant);


// --- 2. Tenant-Scoped APIs (Auth Required for all below) ---
// All routes below use the tenantAuthMiddleware to guarantee RLS context (req.tenant, req.user)

// Materials
router.post('/materials', 
    tenantAuthMiddleware,
    roleCheckMiddleware('ADMIN'), // Bonus: RBAC - Only ADMIN can create materials
    createMaterial
);

router.get('/materials', 
    tenantAuthMiddleware, 
    listMaterials // Bonus: Search & Filters implemented inside
);

router.get('/materials/:id', 
    tenantAuthMiddleware, 
    getMaterialById
);

router.delete('/materials/:id', 
    tenantAuthMiddleware, 
    roleCheckMiddleware('ADMIN'), // RBAC: Only ADMIN can delete
    softDeleteMaterial // Bonus: Soft Delete
);

// Transactions
router.post('/materials/:id/transactions', 
    tenantAuthMiddleware, 
    // Allowing USER role to create transactions
    createTransaction
);

// Analytics
router.get('/analytics/summary', 
    tenantAuthMiddleware, 
    // PRO-only check is handled inside the controller
    getAnalyticsSummary
);


export default router;