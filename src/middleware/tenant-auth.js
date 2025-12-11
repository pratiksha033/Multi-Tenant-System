import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Middleware to authenticate the tenant and user from headers
 * and enforce row-level access control via request context.
 */
export const tenantAuthMiddleware = async (req, res, next) => {
  // In JavaScript, we rely on JSDoc comments for clarity instead of TypeScript types.
  // req will be extended with req.tenant and req.user objects.
  
  const tenantId = req.headers['tenant-id'];
  const userId = req.headers['user-id']; // Mock authentication

  if (!tenantId || !userId) {
    return res.status(401).json({ 
      error: 'Authentication Required',
      message: 'Missing Tenant-ID or User-ID headers. All inventory operations must be tenant-scoped.' 
    });
  }

  try {
    // 1. Fetch Tenant
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant Not Found', message: 'The provided Tenant-ID does not correspond to an active company.' });
    }

    // 2. Fetch User (must belong to the fetched tenant)
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId: tenantId },
    });

    if (!user) {
      return res.status(403).json({ error: 'User Access Denied', message: 'User not found or does not belong to the specified tenant.' });
    }

    // Attach both to the request for controllers to use
    req.tenant = tenant;
    req.user = user;
    
    next();

  } catch (error) {
    console.error('Tenant Auth Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Could not process authentication.' });
  }
};

/**
 * Middleware for Role-Based Access Control (RBAC)
 * @param {('ADMIN'|'USER')} requiredRole The minimum role required for the action.
 */
export const roleCheckMiddleware = (requiredRole) => {
    return (req, res, next) => {
        const userRole = req.user.role;
        
        // Simple check: ADMIN > USER
        if (requiredRole === 'ADMIN' && userRole !== 'ADMIN') {
            return res.status(403).json({ 
                error: 'Authorization Required', 
                message: `Action forbidden. Only ${requiredRole} users can perform this operation.` 
            });
        }
        next();
    }
}