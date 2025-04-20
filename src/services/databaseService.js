import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

/**
 * Create a new user
 */
async function createUser(userData) {
  return prisma.user.create({
    data: {
      user_id: userData.user_id || uuidv4(),
      name: userData.name,
      email: userData.email,
      phone: userData.phone || null,
    },
  });
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
  return prisma.user.findUnique({
    where: { user_id: userId },
    include: {
      endpoints: true,
    },
  });
}

/**
 * Save API endpoint data
 */
async function saveApiEndpoint(endpointData) {
  return prisma.apiEndpoint.create({
    data: {
      method: endpointData.method,
      full_path: endpointData.full_path,
      summary: endpointData.summary,
      request_body: endpointData.request_body,
      request_headers: endpointData.request_headers
        ? JSON.parse(endpointData.request_headers)
        : null,
      total_requests: endpointData.total_requests,
      threads: endpointData.threads,
      load_status: endpointData.load_status,
      user_id: endpointData.user_id,
    },
  });
}

/**
 * Update API endpoint status
 */
async function updateApiEndpointStatus(id, loadStatus) {
  return prisma.apiEndpoint.update({
    where: { id },
    data: { load_status: loadStatus },
  });
}

/**
 * Get all API endpoints for a user
 */
async function getApiEndpointsByUserId(userId) {
  return prisma.apiEndpoint.findMany({
    where: { user_id: userId },
  });
}

// Export the service as a plain object
export const databaseService = {
  createUser,
  getUserById,
  saveApiEndpoint,
  updateApiEndpointStatus,
  getApiEndpointsByUserId,
};
