import { PrismaClient, TenantPlan } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Zod schema for input validation
const tenantSchema = z.object({
    name: z.string().min(3),
    plan: z.nativeEnum(TenantPlan).default(TenantPlan.FREE),
});

const userSchema = z.object({
    email: z.string().email(),
    name: z.string().min(3),
});

/**
 * POST /tenants
 * Creates a new tenant and a default ADMIN user for that tenant.
 */
export const createTenant = async (req, res) => {
    try {
        const { name, plan } = tenantSchema.parse(req.body);
        const { email, name: userName } = userSchema.parse(req.body.admin);
        
        const newTenant = await prisma.tenant.create({
            data: {
                name,
                plan,
                users: {
                    create: {
                        email,
                        name: userName,
                        role: 'ADMIN', // The first user is always an ADMIN
                    }
                }
            },
            include: { users: true }
        });

        const adminUser = newTenant.users[0];

        // IMPORTANT: Return the IDs needed for testing
        return res.status(201).json({
            message: 'Tenant and initial Admin user created successfully. Use these IDs in subsequent requests.',
            tenantId: newTenant.id,
            adminUserId: adminUser.id,
            tenant: {
                name: newTenant.name,
                plan: newTenant.plan
            },
            instructions: {
                // How to use the tenant's auth details
                header1: "Tenant-ID: " + newTenant.id,
                header2: "User-ID: " + adminUser.id,
            }
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: error.errors });
        }
        
        // --- FIX: Detailed error handling for P2002 constraint violations ---
        if (error.code === 'P2002') { 
            const target = error.meta.target;
            let message = 'A conflict occurred.';

            if (Array.isArray(target) && target.includes('name')) {
                message = 'The tenant name already exists. Please choose a different name.';
            } else if (Array.isArray(target) && target.includes('email')) {
                message = 'The admin email address provided is already in use globally. Please use a unique email.';
            } else {
                // Fallback for other unique constraints
                message = `Conflict on unique field(s): ${Array.isArray(target) ? target.join(', ') : target}.`;
            }
            
            return res.status(409).json({ error: 'Conflict', message: message });
        }
        // --- END FIX ---
        
        console.error('Error creating tenant:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};