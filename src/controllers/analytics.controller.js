import { PrismaClient, TenantPlan, TransactionType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /analytics/summary
 * Returns basic counts and sums, only accessible to PRO tenants.
 */
export const getAnalyticsSummary = async (req, res) => {
    const tenantId = req.tenant.id;
    const tenantPlan = req.tenant.plan;

    // 1. Feature Difference: PRO check
    if (tenantPlan !== TenantPlan.PRO) {
        return res.status(403).json({
            error: 'Plan Restricted',
            message: 'Analytics Summary is a PRO-plan feature. Upgrade your tenant to access this endpoint.'
        });
    }

    try {
        // 2. Simple Analytics (Row-Level Isolation enforced by tenantId)
        
        // Count non-soft-deleted materials
        const materialCount = await prisma.material.count({
            where: { tenantId: tenantId, deletedAt: null },
        });

        // Sum of all IN and OUT transactions
        const totalIn = await prisma.transaction.aggregate({
            _sum: { quantity: true },
            where: { tenantId: tenantId, type: TransactionType.IN },
        });

        const totalOut = await prisma.transaction.aggregate({
            _sum: { quantity: true },
            where: { tenantId: tenantId, type: TransactionType.OUT },
        });
        
        const totalQuantityIn = totalIn._sum.quantity || 0;
        const totalQuantityOut = totalOut._sum.quantity || 0;

        return res.json({
            tenantId: tenantId,
            materialCount: materialCount,
            totalQuantityIn: totalQuantityIn,
            totalQuantityOut: totalQuantityOut,
            netStockMovement: totalQuantityIn - totalQuantityOut,
        });

    } catch (error) {
        console.error('Error fetching analytics:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};