import { PrismaClient, TransactionType, TenantPlan } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schemas for validation
const createMaterialSchema = z.object({
    name: z.string().min(1).max(100),
    unit: z.string().min(1).max(20),
});

const createTransactionSchema = z.object({
    type: z.nativeEnum(TransactionType),
    quantity: z.number().positive(),
});

/**
 * POST /materials
 * Creates a new material, enforcing FREE plan limits and ADMIN role.
 */
export const createMaterial = async (req, res) => {
    const tenantId = req.tenant.id;
    const tenantPlan = req.tenant.plan;

    // 1. Validate Input
    const validatedBody = createMaterialSchema.safeParse(req.body);
    if (!validatedBody.success) {
        return res.status(400).json({ error: 'Validation Error', details: validatedBody.error.errors });
    }
    const { name, unit } = validatedBody.data;

    // 2. Tenant-Specific Behavior: FREE plan limit check
    if (tenantPlan === TenantPlan.FREE) {
        // Query only non-soft-deleted materials
        const materialCount = await prisma.material.count({
            where: {
                tenantId: tenantId,
                deletedAt: null, 
            },
        });

        const MAX_FREE_MATERIALS = 5;
        if (materialCount >= MAX_FREE_MATERIALS) {
            return res.status(403).json({
                error: 'Plan Limit Exceeded',
                message: `FREE plan tenants are limited to ${MAX_FREE_MATERIALS} materials. Upgrade to PRO to add more.`
            });
        }
    }

    try {
        // 3. Create Material (Row-Level Isolation by tenantId)
        const newMaterial = await prisma.material.create({
            data: {
                tenantId,
                name,
                unit,
                currentStock: 0,
            },
        });

        return res.status(201).json(newMaterial);
    } catch (error) {
        if (error.code === 'P2002') { // Prisma unique constraint violation (tenantId, name)
            return res.status(409).json({ error: 'Conflict', message: `Material with name '${name}' already exists in this tenant.` });
        }
        console.error('Error creating material:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /materials
 * Lists all materials for the current tenant.
 */
export const listMaterials = async (req, res) => {
    const tenantId = req.tenant.id;
    const { name, unit } = req.query; // Bonus: Search & Filters

    const whereClause = {
        tenantId: tenantId,
        deletedAt: null, // Bonus: Soft Delete - only return non-deleted
    };

    if (name) {
        whereClause.name = { contains: name, mode: 'insensitive' };
    }
    if (unit) {
        whereClause.unit = { equals: unit, mode: 'insensitive' };
    }

    try {
        // 1. List Materials (Row-Level Isolation & Filtering)
        const materials = await prisma.material.findMany({
            where: whereClause,
            // Bonus: Sorting by creation date
            orderBy: { createdAt: 'desc' } 
        });

        return res.json(materials);
    } catch (error) {
        console.error('Error listing materials:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /materials/:id
 * Gets a single material and its recent transactions for the current tenant.
 */
export const getMaterialById = async (req, res) => {
    const tenantId = req.tenant.id;
    const materialId = req.params.id;

    try {
        // 1. Find Material (Strict RLS: Must match both ID and tenantId)
        const material = await prisma.material.findFirst({
            where: {
                id: materialId,
                tenantId: tenantId,
                deletedAt: null, // Bonus: Soft Delete
            },
            include: {
                // Include Transactions, also automatically scoped by materialId
                transactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 10, // Limit transactions for performance
                }
            }
        });

        if (!material) {
            return res.status(404).json({ error: 'Not Found', message: 'Material not found or does not belong to your tenant.' });
        }

        return res.json(material);
    } catch (error) {
        console.error('Error fetching material:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /materials/:id/transactions
 * Creates a new transaction and updates the material stock atomically.
 */
export const createTransaction = async (req, res) => {
    const tenantId = req.tenant.id;
    const materialId = req.params.id;

    // 1. Validate Input
    const validatedBody = createTransactionSchema.safeParse(req.body);
    if (!validatedBody.success) {
        return res.status(400).json({ error: 'Validation Error', details: validatedBody.error.errors });
    }
    const { type, quantity } = validatedBody.data;

    // Prisma Transaction ensures atomicity 
    try {
        const material = await prisma.material.findFirst({
            where: { id: materialId, tenantId: tenantId, deletedAt: null },
        });

        if (!material) {
            return res.status(404).json({ error: 'Not Found', message: 'Material not found or does not belong to your tenant.' });
        }

        const preTransactionStock = material.currentStock;
        let newStock;

        if (type === TransactionType.IN) {
            newStock = preTransactionStock + quantity;
        } else {
            // Check for negative stock
            if (preTransactionStock < quantity) {
                return res.status(400).json({ 
                    error: 'Insufficient Stock', 
                    message: `Cannot process OUT transaction. Current stock is ${preTransactionStock} ${material.unit}, but tried to consume ${quantity}.` 
                });
            }
            newStock = preTransactionStock - quantity;
        }

        const [updatedMaterial, newTransaction] = await prisma.$transaction([
            // Update the material stock
            prisma.material.update({
                where: { id: materialId },
                data: { currentStock: newStock },
            }),
            // Create the transaction record
            prisma.transaction.create({
                data: {
                    tenantId: tenantId, // RLS for transaction
                    materialId,
                    type,
                    quantity,
                    preTransactionStock,
                },
            }),
        ]);

        return res.status(201).json({ 
            material: { id: updatedMaterial.id, currentStock: updatedMaterial.currentStock },
            transaction: newTransaction
        });

    } catch (error) {
        console.error('Error creating transaction:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /materials/:id
 * Implements Soft Delete: marks the material as deleted instead of removing it.
 */
export const softDeleteMaterial = async (req, res) => {
    const tenantId = req.tenant.id;
    const materialId = req.params.id;

    try {
        // Find material to ensure it exists and belongs to the tenant
        const material = await prisma.material.findFirst({
            where: { id: materialId, tenantId: tenantId, deletedAt: null },
        });

        if (!material) {
            return res.status(404).json({ error: 'Not Found', message: 'Material not found or already deleted.' });
        }

        // Perform the soft delete (update deletedAt field)
        const softDeletedMaterial = await prisma.material.update({
            where: { id: materialId },
            data: { deletedAt: new Date() },
        });

        return res.json({ 
            message: `Material '${softDeletedMaterial.name}' successfully soft-deleted.`,
            id: softDeletedMaterial.id,
            deletedAt: softDeletedMaterial.deletedAt 
        });

    } catch (error) {
        console.error('Error soft deleting material:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};